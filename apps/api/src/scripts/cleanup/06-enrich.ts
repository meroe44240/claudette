/**
 * Step 6: enrich class B records that have a reliable identifier (LinkedIn, or name + company domain)
 * with a work/personal email through FullEnrich (1 credit per contact). Phones (10 credits) are not
 * requested. Priority: candidates on open mandates, contacts of active companies, then other
 * candidates with a candidature. Stops at CLEANUP_ENRICH_BUDGET credits (default 400) and never
 * goes below CLEANUP_ENRICH_FLOOR remaining credits (default 5000). Only empty fields are filled.
 *   npx tsx src/scripts/cleanup/06-enrich.ts [--apply]
 */
import { runStep, rawPrisma, tableTotals, APPLY, EMAIL_RE, email as normEmail, blank, location } from './lib.js';
import * as fullenrich from '../../modules/integrations/fullenrich.service.js';

const BUDGET = Number(process.env.CLEANUP_ENRICH_BUDGET ?? 400);
const FLOOR = Number(process.env.CLEANUP_ENRICH_FLOOR ?? 5000);
/** Resume jobs already started (ids printed by a previous run): --resume=id1,id2 */
const RESUME = process.argv.find((a) => a.startsWith('--resume='))?.split('=')[1]?.split(',').filter(Boolean) ?? [];

/** Waits until the bulk job is FINISHED (the v2 API answers 200 while IN_PROGRESS). */
async function waitFinished(enrichmentId: string, maxMinutes = 20) {
  const deadline = Date.now() + maxMinutes * 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(`https://app.fullenrich.com/api/v2/contact/enrich/bulk/${enrichmentId}`, { headers: { Authorization: `Bearer ${process.env.FULLENRICH_API_KEY}` } });
    const j: any = await res.json().catch(() => ({}));
    if (j.status === 'FINISHED') return { data: (j.data ?? []) as any[], cost: j.cost?.credits ?? 0 };
    if (['CANCELED', 'CREDITS_INSUFFICIENT', 'RATE_LIMIT', 'UNKNOWN'].includes(j.status)) throw new Error(`enrichment ${enrichmentId} ended with ${j.status}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`enrichment ${enrichmentId} still running after ${maxMinutes} min, resume later with --resume=${enrichmentId}`);
}

type Target = { model: 'Candidat' | 'Client'; id: string; label: string; priority: number; input: fullenrich.EnrichInput; current: Record<string, string | null> };

runStep('06-enrich', async (ctx) => {
  const totals = await tableTotals();
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const already = new Set(ids(await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`select distinct "entiteId"::text id from activites where metadata->>'fullEnrich' = 'true' and "entiteId" is not null`)));

  const p1 = new Set(ids(await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`select distinct c.id::text from candidats c join candidatures x on x."candidatId" = c.id join mandats m on m.id = x."mandatId" where m.statut in ('OUVERT','EN_COURS') and x.stage <> 'REFUSE'`)));
  const p3 = new Set(ids(await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`select distinct "candidatId"::text id from candidatures`)));
  const activeCompanies = new Set(ids(await rawPrisma.$queryRawUnsafe<{ id: string }[]>(`
    select e.id::text from entreprises e where exists (select 1 from mandats m where m."entrepriseId" = e.id and m.statut in ('OUVERT','EN_COURS'))
      or exists (select 1 from leads l where l."entrepriseId" = e.id and l.stage not in ('perdu','gagne'))
      or exists (select 1 from profils_recherches p where p.entreprise_id = e.id)`)));

  const targets: Target[] = [];
  for (const c of await rawPrisma.candidat.findMany({ where: { email: null, linkedinUrl: { not: null } }, select: { id: true, prenom: true, nom: true, linkedinUrl: true, entrepriseActuelle: true, posteActuel: true, localisation: true } })) {
    if (already.has(c.id) || !c.linkedinUrl?.includes('/in/')) continue;
    const priority = p1.has(c.id) ? 1 : p3.has(c.id) ? 3 : 0;
    if (!priority) continue;
    targets.push({ model: 'Candidat', id: c.id, label: [c.prenom, c.nom].filter(Boolean).join(' '), priority,
      input: { linkedin_url: c.linkedinUrl, first_name: c.prenom ?? undefined, last_name: c.nom, company_name: c.entrepriseActuelle ?? undefined },
      current: { posteActuel: c.posteActuel, entrepriseActuelle: c.entrepriseActuelle, localisation: c.localisation } });
  }
  for (const c of await rawPrisma.client.findMany({ where: { email: null }, select: { id: true, prenom: true, nom: true, linkedinUrl: true, poste: true, entrepriseId: true, entreprise: { select: { nom: true, domaine: true } } } })) {
    if (already.has(c.id) || !activeCompanies.has(c.entrepriseId)) continue;
    const li = c.linkedinUrl?.includes('/in/') ? c.linkedinUrl : undefined;
    if (!li && !(c.prenom && c.entreprise.domaine)) continue;
    targets.push({ model: 'Client', id: c.id, label: [c.prenom, c.nom].filter(Boolean).join(' '), priority: 2,
      input: { linkedin_url: li, first_name: c.prenom ?? undefined, last_name: c.nom, company_name: c.entreprise.nom, domain: c.entreprise.domaine ?? undefined },
      current: { poste: c.poste } });
  }
  targets.sort((a, b) => a.priority - b.priority);

  const credits = await fullenrich.getCredits();
  const allowed = Math.max(0, Math.min(BUDGET, Math.floor(credits - FLOOR)));
  const batch = targets.slice(0, allowed);
  console.log(`Credits: ${credits}. Targets: ${targets.length} (P1 open-mandate candidates ${targets.filter((t) => t.priority === 1).length}, P2 active-company contacts ${targets.filter((t) => t.priority === 2).length}, P3 other candidates in a pipeline ${targets.filter((t) => t.priority === 3).length}). Will enrich ${batch.length} (max cost ${batch.length} credits).`);
  for (const t of batch.slice(0, 20)) console.log(`  P${t.priority} ${t.model} ${t.label} ${t.input.linkedin_url ?? t.input.domain}`);
  if (!APPLY || !batch.length) return;

  let found = 0;
  let cost = 0;
  const jobs: string[] = [...RESUME];
  if (!RESUME.length) {
    for (let i = 0; i < batch.length; i += 100) {
      const chunk = batch.slice(i, i + 100);
      const id = await fullenrich.startEnrichment(chunk.map((t) => ({ ...t.input, custom: { id: t.id } }) as any), ['contact.emails', 'contact.personal_emails']);
      console.log(`  started enrichment ${id} (${chunk.length} contacts)`);
      jobs.push(id);
    }
  }
  const allTargets = new Map(targets.map((t) => [t.id, t]));
  for (const enrichmentId of jobs) {
    console.log(`  waiting for ${enrichmentId}...`);
    const { data: results, cost: c } = await waitFinished(enrichmentId);
    cost += c;
    for (const r of results) {
      const t = allTargets.get(r.custom?.id) ?? targets.find((x) => x.input.linkedin_url && x.input.linkedin_url === r.input?.linkedin_url);
      if (!t) continue;
      const ci = r.contact_info ?? {};
      const best = normEmail(ci.most_probable_work_email?.email || ci.most_probable_personal_email?.email);
      const updates: Record<string, string> = {};
      if (best && EMAIL_RE.test(best)) updates.email = best;
      const cur = r.profile?.employment?.current;
      if (t.model === 'Candidat') {
        if (blank(t.current.posteActuel) && cur?.title) updates.posteActuel = cur.title.slice(0, 255);
        if (blank(t.current.entrepriseActuelle) && cur?.company?.name) updates.entrepriseActuelle = cur.company.name.slice(0, 255);
        const loc = [r.profile?.location?.city, r.profile?.location?.country].filter(Boolean).join(', ');
        if (blank(t.current.localisation) && loc) updates.localisation = location(loc)!.slice(0, 255);
      } else if (blank(t.current.poste) && cur?.title) updates.poste = cur.title.slice(0, 255);
      for (const [field, v] of Object.entries(updates)) ctx.log({ model: t.model, id: t.id, label: t.label, field, old: null, new: v, reason: 'FullEnrich enrichment' });
      if (updates.email) found++;
      await rawPrisma.activite.create({ data: {
        type: 'NOTE', entiteType: t.model === 'Candidat' ? 'CANDIDAT' : 'CLIENT', entiteId: t.id, userId: ctx.userId, source: 'SYSTEME',
        titre: updates.email ? 'Email enriched via FullEnrich' : 'FullEnrich: no email found',
        contenu: Object.keys(updates).length ? `Fields filled: ${Object.entries(updates).map(([k, v]) => `${k} → ${v}`).join(', ')}` : null,
        metadata: { fullEnrich: true, enrichType: 'email', cleanup: 'cleanup-2026-11', updatedFields: Object.keys(updates) },
      } });
    }
  }
  console.log(`Emails found: ${found}. Cost reported: ${cost} credits. Credits left: ${await fullenrich.getCredits()}`);
  await ctx.summary(totals);
  await ctx.applyUpdates();
});
