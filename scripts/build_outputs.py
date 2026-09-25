#!/usr/bin/env python3
"""Market mapping — merge Finance, dedup Sales, build XLSX. Prints counters only."""
import csv, os, sys, glob

DATE = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'outputs')
H = ['nom', 'prenom', 'email', 'telephone', 'poste', 'entreprise',
     'localisation', 'linkedin', 'source', 'tags', 'notes']


def read(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f, delimiter=';'))
    if not rows:
        return []
    return [r for r in rows[1:] if any(c.strip() for c in r)]


def write(path, rows):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';', lineterminator='\r\n', quoting=csv.QUOTE_MINIMAL)
        w.writerow(H)
        w.writerows(rows)


def norm(name):
    return ' '.join(name.lower().replace('.', ' ').split())


report = {}

# --- Merge Finance A+B+C -----------------------------------------------------
fin_rows, missing = [], []
for part in ('a', 'b', 'c'):
    p = os.path.join(OUT, f'_fin_{part}_{DATE}.csv')
    r = read(p)
    if r is None:
        missing.append(part)
    else:
        fin_rows.extend(r)
        print(f'fin_{part}: {len(r)} lignes')
if missing:
    print(f'ATTENTION parts finance manquantes: {missing}')
write(os.path.join(OUT, f'finance_{DATE}.csv'), fin_rows)
print(f'finance_{DATE}.csv: {len(fin_rows)} lignes')

# --- Dedup Sales (Meroe) vs Sales SaaS (Louis) -------------------------------
saas = read(os.path.join(OUT, f'sales_saas_{DATE}.csv')) or []
sales = read(os.path.join(OUT, f'sales_{DATE}.csv')) or []
saas_cos = {norm(r[5]) for r in saas if len(r) > 5 and r[5].strip()}
kept, removed = [], set()
for r in sales:
    if len(r) > 5 and norm(r[5]) in saas_cos:
        removed.add(r[5])
    else:
        kept.append(r)
if sales:
    write(os.path.join(OUT, f'sales_{DATE}.csv'), kept)
print(f'sales_saas: {len(saas)} lignes | sales avant: {len(sales)} | apres dedup: {len(kept)}')
print('retirees_dedup: ' + ('; '.join(sorted(removed)) if removed else 'aucune'))
if kept and len(kept) < 40:
    print(f'ALERTE: sales_{DATE}.csv sous 40 lignes ({len(kept)})')

# --- Stats per file ----------------------------------------------------------
FILES = [('Valentin - Finance', f'finance_{DATE}.csv'),
         ('Valentin - Hospitality', f'hospitality_{DATE}.csv'),
         ('Alexis - Industrie', f'industrie_{DATE}.csv'),
         ('Louis - Sales SaaS', f'sales_saas_{DATE}.csv'),
         ('Meroe - Sales', f'sales_{DATE}.csv')]

stats = {}
print('--- STATS ---')
for label, fn in FILES:
    rows = read(os.path.join(OUT, fn))
    if rows is None:
        print(f'{label}: FICHIER MANQUANT')
        stats[label] = None
        continue
    cos = {r[5] for r in rows if len(r) > 5 and r[5].strip()}
    sourced = sum(1 for r in rows if len(r) > 9 and 'CONTACT_NON_SOURCE' not in r[9])
    news = sum(1 for r in rows if len(r) > 9 and ',NEWS,' in ',' + r[9] + ',')
    locs = {}
    for r in rows:
        if len(r) > 6 and r[6].strip():
            locs[r[6].strip()] = locs.get(r[6].strip(), 0) + 1
    top = sorted(locs.items(), key=lambda x: -x[1])[:5]
    stats[label] = dict(rows=len(rows), cos=len(cos), sourced=sourced, news=news, top=top)
    print(f'{label}: {len(rows)} lignes | {len(cos)} entreprises | {sourced} contacts sources | {news} lignes NEWS')
    print('   top villes: ' + ', '.join(f'{k}({v})' for k, v in top))

# --- XLSX --------------------------------------------------------------------
try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    hdr_fill = PatternFill('solid', fgColor='1F4E79')
    hdr_font = Font(color='FFFFFF', bold=True)
    green = PatternFill('solid', fgColor='C6EFCE')
    red = PatternFill('solid', fgColor='FFC7CE')

    ws = wb.active
    ws.title = 'Synthese'
    syn = [['Humanup.io — Market mapping', DATE], [],
           ['Vertical', 'Lignes', 'Entreprises', 'Contacts sources', 'Lignes NEWS']]
    for label, _ in FILES:
        s = stats.get(label)
        syn.append([label] + ([s['rows'], s['cos'], s['sourced'], s['news']] if s else ['MANQUANT', '', '', '']))
    tot = [s for s in stats.values() if s]
    syn.append(['TOTAL', sum(s['rows'] for s in tot), sum(s['cos'] for s in tot),
                sum(s['sourced'] for s in tot), sum(s['news'] for s in tot)])
    syn += [[], ['Retirees du fichier Sales (doublon Louis)'],
            ['; '.join(sorted(removed)) if removed else 'aucune']]
    rec = os.path.join(os.path.dirname(OUT), 'outputs', f'rapport_synthese_{DATE}.md')
    for row in syn:
        ws.append(row)
    for c in ws[3]:
        if c.value:
            c.fill, c.font = hdr_fill, hdr_font
    ws['A1'].font = Font(bold=True, size=14)

    for label, fn in FILES:
        rows = read(os.path.join(OUT, fn))
        w = wb.create_sheet(label[:31])
        w.append(H)
        for r in (rows or []):
            w.append(r + [''] * (len(H) - len(r)))
        for c in w[1]:
            c.fill, c.font = hdr_fill, hdr_font
            c.alignment = Alignment(horizontal='center')
        w.freeze_panes = 'A2'
        if rows:
            w.auto_filter.ref = f'A1:{get_column_letter(len(H))}{len(rows) + 1}'
        for i, col in enumerate(H, 1):
            width = max([len(col)] + [len(str(r[i - 1])) for r in (rows or []) if len(r) >= i] or [10])
            w.column_dimensions[get_column_letter(i)].width = min(width + 2, 60)
        tcol = H.index('tags') + 1
        for ri in range(2, (len(rows or []) + 2)):
            cell = w.cell(row=ri, column=tcol)
            cell.fill = red if 'CONTACT_NON_SOURCE' in str(cell.value or '') else green

    xp = os.path.join(OUT, f'humanup_market_mapping_{DATE}.xlsx')
    wb.save(xp)
    print(f'XLSX: {os.path.basename(xp)} ({wb.sheetnames.__len__()} onglets)')
except Exception as e:
    print(f'XLSX ECHEC: {type(e).__name__}: {e}')

# stash stats for the report step
import json
with open(os.path.join(OUT, f'.stats_{DATE}.json'), 'w') as f:
    json.dump({'stats': stats, 'removed': sorted(removed)}, f, ensure_ascii=False)
print('done')
