/**
 * Step 3: values stored in the wrong field (email in the phone or name field, company inside the
 * job title, names or "null" in the LinkedIn field, CV text in a location...). Idempotent.
 * A value that has no right place is removed from the field and kept in the record's notes.
 *   npx tsx src/scripts/cleanup/03-misplaced.ts [--apply]
 */
import { runStep, rawPrisma, tableTotals, blank, email, EMAIL_RE, phoneE164, linkedinUrl, companyName, personName, clean } from './lib.js';

const fold = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const JOB_AT = /^(.{2,80}?)\s+(?:chez|at|@)\s+([^()]{2,60})$/i;
const NO_JOB = /sans emploi|recherche|disponible|freelance|ind[ée]pendant|self-employed|en poste|ex-|ancien/i;

/** Splits "jean.dupont@x.com" into a usable first/last name, or null. */
function nameFromEmail(e: string) {
  const local = e.split('@')[0];
  const m = local.match(/^([a-zà-ÿ]{2,})[._-]([a-zà-ÿ]{2,})$/i);
  return m ? { prenom: personName(m[1])!, nom: personName(m[2])! } : null;
}

runStep('03-misplaced', async (ctx) => {
  const totals = await tableTotals();
  const set = (model: string, id: string, label: string, field: string, old: unknown, nv: unknown, reason: string) => {
    if ((old ?? null) === (nv ?? null)) return;
    ctx.log({ model, id, label, field, old, new: nv, reason });
  };

  type Person = { id: string; prenom: string | null; nom: string; email: string | null; telephone: string | null; linkedinUrl: string | null; notes: string | null };
  const fixPerson = (model: 'Candidat' | 'Client', p: Person, extra: { poste?: [string, string | null]; company?: [string, string | null] } = {}) => {
    const label = [p.prenom, p.nom].filter(Boolean).join(' ');
    let em = p.email, tel = p.telephone, li = p.linkedinUrl, nom = p.nom, prenom = p.prenom;
    const removed: string[] = [];

    // email field holding something else
    if (!blank(em) && !EMAIL_RE.test(em!)) {
      const asPhone = phoneE164(em);
      const asLi = linkedinUrl(em, 'in');
      if (asPhone && blank(tel)) { tel = asPhone; set(model, p.id, label, 'telephone', p.telephone, tel, 'phone found in email field'); }
      else if (asLi && asLi !== 'INVALID' && blank(li)) { li = asLi; set(model, p.id, label, 'linkedinUrl', p.linkedinUrl, li, 'LinkedIn found in email field'); }
      else removed.push(`email: ${em}`);
      set(model, p.id, label, 'email', p.email, null, 'invalid email removed from email field');
      em = null;
    }
    // phone field holding an email
    if (!blank(tel) && tel!.includes('@')) {
      const e = email(tel);
      if (e && EMAIL_RE.test(e) && blank(em)) { em = e; set(model, p.id, label, 'email', p.email, em, 'email found in phone field'); }
      else removed.push(`telephone: ${tel}`);
      set(model, p.id, label, 'telephone', p.telephone, null, 'email removed from phone field');
    }
    // LinkedIn field holding a name, "null", or a company page on a person
    if (!blank(li)) {
      const u = linkedinUrl(li, 'in');
      if (u === 'INVALID' || (u && !u.includes('/in/'))) {
        if (!/^(null|undefined|linkedin|n\/?a|-)$/i.test(li!.trim())) removed.push(`linkedinUrl: ${li}`);
        set(model, p.id, label, 'linkedinUrl', p.linkedinUrl, null, u && u !== 'INVALID' ? 'company page removed from person LinkedIn field' : 'not a LinkedIn URL');
      }
    }
    // name field holding an email
    if (nom.includes('@')) {
      const e = email(nom)!;
      if (EMAIL_RE.test(e)) {
        if (blank(em)) { set(model, p.id, label, 'email', p.email, e, 'email found in name field'); em = e; }
        const n = nameFromEmail(e);
        const parts = e.split('@')[0].split(/[._-]+/).filter((x) => /^[a-zà-ÿ]+$/i.test(x));
        const newNom = n ? n.nom : parts.length ? personName(parts[parts.length - 1])! : null;
        // Only when it gives a real last name (not the first name again): otherwise left for review.
        if (newNom && newNom.length >= 2 && fold(newNom) !== fold(prenom)) {
          set(model, p.id, label, 'nom', p.nom, newNom, 'name derived from email that was in the name field');
          if (n && blank(prenom)) set(model, p.id, label, 'prenom', p.prenom, n.prenom, 'name derived from email that was in the name field');
          nom = newNom;
        } else {
          console.log(`  AMBIGUOUS ${model} ${p.id}: name field holds ${e}, no last name derivable`);
        }
      }
    }
    // job title "X chez Y" / "X at Y"
    if (extra.poste && extra.company) {
      const [poste, company] = [extra.poste[1], extra.company[1]];
      const m = !blank(poste) && !NO_JOB.test(poste!) ? poste!.match(JOB_AT) : null;
      if (m) {
        const title = clean(m[1])!, co = companyName(clean(m[2]))!;
        if (blank(company)) {
          set(model, p.id, label, extra.poste[0], poste, title, 'company split out of job title');
          set(model, p.id, label, extra.company[0], company, co, 'company split out of job title');
        } else if (fold(co) === fold(company) || fold(company).includes(fold(co)) || fold(co).includes(fold(company))) {
          set(model, p.id, label, extra.poste[0], poste, title, 'company repeated in job title removed');
        }
      }
    }
    if (removed.length) {
      const line = `[cleanup-2026-11] Values removed from the wrong field: ${removed.join(' ; ')}`;
      if (!(p.notes ?? '').includes(line)) set(model, p.id, label, 'notes', p.notes, p.notes ? `${p.notes}\n\n${line}` : line, 'removed values kept in notes');
    }
  };

  for (const c of await rawPrisma.candidat.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, notes: true, posteActuel: true, entrepriseActuelle: true, localisation: true } })) {
    fixPerson('Candidat', c, { poste: ['posteActuel', c.posteActuel], company: ['entrepriseActuelle', c.entrepriseActuelle] });
    if (c.localisation && c.localisation.length > 120) set('Candidat', c.id, c.nom, 'localisation', c.localisation, null, 'non-location text removed from location');
  }
  // Clients: the company is the linked Entreprise, so only strip it from the job title when it matches.
  for (const c of await rawPrisma.client.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, notes: true, poste: true, entreprise: { select: { nom: true } } } })) {
    fixPerson('Client', c, { poste: ['poste', c.poste], company: ['__entreprise', c.entreprise.nom] });
  }
  for (const e of await rawPrisma.entreprise.findMany({ select: { id: true, nom: true, localisation: true, notes: true, linkedinUrl: true } })) {
    if (e.localisation && e.localisation.length > 120) {
      const country = e.localisation.match(/^([A-Z]{2}),/)?.[1];
      set('Entreprise', e.id, e.nom, 'localisation', e.localisation, country === 'FR' ? 'France' : null, 'non-location text removed from location');
    }
    if (!blank(e.linkedinUrl)) {
      const u = linkedinUrl(e.linkedinUrl, 'company');
      if (u === 'INVALID' || (u && u.includes('/in/'))) set('Entreprise', e.id, e.nom, 'linkedinUrl', e.linkedinUrl, null, 'person profile or non-URL removed from company LinkedIn field');
    }
  }

  // __entreprise is never a real field: a client's company must not be rewritten here.
  ctx.changes = ctx.changes.filter((c) => c.field !== '__entreprise');
  await ctx.summary(totals);
  await ctx.applyUpdates();
});
