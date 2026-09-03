#!/usr/bin/env python3
"""Merge the Finance parts and de-duplicate the general Sales file against the SaaS one.

Prints counters only - never the CSV contents (main-agent context stays light).
"""
import csv
import os
import sys

HEADER = ["nom", "prenom", "email", "telephone", "poste", "entreprise",
          "localisation", "linkedin", "source", "tags", "notes"]
OUT = "outputs"


def read(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh, delimiter=";"))
    if not rows:
        return []
    return [r for r in rows[1:] if r and any(c.strip() for c in r)]


def write(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh, delimiter=";", lineterminator="\r\n")
        w.writerow(HEADER)
        w.writerows(rows)


def key(row):
    ent = row[5].strip().lower()
    poste = row[4].strip().lower()
    return (ent, poste, row[0].strip().lower(), row[1].strip().lower())


def dedupe(rows):
    seen, out = set(), []
    for r in rows:
        k = key(r)
        if k in seen:
            continue
        seen.add(k)
        out.append(r)
    return out


def companies(rows):
    return {r[5].strip().lower() for r in rows if len(r) > 5}


def main(date):
    # --- Finance merge: parts A (+ complement), B, C ---
    parts = [f"_fin_a_{date}.csv", f"_fin_a_complement_{date}.csv",
             f"_fin_b_{date}.csv", f"_fin_c_{date}.csv"]
    fin = []
    for p in parts:
        rows = read(os.path.join(OUT, p))
        print(f"  {p}: {len(rows)} lignes")
        fin += rows
    fin = dedupe(fin)
    write(os.path.join(OUT, f"finance_{date}.csv"), fin)
    print(f"finance_{date}.csv -> {len(fin)} lignes / {len(companies(fin))} entreprises")

    # --- Sales merge + dedup against Sales SaaS ---
    sales = dedupe(read(os.path.join(OUT, f"sales_{date}.csv"))
                   + read(os.path.join(OUT, f"_sales_complement_{date}.csv")))
    saas = read(os.path.join(OUT, f"sales_saas_{date}.csv"))
    saas_comps = companies(saas)
    kept = [r for r in sales if r[5].strip().lower() not in saas_comps]
    removed = sorted({r[5] for r in sales if r[5].strip().lower() in saas_comps})
    write(os.path.join(OUT, f"sales_{date}.csv"), kept)
    print(f"sales_saas_{date}.csv -> {len(saas)} lignes / {len(saas_comps)} entreprises")
    print(f"sales_{date}.csv -> {len(kept)} lignes / {len(companies(kept))} entreprises "
          f"({len(sales) - len(kept)} lignes retirees par dedoublonnage)")
    print("Entreprises retirees:", ", ".join(removed) if removed else "aucune")


if __name__ == "__main__":
    main(sys.argv[1])
