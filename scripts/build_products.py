#!/usr/bin/env python3
"""Rebuild public/products.json from NEVO + Dutch Open Food Facts products.

Usage:
  python3 scripts/build_products.py path/to/food.parquet [--max-off 20000] [--report build/report.md]

Inputs
  food.parquet             Open Food Facts export (huggingface.co/datasets/openfoodfacts/product-database)
  data/nevo-2025.json      NEVO-online, converted unchanged by scripts/build_nevo.py
  public/products.json     previous build, used to keep familiar products and for the report

Afterwards run `node scripts/validate_products.mjs`: it fixes kJ stored as kcal, flags doubtful
values, applies data/product-corrections.json and stamps the version.

Selection of Open Food Facts products
  - sold in the Netherlands (countries_tags contains en:netherlands; products sold in more
    countries count too), with a name and kcal, carbs, fat and protein per 100 g
  - one product per barcode, and per name + brand the most complete/popular one
  - at most --max-off products (the database lives in browser storage, ~5 MB), ranked by:
    already in the previous build, scan count when the export has it, Dutch name, completeness
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import duckdb

NUTRIENTS = {
    "kcal": "energy-kcal",
    "kj": "energy-kj",
    "energy": "energy",          # kJ in Open Food Facts
    "kh": "carbohydrates",
    "v": "fat",
    "e": "proteins",
    "vz": "fiber",
    "su": "sugars",
    "vv": "saturated-fat",
    "zo": "salt",
}


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9à-ÿ ]", " ", str(value or "").lower())).strip()


def r1(value):
    return None if value is None else round(float(value), 1)


def column_types(con, source: str) -> dict[str, str]:
    return {name: typ for name, typ, *_ in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{source}')").fetchall()}


def load_off(source: str) -> list[dict]:
    con = duckdb.connect()
    types = column_types(con, source)
    if not types.get("nutriments", "").endswith("[]"):
        raise SystemExit(f"Unexpected nutriments type: {types.get('nutriments')}")

    def nutrient(name: str) -> str:
        return f"list_filter(nutriments, x -> x.name = '{name}')[1].\"100g\""

    scans = "unique_scans_n" if "unique_scans_n" in types else ("scans_n" if "scans_n" in types else "NULL")
    name_list = "product_name" if types.get("product_name", "").endswith("[]") else None
    if name_list:
        name_sql = """coalesce(
            list_filter(product_name, x -> x.lang = 'nl' AND trim(x.text) <> '')[1].text,
            list_filter(product_name, x -> x.lang = 'main' AND trim(x.text) <> '')[1].text,
            list_filter(product_name, x -> trim(x.text) <> '')[1].text)"""
        has_nl_sql = "len(list_filter(product_name, x -> x.lang = 'nl' AND trim(x.text) <> '')) > 0"
    else:
        name_sql, has_nl_sql = "product_name", "false"

    nutrient_cols = ",\n      ".join(f"{nutrient(off)} AS {key}" for key, off in NUTRIENTS.items())
    query = f"""
    SELECT
      code,
      trim({name_sql}) AS name,
      {has_nl_sql} AS has_nl,
      trim(brands) AS brands,
      try_cast(serving_quantity AS DOUBLE) AS serving,
      completeness,
      {scans} AS scans,
      last_modified_t,
      {nutrient_cols}
    FROM read_parquet('{source}')
    WHERE list_contains(countries_tags, 'en:netherlands')
    """
    columns = [d[0] for d in con.execute(query + " LIMIT 0").description]
    rows = con.execute(query).fetchall()
    return [dict(zip(columns, row)) for row in rows]


def to_item(row: dict) -> dict | None:
    name = (row.get("name") or "").strip()
    if not name or len(name) > 80:
        return None
    kcal = row.get("kcal")
    if kcal is None:
        kj = row.get("kj") if row.get("kj") is not None else row.get("energy")
        kcal = kj / 4.184 if kj is not None else None
    if kcal is None or any(row.get(key) is None for key in ("kh", "v", "e")):
        return None
    item = {
        "n": name,
        "b": (row.get("brands") or "").split(",")[0].strip()[:40],
        "c": str(row.get("code") or "").strip(),
        "k": r1(kcal),
        "kh": r1(row["kh"]),
        "v": r1(row["v"]),
        "e": r1(row["e"]),
        "vz": r1(row.get("vz") or 0),
        "src": "off",
    }
    for key in ("su", "vv", "zo"):
        if row.get(key) is not None:
            item[key] = r1(row[key])
    serving = row.get("serving")
    if serving and 0 < serving < 2000:
        item["sg"] = round(serving)
    if not item["b"]:
        del item["b"]
    if not item["c"]:
        del item["c"]
    return item


def select_off(rows: list[dict], previous_keys: set[str], max_off: int) -> tuple[list[dict], dict]:
    stats = {"nl_rows": len(rows), "usable": 0, "duplicates": 0}
    candidates = []
    for row in rows:
        item = to_item(row)
        if not item:
            continue
        stats["usable"] += 1
        key = f"{norm(item['n'])}|{norm(item.get('b'))}"
        rank = (
            1 if key in previous_keys else 0,
            row.get("scans") or 0,
            1 if row.get("has_nl") else 0,
            row.get("completeness") or 0,
            row.get("last_modified_t") or 0,
        )
        candidates.append((rank, key, item))

    candidates.sort(key=lambda entry: entry[0], reverse=True)
    seen_codes, seen_keys, chosen = set(), set(), []
    for _, key, item in candidates:
        code = item.get("c")
        if (code and code in seen_codes) or key in seen_keys:
            stats["duplicates"] += 1
            continue
        if code:
            seen_codes.add(code)
        seen_keys.add(key)
        chosen.append(item)
    stats["unique"] = len(chosen)
    stats["kept"] = min(len(chosen), max_off)
    return chosen[:max_off], stats


def nevo_items(path: Path) -> tuple[list[str], list[dict], str]:
    nevo = json.loads(path.read_text(encoding="utf-8"))
    items = []
    for item in nevo["items"]:
        entry = {key: value for key, value in item.items() if key != "c"}
        entry["src"] = "rivm"
        items.append(entry)
    return nevo["groups"], items, nevo.get("source", "")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("parquet")
    parser.add_argument("--nevo", default="data/nevo-2025.json")
    parser.add_argument("--previous", default="public/products.json")
    parser.add_argument("--out", default="public/products.json")
    parser.add_argument("--max-off", type=int, default=20000)
    parser.add_argument("--report", default="build/products-report.md")
    args = parser.parse_args()

    previous = json.loads(Path(args.previous).read_text(encoding="utf-8")) if Path(args.previous).exists() else {"items": []}
    previous_off = {f"{norm(i['n'])}|{norm(i.get('b'))}": i for i in previous["items"] if i.get("src") == "off"}

    groups, nevo, nevo_source = nevo_items(Path(args.nevo))
    off, stats = select_off(load_off(args.parquet), set(previous_off), args.max_off)

    out = {"groups": groups, "items": nevo + off}
    Path(args.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    new_keys = {f"{norm(i['n'])}|{norm(i.get('b'))}" for i in off}
    added = len(new_keys - set(previous_off))
    dropped = len(set(previous_off) - new_keys)
    size_mb = Path(args.out).stat().st_size / 1024 / 1024
    report = f"""## Productdatabase opnieuw opgebouwd

| | Aantal |
|---|---:|
| NEVO ({nevo_source}) | {len(nevo):,} |
| Open Food Facts: Nederlandse producten in export | {stats['nl_rows']:,} |
| … met naam en kcal/koolhydraten/vet/eiwit | {stats['usable']:,} |
| … uniek (barcode en naam+merk) | {stats['unique']:,} |
| … opgenomen (max {args.max_off:,}) | {stats['kept']:,} |
| Nieuw t.o.v. vorige versie | {added:,} |
| Niet meer opgenomen | {dropped:,} |
| Bestandsgrootte (vóór validatie) | {size_mb:.2f} MB |

Na dit script draait `scripts/validate_products.mjs` (kJ-correctie, twijfelmarkering, handmatige correcties, versie).
"""
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
