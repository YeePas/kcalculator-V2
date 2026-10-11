#!/usr/bin/env python3
"""Convert the NEVO-online CSV (RIVM) into data/nevo-2025.json for the product build.

Usage:
  python3 scripts/build_nevo.py "/path/to/NEVO2025_v9.0.csv" [data/nevo-2025.json]

NEVO-online may only be used in unchanged form and with attribution
("NEVO-online versie 2025/9.0, RIVM, Bilthoven"), so values are copied as published:
no rounding, conversion or derived fields. Empty cells (unknown) are left out.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

SOURCE = "NEVO-online versie 2025/9.0, RIVM, Bilthoven"

# products.json key -> NEVO column. k/kh/v/e/vz are the core values the app has always used.
CORE = {
    "k": "ENERCC (kcal)",
    "kh": "CHO (g)",
    "v": "FAT (g)",
    "e": "PROT (g)",
    "vz": "FIBT (g)",
}
EXTRA = {
    "su": "SUGAR (g)",       # sugars
    "vv": "FASAT (g)",       # saturated fat
    "na": "NA (mg)",         # sodium (NEVO gives sodium, not salt)
}
MICROS = {
    "vitd": "VITD (µg)",
    "fe": "FE (mg)",
    "ca": "CA (mg)",
    "b12": "VITB12 (µg)",
    "vitc": "VITC (mg)",
    "zn": "ZN (mg)",
    "mg": "MG (mg)",
    "fol": "FOL (µg)",
}


def number(value: str):
    value = (value or "").strip().replace(",", ".")
    if not value:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    return int(parsed) if parsed.is_integer() else parsed


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2] if len(sys.argv) > 2 else "data/nevo-2025.json")

    with src.open(encoding="utf-8-sig", errors="strict", newline="") as handle:
        rows = list(csv.DictReader(handle, delimiter="|"))

    groups: list[str] = []
    items = []
    for row in rows:
        group = row["Voedingsmiddelgroep"].strip()
        if group not in groups:
            groups.append(group)
        item = {
            "c": row["NEVO-code"].strip(),
            "n": row["Voedingsmiddelnaam/Dutch food name"].strip(),
            "s": row["Synoniem"].strip(),
            "g": groups.index(group),
        }
        for key, column in {**CORE, **EXTRA}.items():
            value = number(row.get(column))
            if value is not None:
                item[key] = value
        micros = {key: number(row.get(column)) for key, column in MICROS.items()}
        micros = {key: value for key, value in micros.items() if value is not None}
        if micros:
            item["m"] = micros
        items.append(item)

    version = rows[0]["NEVO-versie/NEVO-version"].strip() if rows else ""
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"source": SOURCE, "version": version, "groups": groups, "items": items},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{out}: {len(items)} NEVO items, {len(groups)} groups ({version})")


if __name__ == "__main__":
    main()
