/**
 * Step 2: normalisation (trim, name casing, lowercase emails, E.164 phones, canonical LinkedIn,
 * company names without legal suffixes, harmonised locations). Idempotent.
 *   npx tsx src/scripts/cleanup/02-normalize.ts [--apply]
 */
import { runStep, rawPrisma, tableTotals, personName, email, phoneE164, linkedinUrl, companyName, legalForm, location, clean, domainOf, blank } from './lib.js';

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

runStep('02-normalize', async (ctx) => {
  const totals = await tableTotals();
  let phoneUnresolved = 0;
  const set = (model: string, id: string, label: string, field: string, old: unknown, nv: unknown, reason: string) => {
    if (nv === undefined || same(old, nv)) return;
    ctx.log({ model, id, label, field, old, new: nv, reason });
  };
  const phone = (model: string, id: string, label: string, field: string, v: string | null) => {
    if (blank(v)) { if (v !== null && v !== undefined) set(model, id, label, field, v, null, 'blank to null'); return; }
    const e = phoneE164(v);
    if (e) set(model, id, label, field, v, e, 'phone E.164');
    else { phoneUnresolved++; const t = clean(v); if (t !== v) set(model, id, label, field, v, t, 'trim'); }
  };
  const li = (model: string, id: string, label: string, field: string, v: string | null, kind: 'in' | 'company') => {
    const u = linkedinUrl(v, kind);
    if (u === 'INVALID') return; // handled by 03-misplaced
    if (u === null) { if (v !== null) set(model, id, label, field, v, null, 'blank to null'); return; }
    if (kind === 'in' && !u.includes('/in/')) return; // company URL on a person: 03-misplaced
    set(model, id, label, field, v, u, 'canonical LinkedIn URL');
  };
  const mail = (model: string, id: string, label: string, v: string | null) => {
    const e = email(v);
    set(model, id, label, 'email', v, e ?? null, blank(v) ? 'blank to null' : 'lowercase/trim email');
  };

  // ── Candidates
  for (const c of await rawPrisma.candidat.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, posteActuel: true, entrepriseActuelle: true, localisation: true } })) {
    const label = [c.prenom, c.nom].filter(Boolean).join(' ');
    set('Candidat', c.id, label, 'prenom', c.prenom, blank(c.prenom) ? null : personName(c.prenom), 'name casing/trim');
    const nom = personName(c.nom);
    if (nom) set('Candidat', c.id, label, 'nom', c.nom, nom, 'name casing/trim');
    mail('Candidat', c.id, label, c.email);
    phone('Candidat', c.id, label, 'telephone', c.telephone);
    li('Candidat', c.id, label, 'linkedinUrl', c.linkedinUrl, 'in');
    set('Candidat', c.id, label, 'posteActuel', c.posteActuel, blank(c.posteActuel) ? null : clean(c.posteActuel!.replace(/&amp;/g, '&')), 'trim');
    set('Candidat', c.id, label, 'entrepriseActuelle', c.entrepriseActuelle, blank(c.entrepriseActuelle) ? null : companyName(c.entrepriseActuelle), 'company display name');
    set('Candidat', c.id, label, 'localisation', c.localisation, blank(c.localisation) ? null : location(c.localisation), 'location harmonised');
  }

  // ── Client contacts
  for (const c of await rawPrisma.client.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, poste: true } })) {
    const label = [c.prenom, c.nom].filter(Boolean).join(' ');
    set('Client', c.id, label, 'prenom', c.prenom, blank(c.prenom) ? null : personName(c.prenom), 'name casing/trim');
    const nom = personName(c.nom);
    if (nom) set('Client', c.id, label, 'nom', c.nom, nom, 'name casing/trim');
    mail('Client', c.id, label, c.email);
    phone('Client', c.id, label, 'telephone', c.telephone);
    li('Client', c.id, label, 'linkedinUrl', c.linkedinUrl, 'in');
    set('Client', c.id, label, 'poste', c.poste, blank(c.poste) ? null : clean(c.poste), 'trim');
  }

  // ── Companies
  for (const e of await rawPrisma.entreprise.findMany({ select: { id: true, nom: true, siteWeb: true, domaine: true, linkedinUrl: true, localisation: true, formeJuridique: true, secteur: true } })) {
    const nom = companyName(e.nom);
    if (nom && nom !== e.nom) {
      set('Entreprise', e.id, e.nom, 'nom', e.nom, nom, 'company display name without legal suffix');
      const lf = legalForm(e.nom);
      if (lf && blank(e.formeJuridique)) set('Entreprise', e.id, e.nom, 'formeJuridique', e.formeJuridique, lf, 'legal suffix kept in formeJuridique');
    }
    const site = blank(e.siteWeb) ? null : clean(e.siteWeb)!;
    if (site && domainOf(site) && !/^https?:\/\//i.test(site)) set('Entreprise', e.id, e.nom, 'siteWeb', e.siteWeb, `https://${site.replace(/^\/+/, '')}`, 'website with scheme');
    else set('Entreprise', e.id, e.nom, 'siteWeb', e.siteWeb, site, 'trim');
    const dom = domainOf(e.domaine) ?? (blank(e.domaine) ? domainOf(e.siteWeb) : null);
    if (dom) set('Entreprise', e.id, e.nom, 'domaine', e.domaine, dom, blank(e.domaine) ? 'domain derived from website' : 'bare domain');
    li('Entreprise', e.id, e.nom, 'linkedinUrl', e.linkedinUrl, 'company');
    set('Entreprise', e.id, e.nom, 'localisation', e.localisation, blank(e.localisation) ? null : location(e.localisation), 'location harmonised');
    set('Entreprise', e.id, e.nom, 'secteur', e.secteur, blank(e.secteur) ? null : clean(e.secteur), 'trim');
  }

  // ── Leads
  for (const l of await rawPrisma.lead.findMany({ select: { id: true, company: true, contact: true, email: true, phone: true, city: true } })) {
    set('Lead', l.id, l.contact, 'company', l.company, clean(l.company), 'trim');
    set('Lead', l.id, l.contact, 'contact', l.contact, personName(l.contact), 'name casing/trim');
    mail('Lead', l.id, l.contact, l.email);
    phone('Lead', l.id, l.contact, 'phone', l.phone);
    set('Lead', l.id, l.contact, 'city', l.city, blank(l.city) ? null : location(l.city), 'location harmonised');
  }

  console.log(`Phones left as is (format not decidable): ${phoneUnresolved}`);
  await ctx.summary(totals);
  await ctx.applyUpdates();
});
