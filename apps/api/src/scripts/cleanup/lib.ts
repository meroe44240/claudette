/**
 * Shared helpers for the 2026-11 database cleanup (scripts 01..07).
 *
 * Every script is idempotent and runs as a dry run unless `--apply` is passed.
 * Each field change is written to audit_logs (tool_name = 'cleanup-2026-11', action UPDATE,
 * changes = { field: { old, new } }, metadata = { step, reason }) and to a JSONL file,
 * so that 98-revert-updates.ts can undo it. Deletions only go through the trash
 * (extended Prisma client), tagged with the same tool name.
 *
 * Run inside the API container:  npx tsx src/scripts/cleanup/02-normalize.ts [--apply]
 */
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma, { rawPrisma } from '../../lib/db.js';
import { runWithContext } from '../../lib/request-context.js';
import { blank, clean, EMAIL_RE, phoneE164, domainOf, isPlaceholder, normalizeEmail as email, canonicalLinkedin as linkedinUrl } from '../../lib/data-quality.js';

// Same normalizers as the app (lib/data-quality.ts), re-exported for the step scripts.
export { blank, clean, EMAIL_RE, phoneE164, domainOf, isPlaceholder, email, linkedinUrl };

export const TAG = 'cleanup-2026-11';
export const APPLY = process.argv.includes('--apply');
export const OUT_DIR = process.env.CLEANUP_OUT_DIR || '/app/apps/api/uploads/cleanup-2026-11';


export { prisma, rawPrisma };

/** Actor of every write (admin who ordered the cleanup). Override with CLEANUP_ACTOR_ID. */
export async function actorId(): Promise<string> {
  if (process.env.CLEANUP_ACTOR_ID) return process.env.CLEANUP_ACTOR_ID;
  const u = await rawPrisma.user.findFirst({ where: { role: 'ADMIN', estAgent: false, email: { startsWith: 'meroe' } }, select: { id: true } });
  if (!u) throw new Error('No admin actor found, set CLEANUP_ACTOR_ID');
  return u.id;
}

/** Runs `fn` inside a request context so the trash and the audit log tag the writes. */
export async function runStep(step: string, fn: (ctx: StepCtx) => Promise<void>) {
  const userId = await actorId();
  const batchId = randomUUID();
  const ctx = new StepCtx(step, userId, batchId);
  console.log(`\n=== ${step} — ${APPLY ? 'APPLY' : 'DRY RUN'} — batch ${batchId} ===`);
  await runWithContext({ source: 'SYSTEM', userId, toolName: TAG, batchId }, () => fn(ctx));
  ctx.close();
  await rawPrisma.$disconnect();
}

type Change = { model: string; id: string; label?: string | null; field: string; old: unknown; new: unknown; reason: string };

export class StepCtx {
  private file: fs.WriteStream;
  changes: Change[] = [];
  constructor(public step: string, public userId: string, public batchId: string) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}_${step}_${APPLY ? 'apply' : 'dry'}.jsonl`;
    this.file = fs.createWriteStream(path.join(OUT_DIR, name));
  }
  log(c: Change) {
    this.changes.push(c);
    this.file.write(JSON.stringify({ ts: new Date().toISOString(), step: this.step, batchId: this.batchId, apply: APPLY, ...c }) + '\n');
  }
  close() { this.file.end(); }

  /** Prints the count, the share of the table and 20 examples; refuses to apply above 30 %. */
  async summary(tableTotals: Record<string, number>, { force = false } = {}) {
    const byModel = new Map<string, Set<string>>();
    for (const c of this.changes) {
      if (!byModel.has(c.model)) byModel.set(c.model, new Set());
      byModel.get(c.model)!.add(c.id);
    }
    let tooWide = false;
    for (const [model, ids] of byModel) {
      const total = tableTotals[model] ?? 0;
      const pct = total ? (100 * ids.size) / total : 0;
      console.log(`${model}: ${ids.size} records touched / ${total} (${pct.toFixed(1)} %), ${this.changes.filter((c) => c.model === model).length} field changes`);
      if (pct > 30) console.log(`  WARNING: step touches more than 30 % of ${model}, reviewing each rule below`);
    }
    const byReason = new Map<string, { model: string; n: number }>();
    for (const c of this.changes) {
      const k = `${c.model}.${c.field}: ${c.reason}`;
      byReason.set(k, { model: c.model, n: (byReason.get(k)?.n ?? 0) + 1 });
    }
    for (const [r, { model, n }] of [...byReason].sort((a, b) => b[1].n - a[1].n)) {
      const pct = tableTotals[model] ? (100 * n) / tableTotals[model] : 0;
      console.log(`  ${String(n).padStart(5)}  (${pct.toFixed(1)} %)  ${r}${pct > 30 ? '   <-- over 30 %' : ''}`);
      if (pct > 30) tooWide = true;
    }
    console.log('Examples:');
    const sample = [...this.changes].sort(() => Math.random() - 0.5).slice(0, 20);
    for (const c of sample) console.log(`  ${c.model} ${c.id.slice(0, 8)} ${c.field}: ${JSON.stringify(c.old)} -> ${JSON.stringify(c.new)}  (${c.reason})`);
    if (tooWide && !force) {
      console.log('More than 30 % of a table would change: rule too broad, review it (or pass --force-wide after review).');
      if (APPLY && !process.argv.includes('--force-wide')) throw new Error('Refusing to apply: more than 30 % of a table.');
    }
  }

  /** Applies queued field changes with the raw client (no webhook storm) and writes the audit rows. */
  async applyUpdates() {
    if (!APPLY) return;
    const grouped = new Map<string, { model: string; id: string; label?: string | null; data: Record<string, unknown>; changes: Record<string, { old: unknown; new: unknown }>; reasons: string[] }>();
    for (const c of this.changes) {
      const k = `${c.model}:${c.id}`;
      if (!grouped.has(k)) grouped.set(k, { model: c.model, id: c.id, label: c.label, data: {}, changes: {}, reasons: [] });
      const g = grouped.get(k)!;
      g.data[c.field] = c.new;
      g.changes[c.field] = { old: g.changes[c.field]?.old ?? c.old, new: c.new };
      if (!g.reasons.includes(c.reason)) g.reasons.push(c.reason);
    }
    let n = 0;
    for (const g of grouped.values()) {
      const delegate = (rawPrisma as any)[g.model[0].toLowerCase() + g.model.slice(1)];
      try {
        await delegate.update({ where: { id: g.id }, data: g.data });
      } catch (err: any) {
        console.log(`  SKIPPED ${g.model} ${g.id}: ${err?.code ?? ''} ${String(err?.message ?? err).split('\n').filter(Boolean).pop()} ${JSON.stringify(g.data).slice(0, 200)}`);
        continue;
      }
      await rawPrisma.auditLog.create({
        data: {
          userId: this.userId, action: 'UPDATE', entityType: g.model.toUpperCase(), entityId: g.id, entityLabel: g.label ?? null,
          changes: g.changes as any, metadata: { step: this.step, reasons: g.reasons, tag: TAG } as any,
          source: 'SYSTEM', toolName: TAG, batchId: this.batchId,
        },
      });
      n++;
    }
    console.log(`Applied ${n} record updates (batch ${this.batchId}).`);
  }
}

export async function tableTotals() {
  const [Candidat, Entreprise, Client, Lead] = await Promise.all([
    rawPrisma.candidat.count(), rawPrisma.entreprise.count(), rawPrisma.client.count(), rawPrisma.lead.count(),
  ]);
  return { Candidat, Entreprise, Client, Lead };
}

// ───────────────────────── Normalizers (pure, idempotent) ─────────────────────────

const PARTICLES = new Set(['de', 'du', 'des', 'd', 'la', 'le', 'van', 'von', 'der', 'den', 'da', 'di', 'dos', 'das', 'del', 'della', 'y', 'ben', 'bin', 'al', 'el']);
const LOWER_PARTICLES = new Set(['de', 'du', 'des', 'van', 'von', 'der', 'den', 'da', 'di', 'dos', 'das', 'del', 'della', 'y']);

const INNER_LOWER = new Set(['sur', 'sous', 'en', 'lès', 'les', 'le', 'la', 'de', 'du', 'des', 'aux', 'au', 'et', 'l', 'd']);
function capWord(w: string) {
  return w.split(/([-'’])/).map((p, i) => {
    if (/^[-'’]$/.test(p) || !p) return p;
    if (i > 0 && INNER_LOWER.has(p.toLocaleLowerCase('fr'))) return p.toLocaleLowerCase('fr'); // Dompierre-sur-Mer
    return p[0].toLocaleUpperCase('fr') + p.slice(1).toLocaleLowerCase('fr');
  }).join('');
}
/** Looks like something other than a person name (email, domain, URL, digits): never recased. */
export const notAName = (s: string) => /@|https?:|www\.|\.[a-z]{2,4}\b|\d{3,}/i.test(s);

/**
 * Person name casing: "DUPONT" -> "Dupont", "jean-pierre" -> "Jean-Pierre", "DE LA FONTAINE" -> "de La Fontaine"
 * (lowercase particles only after the first word). Names already in mixed case ("McDonald", "DiCaprio")
 * are left alone: only all-caps or all-lowercase words are recased.
 */
export function personName(v: string | null | undefined): string | null | undefined {
  const s = clean(v);
  if (!s) return s;
  if (notAName(s) || /_/.test(s)) return s;
  const words = s.split(' ');
  if (words.length > 4) return s; // a sentence, not a name: left for manual review
  return words.map((w, i) => {
    if (/^(at|chez|@|-|–|\/|&)$/i.test(w)) return w.toLowerCase();
    const letters = w.replace(/[^\p{L}]/gu, '');
    if (!letters) return w;
    const isUpper = letters === letters.toLocaleUpperCase('fr');
    const isLower = letters === letters.toLocaleLowerCase('fr');
    if (!isUpper && !isLower) return w; // mixed case: trust it
    if (letters.length === 1 && isUpper) return w; // initial "M" / "M."
    const lw = w.toLocaleLowerCase('fr');
    if (i > 0 && i < words.length - 1 && LOWER_PARTICLES.has(lw)) return lw;
    if (/^d['’]/i.test(w) && w.length > 2 && i > 0) return "d'" + capWord(w.slice(2));
    return capWord(w);
  }).join(' ');
}

/** Display name of a company without legal suffixes. Returns the stripped form or the input. */
const LEGAL_SUFFIX = /[\s,]+(sas|sasu|sa|sarl|eurl|sci|snc|inc\.?|ltd\.?|limited|llc|gmbh|ag|bv|nv|s\.a\.s\.?|s\.a\.?|plc|co\.,?\s*ltd\.?|corp\.?)$/i;
export function companyName(v: string | null | undefined): string | null | undefined {
  const c = clean(v);
  if (!c) return c;
  let s: string = c;
  for (let i = 0; i < 2; i++) {
    const next = s.replace(LEGAL_SUFFIX, '').replace(/[\s,]+$/, '');
    if (next.length >= 2) s = next;
  }
  // ALL-CAPS long names -> keep (brands like "BNP PARIBAS" are often written so); only trim.
  return s;
}
export function legalForm(v: string | null | undefined): string | null {
  const m = clean(v)?.match(LEGAL_SUFFIX);
  return m ? m[1].toUpperCase().replace(/\.$/, '') : null;
}

const COUNTRY_FR: Record<string, string> = {
  'united states': 'États-Unis', 'united states of america': 'États-Unis', usa: 'États-Unis', us: 'États-Unis', 'u.s.': 'États-Unis',
  'united kingdom': 'Royaume-Uni', uk: 'Royaume-Uni', england: 'Royaume-Uni', 'great britain': 'Royaume-Uni',
  france: 'France', germany: 'Allemagne', spain: 'Espagne', italy: 'Italie', switzerland: 'Suisse', belgium: 'Belgique',
  netherlands: 'Pays-Bas', 'the netherlands': 'Pays-Bas', canada: 'Canada', morocco: 'Maroc', singapore: 'Singapour', china: 'Chine',
  'saudi arabia': 'Arabie saoudite', 'united arab emirates': 'Émirats arabes unis', uae: 'Émirats arabes unis', israel: 'Israël',
  portugal: 'Portugal', luxembourg: 'Luxembourg', ireland: 'Irlande', japan: 'Japon', india: 'Inde', brazil: 'Brésil', mexico: 'Mexique',
};
const CITY_FR: Record<string, string> = { london: 'Londres', 'greater london': 'Londres', munich: 'Munich', brussels: 'Bruxelles', geneva: 'Genève', beijing: 'Pékin', 'new york city': 'New York', 'greater paris metropolitan region': 'Paris', 'paris area': 'Paris', 'région de paris': 'Paris' };

/** Harmonised "City, Region, Country" with French country names and consistent casing. */
export function location(v: string | null | undefined): string | null | undefined {
  const s = clean(v);
  if (!s) return s;
  const parts = s.split(/\s*,\s*/).filter(Boolean).map((p) => {
    const k = p.toLowerCase();
    if (COUNTRY_FR[k]) return COUNTRY_FR[k];
    if (CITY_FR[k]) return CITY_FR[k];
    const letters = p.replace(/[^\p{L}]/gu, '');
    if (letters.length > 3 && letters === letters.toUpperCase()) return p.split(' ').map((w) => (/^\d+$/.test(w) ? w : capWord(w))).join(' '); // "PARIS" -> "Paris"
    return p;
  });
  // de-duplicate consecutive repeats ("Paris, Paris")
  return parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase()).join(', ');
}

// ───────────────────────── Junk detection ─────────────────────────

export const isTestCompany = (v: string | null | undefined) => isPlaceholder(v) || /^(test\s?(corp|entreprise|company|soci[ée]t[ée])|techtest|testentreprise|entreprise test|soci[ée]t[ée] test|company|entreprise|soci[ée]t[ée])$/i.test(companyName(v) ?? '');

/** A person name that can be used: at least one real word that is not a placeholder. */
export function usablePersonName(prenom: string | null, nom: string | null) {
  const words = [prenom, nom].filter((w): w is string => !!w && !isPlaceholder(w) && w.replace(/[^\p{L}]/gu, '').length >= 2);
  return words.length >= 1;
}

// ───────────────────────── Protection rules (point 1) ─────────────────────────

const RECENT = "now() - interval '12 months'";

/** Candidates that must never be deleted or merged destructively. */
export async function protectedCandidats(): Promise<Set<string>> {
  const rows = await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`
    select c.id::text from candidats c where
      exists (select 1 from candidatures x where x."candidatId" = c.id)
      or exists (select 1 from presentations x where x.candidat_id = c.id)
      or exists (select 1 from bookings x where x."candidatId" = c.id)
      or exists (select 1 from note_calls x where x.candidat_id = c.id)
      or exists (select 1 from candidate_accounts x where x.candidat_id = c.id)
      or exists (select 1 from market_lists x where x."candidatId" = c.id)
      or exists (select 1 from activites a where a."entiteType" = 'CANDIDAT' and a."entiteId" = c.id
                 and a.type in ('APPEL','EMAIL','MEETING','NOTE','TRANSCRIPT') and a."createdAt" > ${RECENT})`);
  return new Set(rows.map((r) => r.id));
}

/** Client contacts: a client, a prospect in progress or a lead with an interaction. */
export async function protectedClients(): Promise<Set<string>> {
  const rows = await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`
    select c.id::text from clients c where
      c."statutClient" not in ('LEAD','INACTIF')
      or exists (select 1 from mandats x where x."clientId" = c.id)
      or exists (select 1 from portal_accesses x where x."clientId" = c.id)
      or exists (select 1 from leads x where x."clientId" = c.id)
      or exists (select 1 from note_calls x where x.client_id = c.id)
      or exists (select 1 from presentations x where x.client_id = c.id)
      or exists (select 1 from activites a where a."entiteType" = 'CLIENT' and a."entiteId" = c.id and a.type <> 'TACHE')`);
  return new Set(rows.map((r) => r.id));
}

/** Companies with any business link. */
export async function protectedEntreprises(): Promise<Set<string>> {
  const rows = await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`
    select e.id::text from entreprises e where
      exists (select 1 from mandats x where x."entrepriseId" = e.id)
      or exists (select 1 from clients x where x."entrepriseId" = e.id)
      or exists (select 1 from leads x where x."entrepriseId" = e.id)
      or exists (select 1 from presentations x where x.entreprise_id = e.id)
      or exists (select 1 from profils_recherches x where x.entreprise_id = e.id)
      or exists (select 1 from market_list_establishments x where x."entrepriseId" = e.id)
      or exists (select 1 from ownerships x where x.entite_id = e.id and x.released_at is null)
      or exists (select 1 from activites a where a."entiteType" = 'ENTREPRISE' and a."entiteId" = e.id and a.type <> 'TACHE')`);
  return new Set(rows.map((r) => r.id));
}

// ───────────────────────── Completeness score (point 2) ─────────────────────────

type Cand = { prenom: string | null; nom: string; email: string | null; telephone: string | null; linkedinUrl: string | null; posteActuel: string | null; entrepriseActuelle: string | null; localisation: string | null; anneesExperience: number | null; cvUrl: string | null; cvTexte?: string | null };
export function candidatScore(c: Cand) {
  const fullName = !!c.prenom && !!c.nom && !isPlaceholder(c.prenom) && !isPlaceholder(c.nom) && c.nom.replace(/[^\p{L}]/gu, '').length >= 2;
  const checks = [fullName, !blank(c.email) || !blank(c.telephone), !blank(c.linkedinUrl), !blank(c.posteActuel), !blank(c.entrepriseActuelle), !blank(c.localisation), c.anneesExperience != null, !blank(c.cvUrl)];
  return checks.filter(Boolean).length; // out of 8
}
export function candidatClass(c: Cand): 'A' | 'B' | 'C' {
  const score = candidatScore(c);
  const hasId = !blank(c.email) || !blank(c.linkedinUrl) || !blank(c.telephone);
  if (score >= 6) return 'A';
  if (hasId) return 'B';
  const substance = !blank(c.cvUrl) || !blank(c.cvTexte) || (usablePersonName(c.prenom, c.nom) && (!blank(c.entrepriseActuelle) || !blank(c.posteActuel)));
  return substance ? 'B' : 'C';
}

type Ent = { nom: string; domaine: string | null; siteWeb: string | null; secteur: string | null; taille: string | null; localisation: string | null; linkedinUrl: string | null; siren?: string | null };
export function entrepriseScore(e: Ent) {
  const checks = [!isTestCompany(e.nom) && e.nom.trim().length >= 2, !blank(e.domaine) || !blank(e.siteWeb), !blank(e.secteur), !blank(e.taille), !blank(e.localisation), !blank(e.linkedinUrl)];
  return checks.filter(Boolean).length; // out of 6
}
export function entrepriseClass(e: Ent): 'A' | 'B' | 'C' {
  if (entrepriseScore(e) >= 5) return 'A';
  if (isTestCompany(e.nom) || e.nom.trim().length < 2) return 'C';
  return 'B'; // named company: recoverable (domain/LinkedIn can be found from the name)
}

type Cli = { prenom: string | null; nom: string; email: string | null; telephone: string | null; linkedinUrl: string | null; poste: string | null };
export function clientScore(c: Cli) {
  const checks = [usablePersonName(c.prenom, c.nom) && !!c.prenom, !blank(c.email), !blank(c.telephone), !blank(c.linkedinUrl), !blank(c.poste)];
  return checks.filter(Boolean).length; // out of 5
}
export function clientClass(c: Cli): 'A' | 'B' | 'C' {
  if (clientScore(c) >= 4) return 'A';
  if (!blank(c.email) || !blank(c.linkedinUrl) || !blank(c.telephone)) return 'B';
  return usablePersonName(c.prenom, c.nom) ? 'B' : 'C';
}
