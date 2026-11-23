/**
 * Duplicate detection shared by 01-measure (counts), 04-dedupe (merge) and the weekly check.
 *
 * Candidates: email, LinkedIn, phone, then name + current company.
 * Companies: domain, LinkedIn, then normalised name.
 * Client contacts: email, LinkedIn, then name inside the same company.
 * A group is "safe" only if every pair has compatible names; other groups are reported as ambiguous.
 */
import { rawPrisma, linkedinUrl, phoneE164, domainOf, companyName, blank, isPlaceholder } from './lib.js';

export type Group = { ids: string[]; keys: string[]; safe: boolean; why?: string };

const fold = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIC_LOCAL = /^(contact|info|infos|hello|bonjour|rh|hr|jobs?|recrutement|recruitment|careers?|admin|office|noreply|no-reply|candidature|candidatures|talent)$/;
const GENERIC_DOMAINS = new Set(['linkedin.com', 'google.com', 'gmail.com', 'facebook.com', 'welcometothejungle.com', 'indeed.com', 'wix.com', 'wixsite.com', 'notion.site', 'sites.google.com']);

class UF {
  p = new Map<string, string>();
  find(x: string): string { if (!this.p.has(x)) this.p.set(x, x); const r = this.p.get(x)!; if (r === x) return x; const f = this.find(r); this.p.set(x, f); return f; }
  union(a: string, b: string) { this.p.set(this.find(a), this.find(b)); }
}

function groupBy<T extends { id: string }>(rows: T[], keyFns: Array<[string, (r: T) => string | null]>) {
  const uf = new UF();
  const keysOf = new Map<string, Set<string>>();
  for (const [kname, fn] of keyFns) {
    const buckets = new Map<string, string[]>();
    for (const r of rows) {
      const k = fn(r);
      if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r.id);
    }
    for (const [k, ids] of buckets) {
      if (ids.length < 2) continue;
      for (const id of ids) { uf.union(ids[0], id); if (!keysOf.has(id)) keysOf.set(id, new Set()); keysOf.get(id)!.add(`${kname}:${k}`); }
    }
  }
  const groups = new Map<string, string[]>();
  for (const r of rows) { if (!keysOf.has(r.id)) continue; const root = uf.find(r.id); if (!groups.has(root)) groups.set(root, []); groups.get(root)!.push(r.id); }
  return [...groups.values()].filter((g) => g.length > 1).map((ids) => ({ ids, keys: [...new Set(ids.flatMap((id) => [...(keysOf.get(id) ?? [])]))] }));
}

/** Two person names can be the same person (initials, missing first name, email-derived name...). */
function namesCompatible(a: { prenom: string | null; nom: string }, b: { prenom: string | null; nom: string }) {
  const pa = fold(a.prenom), pb = fold(b.prenom), na = fold(a.nom), nb = fold(b.nom);
  const full = (p: string, n: string) => `${p} ${n}`.trim();
  if (!na || !nb || isPlaceholder(a.nom) || isPlaceholder(b.nom)) return true;
  const fa = full(pa, na).replace(/ /g, ''), fb = full(pb, nb).replace(/ /g, '');
  if (fa === fb || fa.includes(fb) || fb.includes(fa)) return true; // "Cyrilgodin" vs "Cyril Godin"
  const initial = (x: string, y: string) => x.length === 1 && y.startsWith(x);
  const lastOk = na === nb || initial(na, nb) || initial(nb, na);
  const firstOk = !pa || !pb || pa === pb || initial(pa, pb) || initial(pb, pa) || pa.split(' ')[0] === pb.split(' ')[0];
  if (lastOk && firstOk) return true;
  if (pa === nb && pb === na) return true; // first/last swapped
  // Same first name, one last name contained in the other ("Lachgar Assous" / "Assous")
  if (pa && pa === pb && (` ${na} `.includes(` ${nb} `) || ` ${nb} `.includes(` ${na} `))) return true;
  return false;
}

type P = { prenom: string | null; nom: string; email?: string | null; telephone?: string | null };
/** Name rule plus identifier evidence: an email-derived name, or same email AND same phone with a shared first or last name. */
function samePerson(a: P, b: P) {
  if (namesCompatible(a, b)) return true;
  const local = (e?: string | null) => fold(e?.split('@')[0]).replace(/ /g, '');
  const full = (p: P) => `${fold(p.prenom)}${fold(p.nom)}`.replace(/ /g, '');
  const sameEmail = !!a.email && a.email.toLowerCase() === b.email?.toLowerCase();
  if (sameEmail) {
    const derived = (p: P, o: P) => full(p) === local(p.email) && (local(p.email).includes(fold(o.nom).replace(/ /g, '')) || local(p.email).startsWith(fold(o.prenom).replace(/ /g, '')));
    if (derived(a, b) || derived(b, a)) return true; // "Shanebweaver" (from shanebweaver@) vs "Shane Weaver"
  }
  const samePhone = !!a.telephone && a.telephone === b.telephone;
  if (sameEmail && samePhone) {
    const lev1 = (x: string, y: string) => x === y || (Math.abs(x.length - y.length) <= 1 && [...x].filter((c, i) => c !== y[i]).length <= 1) || x.includes(y) || y.includes(x);
    if ((fold(a.prenom) && lev1(fold(a.prenom), fold(b.prenom))) || fold(a.nom) === fold(b.nom)) return true; // "Antone" / "Antoine"
  }
  return false;
}

function tokensOverlap(a: string, b: string) {
  const ta = new Set(fold(companyName(a)).split(' ').filter((t) => t.length > 2));
  return fold(companyName(b)).split(' ').some((t) => t.length > 2 && ta.has(t));
}

export async function findDuplicateGroups() {
  // ── Candidates
  const cands = await rawPrisma.candidat.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, entrepriseActuelle: true } });
  const candById = new Map(cands.map((c) => [c.id, c]));
  const candGroups = groupBy(cands, [
    ['email', (c) => { const e = c.email?.trim().toLowerCase(); return e && e.includes('@') && !GENERIC_LOCAL.test(e.split('@')[0]) ? e : null; }],
    ['linkedin', (c) => { const u = linkedinUrl(c.linkedinUrl, 'in'); return u && u !== 'INVALID' && u.includes('/in/') ? u : null; }],
    ['phone', (c) => phoneE164(c.telephone) ?? (c.telephone && c.telephone.replace(/\D/g, '').length >= 9 ? c.telephone.replace(/\D/g, '').slice(-9) : null)],
    ['name+company', (c) => (!blank(c.prenom) && !blank(c.entrepriseActuelle) && !isPlaceholder(c.nom) && fold(c.nom).length > 1 ? `${fold(c.prenom)}|${fold(c.nom)}|${fold(companyName(c.entrepriseActuelle))}` : null)],
  ]).map((g) => {
    const rows = g.ids.map((id) => candById.get(id)!);
    const onlyPhone = g.keys.every((k) => k.startsWith('phone:'));
    const ok = rows.every((r) => rows.every((s) => samePerson(r, s)));
    return { ...g, safe: ok, why: ok ? undefined : onlyPhone ? 'same phone, different names' : 'same identifier, different names' } as Group;
  });

  // ── Companies
  const ents = await rawPrisma.entreprise.findMany({ select: { id: true, nom: true, domaine: true, siteWeb: true, linkedinUrl: true, siren: true } });
  const entById = new Map(ents.map((e) => [e.id, e]));
  const entGroups = groupBy(ents, [
    ['domain', (e) => { const d = domainOf(e.domaine) ?? domainOf(e.siteWeb); return d && !GENERIC_DOMAINS.has(d) ? d : null; }],
    ['linkedin', (e) => { const u = linkedinUrl(e.linkedinUrl, 'company'); return u && u !== 'INVALID' && u.includes('/company/') ? u : null; }],
    ['name', (e) => { const n = fold(companyName(e.nom)); return n.length >= 2 ? n : null; }],
  ]).map((g) => {
    const rows = g.ids.map((id) => entById.get(id)!);
    const sirens = new Set(rows.map((r) => r.siren).filter(Boolean));
    if (sirens.size > 1) return { ...g, safe: false, why: 'different SIREN' } as Group;
    const key = (n: string) => fold(companyName(n)).replace(/ /g, '');
    const sameName = rows.every((r) => key(r.nom) === key(rows[0].nom));
    if (!sameName) return { ...g, safe: false, why: 'same domain or LinkedIn, different names (subsidiary?)' } as Group;
    const strongKey = g.keys.some((k) => k.startsWith('domain:') || k.startsWith('linkedin:'));
    if (!strongKey && key(rows[0].nom).length <= 3) return { ...g, safe: false, why: 'short name only (acronym), no domain to confirm' } as Group;
    return { ...g, safe: true } as Group;
  });

  // ── Client contacts
  const clis = await rawPrisma.client.findMany({ select: { id: true, prenom: true, nom: true, email: true, linkedinUrl: true, entrepriseId: true } });
  const cliById = new Map(clis.map((c) => [c.id, c]));
  const cliGroups = groupBy(clis, [
    ['email', (c) => { const e = c.email?.trim().toLowerCase(); return e && e.includes('@') && !GENERIC_LOCAL.test(e.split('@')[0]) ? e : null; }],
    ['linkedin', (c) => { const u = linkedinUrl(c.linkedinUrl, 'in'); return u && u !== 'INVALID' && u.includes('/in/') ? u : null; }],
    ['name+company', (c) => (!blank(c.prenom) && fold(c.nom).length > 1 && !isPlaceholder(c.nom) ? `${fold(c.prenom)}|${fold(c.nom)}|${c.entrepriseId}` : null)],
  ]).map((g) => {
    const rows = g.ids.map((id) => cliById.get(id)!);
    const ok = rows.every((r) => rows.every((s) => samePerson(r, s)));
    return { ...g, safe: ok, why: ok ? undefined : 'same identifier, different names' } as Group;
  });

  return { candidats: candGroups, entreprises: entGroups, clients: cliGroups };
}
