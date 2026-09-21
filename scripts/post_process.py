#!/usr/bin/env python3
"""Merge Finance A/B/C, dedupe Meroe's sales file against Louis's, report counters only.

Never prints CSV rows — only aggregate counts — so the orchestrating agent's context
stays small.
"""
import csv
import os
import sys

DATE = sys.argv[1] if len(sys.argv) > 1 else None
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "outputs")
HEADER = ["nom", "prenom", "email", "telephone", "poste", "entreprise",
          "localisation", "linkedin", "source", "tags", "notes"]


def read_rows(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rdr = csv.DictReader(fh, delimiter=";")
        return [r for r in rdr]


def write_rows(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=HEADER, delimiter=";",
                           lineterminator="\r\n", extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: (r.get(k) or "").replace(";", "|") for k in HEADER})


def sourced(rows):
    return sum(1 for r in rows if (r.get("nom") or "").strip())


# --- 1. Merge Finance A + B + C -------------------------------------------------
parts, missing = [], []
for tag in ("a", "b", "c"):
    p = os.path.join(OUT, f"_fin_{tag}_{DATE}.csv")
    rows = read_rows(p)
    if rows is None:
        missing.append(os.path.basename(p))
    else:
        print(f"fin_{tag}: {len(rows)} lignes")
        parts.extend(rows)

if missing:
    print("MANQUANT: " + ", ".join(missing))

# Two parts can surface the same opportunity independently. The job title wording
# varies between them (DAF vs CFO), so key on the contact slot instead and keep one
# row per (entreprise, JOB|NEWS, slot), preferring the row with a sourced name.
def _slot_key(r):
    tags = [t.strip() for t in (r.get("tags") or "").split(",")]
    kind = "NEWS" if "NEWS" in tags else "JOB"
    slot = "CONTACT_1" if "CONTACT_1" in tags else "CONTACT_2"
    return ((r.get("entreprise") or "").strip().lower(), kind, slot)


_by_key, _dropped = {}, []
for r in parts:
    key = _slot_key(r)
    prev = _by_key.get(key)
    if prev is None:
        _by_key[key] = r
    else:
        _dropped.append((r.get("entreprise") or "").strip())
        if not (prev.get("nom") or "").strip() and (r.get("nom") or "").strip():
            _by_key[key] = r
if _dropped:
    parts = list(_by_key.values())
    print(f"DEDUP_INTRA_FINANCE: {len(_dropped)} lignes retirees "
          f"({', '.join(sorted(set(_dropped)))})")

fin_path = os.path.join(OUT, f"finance_{DATE}.csv")
if parts:
    write_rows(fin_path, parts)
    print(f"finance_{DATE}.csv: {len(parts)} lignes | "
          f"{len({r['entreprise'] for r in parts})} entreprises | "
          f"{sourced(parts)} contacts sources")

# --- 2. Dedupe Meroe's sales against Louis's ------------------------------------
saas = read_rows(os.path.join(OUT, f"sales_saas_{DATE}.csv"))
sales_path = os.path.join(OUT, f"sales_{DATE}.csv")
sales = read_rows(sales_path)

if saas is None or sales is None:
    print("DEDUP IMPOSSIBLE: fichier(s) sales manquant(s)")
else:
    saas_names = {(r["entreprise"] or "").strip().lower() for r in saas}
    kept = [r for r in sales
            if (r["entreprise"] or "").strip().lower() not in saas_names]
    removed = sorted({r["entreprise"] for r in sales
                      if (r["entreprise"] or "").strip().lower() in saas_names})
    write_rows(sales_path, kept)
    print(f"sales_saas_{DATE}.csv: {len(saas)} lignes | "
          f"{len(saas_names)} entreprises | {sourced(saas)} contacts sources")
    print(f"sales_{DATE}.csv: {len(kept)} lignes apres dedup "
          f"(retire {len(sales) - len(kept)}) | "
          f"{len({r['entreprise'] for r in kept})} entreprises | "
          f"{sourced(kept)} contacts sources")
    print("RETIREES_DEDUP: " + (", ".join(removed) if removed else "aucune"))

# --- 3. Format validation on the 5 deliverables ---------------------------------
print("--- validation ---")
for name in (f"finance_{DATE}.csv", f"hospitality_{DATE}.csv", f"industrie_{DATE}.csv",
             f"sales_saas_{DATE}.csv", f"sales_{DATE}.csv"):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        print(f"{name}: ABSENT")
        continue
    raw = open(p, "rb").read()
    rows = read_rows(p)
    bad_cols = sum(1 for r in rows if len(r) != 11 or None in r.values())
    filled = sum(1 for r in rows
                 if (r.get("email") or "").strip() or (r.get("telephone") or "").strip())
    has_bom = raw[:3] == b"\xef\xbb\xbf"
    has_crlf = raw.count(b"\r\n") > 0
    print(f"{name}: {len(rows)} lignes | BOM={has_bom} | "
          f"CRLF={has_crlf} | colonnes_KO={bad_cols} | "
          f"email/tel_non_vides={filled} | sources={sourced(rows)}")
