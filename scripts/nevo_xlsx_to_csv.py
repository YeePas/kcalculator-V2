#!/usr/bin/env python3
"""Convert the NEVO2025 Excel sheet to a plain CSV for db-beheer.html.

Usage:
  python3 scripts/nevo_xlsx_to_csv.py "/path/to/NEVO2025_v9.0.xlsx" /tmp/nevo2025.csv
"""

from __future__ import annotations

import csv
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def col_to_num(col: str) -> int:
    value = 0
    for ch in col:
      if ch.isalpha():
        value = value * 26 + ord(ch.upper()) - 64
    return value


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for item in root:
        text = "".join(node.text or "" for node in item.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"))
        values.append(text)
    return values


def read_sheet_rows(archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[str]]:
    sheet = ET.fromstring(archive.read(sheet_path))
    rows: list[list[str]] = []
    for row in sheet.find("a:sheetData", NS):
        values: dict[int, str] = {}
        for cell in row.findall("a:c", NS):
            ref = cell.attrib.get("r", "")
            col = "".join(ch for ch in ref if ch.isalpha())
            value_node = cell.find("a:v", NS)
            if not col or value_node is None:
                continue
            value = value_node.text or ""
            if cell.attrib.get("t") == "s":
                value = shared_strings[int(value)]
            values[col_to_num(col)] = value
        max_col = max(values) if values else 0
        rows.append([values.get(i, "") for i in range(1, max_col + 1)])
    return rows


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip())
        return 1

    input_path = Path(sys.argv[1]).expanduser()
    output_path = Path(sys.argv[2]).expanduser()
    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(input_path) as archive:
        shared_strings = load_shared_strings(archive)
        rows = read_sheet_rows(archive, "xl/worksheets/sheet1.xml", shared_strings)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerows(rows)

    print(f"Wrote {len(rows)} rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
