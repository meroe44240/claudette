#!/usr/bin/env python3
"""Merge Finance A+B+C -> finance_{date}.csv, then dedup sales vs sales_saas.
Prints only counters — never file contents."""
import csv, os, sys, unicodedata, re

DATE = "2026-09-22"
OUT = "/home/user/claudette/outputs"
HEADER = ["nom","prenom","email","telephone","poste","entreprise",
          "localisation","linkedin","source","tags","notes"]

def norm(s):
    """Normalise une raison sociale pour comparaison."""
    s = unicodedata.normalize("NFKD", (s or "")).encode("ascii","ignore").decode()
    s = s.lower()
    s = re.sub(r"\b(sas|sasu|sarl|sa|eurl|snc|sci|group|groupe|holding|france|the)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s

def read_rows(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8-sig", newline="") as fh:
        r = csv.reader(fh, delimiter=";")
        rows = [x for x in r if x and any(c.strip() for c in x)]
    if rows and [c.strip().lstrip("﻿") for c in rows[0]] == HEADER:
        rows = rows[1:]
    return rows

def write_rows(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, delimiter=";", lineterminator="\r\n")
        w.writerow(HEADER)
        for r in rows:
            r = (r + [""]*11)[:11]
            w.writerow([(c or "").replace(";", "|").replace("\n"," ").replace("\r"," ").strip()
                        for c in r])

# ---------- 1. MERGE FINANCE ----------
fin_rows, missing = [], []
for part in ("a","b","c"):
    p = f"{OUT}/_fin_{part}_{DATE}.csv"
    rows = read_rows(p)
    if rows is None:
        missing.append(f"_fin_{part}")
        continue
    fin_rows.extend(rows)
    print(f"finance_{part}: {len(rows)} lignes")

if fin_rows:
    write_rows(f"{OUT}/finance_{DATE}.csv", fin_rows)
ents_fin = {norm(r[5]) for r in fin_rows if len(r) > 5 and r[5].strip()}
print(f"FINANCE MERGE -> {len(fin_rows)} lignes | {len(ents_fin)} entreprises uniques"
      + (f" | MANQUANTS: {','.join(missing)}" if missing else ""))

# ---------- 2. DEDUP SALES ----------
saas = read_rows(f"{OUT}/sales_saas_{DATE}.csv")
sales = read_rows(f"{OUT}/sales_{DATE}.csv")

if saas is None or sales is None:
    print(f"DEDUP SKIP — sales_saas={'OK' if saas is not None else 'ABSENT'} "
          f"sales={'OK' if sales is not None else 'ABSENT'}")
else:
    saas_ents = {norm(r[5]) for r in saas if len(r) > 5 and r[5].strip()}
    kept, removed = [], []
    for r in sales:
        e = norm(r[5]) if len(r) > 5 else ""
        if e and e in saas_ents:
            removed.append(r[5].strip())
        else:
            kept.append(r)
    write_rows(f"{OUT}/sales_{DATE}.csv", kept)
    uniq_removed = sorted(set(removed))
    print(f"DEDUP SALES: {len(sales)} -> {len(kept)} lignes "
          f"({len(removed)} lignes retirees, {len(uniq_removed)} entreprises)")
    if uniq_removed:
        print("RETIREES: " + " | ".join(uniq_removed))
    with open("/tmp/claude-0/-home-user-claudette/267529d9-93be-5d7f-a231-0c71ed9a4c97/scratchpad/dedup_removed.txt","w",encoding="utf-8") as fh:
        fh.write("\n".join(uniq_removed))
    if len(kept) < 40:
        print(f"ALERTE: sales_{DATE}.csv sous les 40 lignes ({len(kept)}) — livre tel quel.")

# ---------- 3. ETAT FINAL ----------
print("--- FICHIERS LIVRABLES ---")
for f in (f"finance_{DATE}.csv", f"hospitality_{DATE}.csv", f"industrie_{DATE}.csv",
          f"sales_saas_{DATE}.csv", f"sales_{DATE}.csv"):
    p = f"{OUT}/{f}"
    if os.path.exists(p):
        rows = read_rows(p)
        ents = len({norm(r[5]) for r in rows if len(r) > 5 and r[5].strip()})
        src = sum(1 for r in rows if len(r) > 0 and r[0].strip())
        print(f"{f}: {len(rows)} lignes | {ents} entreprises | {src} contacts nominatifs")
    else:
        print(f"{f}: ABSENT")
