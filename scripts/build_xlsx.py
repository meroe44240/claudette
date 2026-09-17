#!/usr/bin/env python3
"""Build the consolidated XLSX workbook from the five delivered CSVs.

Prints only counters, never row content.
"""
import csv
import os
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

DATE = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "outputs")

HDR_FILL = PatternFill("solid", fgColor="1F4E79")
HDR_FONT = Font(color="FFFFFF", bold=True)
GREEN = PatternFill("solid", fgColor="C6EFCE")
RED = PatternFill("solid", fgColor="FFC7CE")

SHEETS = [
    ("Valentin - Finance", f"finance_{DATE}.csv"),
    ("Valentin - Hospitality", f"hospitality_{DATE}.csv"),
    ("Alexis - Industrie", f"industrie_{DATE}.csv"),
    ("Louis - Sales SaaS", f"sales_saas_{DATE}.csv"),
    ("Méroë - Sales", f"sales_{DATE}.csv"),
]


def load(path):
    if not os.path.exists(path):
        return [], []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rdr = csv.reader(fh, delimiter=";")
        rows = list(rdr)
    return (rows[0], rows[1:]) if rows else ([], [])


def autosize(ws, header, rows):
    for i, _ in enumerate(header, start=1):
        longest = max([len(str(header[i - 1]))] +
                      [len(str(r[i - 1])) for r in rows if len(r) >= i] or [0])
        ws.column_dimensions[get_column_letter(i)].width = min(max(longest + 2, 10), 60)


wb = Workbook()

# --- Synthese tab ---------------------------------------------------------------
ws = wb.active
ws.title = "Synthese"
report = os.path.join(OUT, f"rapport_synthese_{DATE}.md")
lines = []
if os.path.exists(report):
    lines = open(report, encoding="utf-8").read().splitlines()
else:
    lines = [f"# Market mapping {DATE}", "", "(rapport de synthèse non disponible)"]

for r, line in enumerate(lines, start=1):
    c = ws.cell(row=r, column=1, value=line)
    if line.startswith("# "):
        c.font = Font(bold=True, size=14, color="1F4E79")
    elif line.startswith("## "):
        c.font = Font(bold=True, size=12, color="1F4E79")
    elif line.startswith("### "):
        c.font = Font(bold=True, size=11)
    c.alignment = Alignment(vertical="top", wrap_text=False)
ws.column_dimensions["A"].width = 120
ws.freeze_panes = "A2"

# --- One tab per vertical -------------------------------------------------------
total = 0
for title, fname in SHEETS:
    header, rows = load(os.path.join(OUT, fname))
    sh = wb.create_sheet(title[:31])
    if not header:
        sh.cell(row=1, column=1, value=f"{fname} absent")
        print(f"{title}: ABSENT")
        continue
    sh.append(header)
    for cell in sh[1]:
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
    tag_col = header.index("tags") + 1
    for row in rows:
        sh.append(row)
    for r in range(2, sh.max_row + 1):
        val = str(sh.cell(row=r, column=tag_col).value or "")
        sh.cell(row=r, column=tag_col).fill = RED if "CONTACT_NON_SOURCE" in val else GREEN
    sh.freeze_panes = "A2"
    sh.auto_filter.ref = f"A1:{get_column_letter(len(header))}{sh.max_row}"
    autosize(sh, header, rows)
    total += len(rows)
    print(f"{title}: {len(rows)} lignes")

path = os.path.join(OUT, f"humanup_market_mapping_{DATE}.xlsx")
wb.save(path)
print(f"XLSX ecrit: {os.path.basename(path)} | {len(wb.sheetnames)} onglets | "
      f"{total} lignes au total")
