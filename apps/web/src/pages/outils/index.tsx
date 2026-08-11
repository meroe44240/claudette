import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, IdCard, ArrowRight, ArrowLeft, Send, Printer, Search, Building2, ShieldCheck, Upload, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';
import { useAuthStore } from '../../stores/auth-store';

type Tool = 'home' | 'contrat' | 'cv';
type Lang = 'fr' | 'en';

// ─── CONTRAT : articles (titres FR/EN) ──────────────
const ARTICLES: { fr: string; en: string }[] = [
  { fr: 'Objet du contrat', en: 'Purpose of the agreement' },
  { fr: 'Description des services', en: 'Description of services' },
  { fr: 'Durée du contrat', en: 'Term' },
  { fr: 'Honoraires', en: 'Fees' },
  { fr: 'Propriété des candidatures', en: 'Ownership of applications' },
  { fr: 'Garantie de remplacement', en: 'Replacement guarantee' },
  { fr: 'Confidentialité', en: 'Confidentiality' },
  { fr: 'Données personnelles', en: 'Personal data' },
  { fr: 'Référence et communication', en: 'Reference and communication' },
  { fr: 'Obligations du Client', en: 'Client obligations' },
  { fr: 'Obligations du Prestataire', en: 'Provider obligations' },
  { fr: 'Non-sollicitation', en: 'Non-solicitation' },
  { fr: 'Communications', en: 'Notices' },
  { fr: 'Pénalités de retard', en: 'Late-payment penalties' },
  { fr: 'Responsabilité', en: 'Liability' },
  { fr: 'Force majeure', en: 'Force majeure' },
  { fr: 'Cession', en: 'Assignment' },
  { fr: "Intégralité de l'accord", en: 'Entire agreement' },
  { fr: 'Droit applicable et juridiction', en: 'Governing law and jurisdiction' },
];

function articleBody(i: number, lang: Lang, f: ContractForm): string {
  const fr = lang === 'fr';
  switch (i) {
    case 0: return fr
      ? `Le présent contrat définit les conditions dans lesquelles le Prestataire réalise, pour le compte du Client, une prestation de recherche et de sélection de candidats en vue d'un recrutement.`
      : `This agreement sets out the terms under which the Provider carries out, on behalf of the Client, a candidate search and selection service for a recruitment.`;
    case 3: return fr
      ? `4.1 Honoraires : la prestation est rémunérée au succès, à hauteur de ${f.feePct}% de la rémunération annuelle brute du candidat recruté. 4.2 Paiement : ${f.paiement}.`
      : `4.1 Fees: the service is remunerated on success, at ${f.feePct}% of the annual gross remuneration of the hired candidate. 4.2 Payment: ${f.paiement}.`;
    case 4: return fr
      ? `Les candidatures présentées demeurent la propriété du Prestataire pendant ${f.proprieteMois} mois. Toute embauche d'un candidat présenté durant cette période donne lieu au versement des honoraires prévus à l'article 4.`
      : `Applications presented remain the property of the Provider for ${f.proprieteMois} months. Any hire of a presented candidate during this period triggers the fees set out in Article 4.`;
    case 5: return fr
      ? `En cas de départ du candidat recruté durant les ${f.garantieMois} premiers mois, le Prestataire s'engage à effectuer une recherche de remplacement sans honoraires complémentaires, sous réserve du paiement intégral de la facture initiale.`
      : `Should the hired candidate leave within the first ${f.garantieMois} months, the Provider undertakes to carry out a replacement search at no additional fee, subject to full payment of the initial invoice.`;
    case 7: return fr
      ? `Chaque Partie traite les données personnelles aux seules fins d'exécution du présent Contrat. Les dossiers de candidature sont transmis pour évaluation uniquement et ne peuvent être conservés, dupliqués ou réutilisés pour un autre poste sans accord écrit préalable du Prestataire.`
      : `Each Party processes personal data solely for the performance of this Agreement. Application files are provided for evaluation only and may not be retained, duplicated or reused for another position without the prior written consent of the Provider.`;
    case 8: return fr
      ? `Le Client autorise le Prestataire à mentionner son nom et à afficher son logo à titre de référence commerciale sur son site, ses supports de présentation et ses témoignages clients. Cette autorisation est révocable à tout moment par simple notification écrite.`
      : `The Client authorises the Provider to mention its name and display its logo as a commercial reference on its website, presentation materials and client testimonials. This authorisation is revocable at any time by simple written notice.`;
    case 12: return fr
      ? `Toute communication au titre du présent contrat est adressée au Client : ${f.client}, ${f.adresse || '[adresse]'}, ${f.email || '[email]'}.`
      : `Any notice under this agreement shall be sent to the Client: ${f.client}, ${f.adresse || '[address]'}, ${f.email || '[email]'}.`;
    case 18: return fr
      ? `Le présent contrat est régi par le droit de ${f.pays}. Tout litige relève de la compétence des tribunaux compétents.`
      : `This agreement is governed by the law of ${f.pays}. Any dispute falls within the jurisdiction of the competent courts.`;
    default: return fr
      ? `Les parties conviennent des dispositions usuelles applicables à « ${ARTICLES[i].fr} », conformément aux pratiques du secteur du recrutement.`
      : `The parties agree to the customary provisions applicable to "${ARTICLES[i].en}", in accordance with recruitment industry practice.`;
  }
}

interface ContractForm {
  client: string; siret: string; adresse: string; rep: string; email: string; pays: string;
  feePct: string; garantieMois: string; proprieteMois: string; paiement: string; poste: string;
}

// ─── CV/DOSSIER : type candidat ─────────────────────
interface CandidatLite {
  id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null;
  localisation: string | null; aiPitchLong: string | null; aiPitchShort: string | null; tags: string[];
  aiIdealFor?: string | null;
  aiSellingPoints?: string[] | null;
  aiAnonymizedProfile?: { title?: string; summary?: string; bullet_points?: string[] } | null;
  experiences?: { id: string; titre: string; entreprise: string; anneeDebut: number; anneeFin: number | null; highlights?: string[] }[];
}

// Recruteur (bloc trust sur le one-pager)
interface TeamMember { id: string; nom: string; prenom: string | null; email: string | null; avatarUrl: string | null; avatarData?: string | null; telephone: string | null; fonction?: string }
interface Recruiter { nom: string; email: string; telephone: string; avatarUrl: string | null }

// Compresse une image en petite vignette carrée (data-URI JPEG) pour le bloc recruteur.
function fileToThumbnail(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        const side = Math.min(img.width, img.height); // recadrage carré centré
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        const out = Math.min(max, side);
        const canvas = document.createElement('canvas');
        canvas.width = out; canvas.height = out;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponible'));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── EXPORT PDF (impression iframe dédiée) ──────────
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));

// Ouvre un document autonome dans un iframe caché et lance l'impression (Enregistrer en PDF).
// Évite les pièges de window.print() sur la page : fonds de couleur conservés (print-color-adjust),
// format A4 net, pas de sidebar ni de pages blanches.
function printDoc(html: string) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) { document.body.removeChild(iframe); return; }
  const cleanup = () => { setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* déjà retiré */ } }, 800); };
  win.onafterprint = cleanup;
  doc.open();
  doc.write(html);
  doc.close();
  // Laisse le temps au layout + polices de se charger avant l'impression.
  setTimeout(() => { try { win.focus(); win.print(); } catch { cleanup(); } }, 450);
}

const DOC_HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;600;700;800&display=swap');
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:0}
html,body{margin:0;padding:0;background:#fff;color:#312C4A;font-family:'Inter',system-ui,-apple-system,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.ab{font-family:'Archivo Black','Arial Black',system-ui,sans-serif}
.hdr{background:#22177A;color:#fff;padding:15mm 18mm 13mm;position:relative}
.brandbar{display:flex;align-items:center;justify-content:space-between;gap:14px}
.brand{display:flex;align-items:center;gap:13px}
.mark{height:46px;width:auto;display:block}
.wordmark{line-height:1}
.wm-name{font-size:18pt;color:#E6E9AF;letter-spacing:.015em}
.wm-sub{font-size:7.5pt;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:rgba(230,233,175,.6);margin-top:5px}
.badge{font-size:8pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#E6E9AF;border:1px solid rgba(230,233,175,.5);border-radius:999px;padding:6px 13px;white-space:nowrap}
.hrule{height:1px;background:rgba(230,233,175,.22);margin:14px 0 13px}
.eyebrow{font-size:8.5pt;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:rgba(230,233,175,.62)}
.h1{font-size:22pt;margin-top:5px;color:#E6E9AF;line-height:1.08}
.sub{font-size:10.5pt;color:rgba(230,233,175,.85);margin-top:7px}
.body{padding:12mm 18mm 10mm}
.sec{font-size:11pt;color:#22177A;margin:0 0 8px}
.sec.mt{margin-top:17px}
.para{font-size:10.5pt;line-height:1.7;color:#312C4A;text-align:justify;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:9.5pt;font-weight:700;border-radius:999px;padding:5px 12px;background:#F2F3D8;color:#22177A}
.strengths{display:grid;grid-template-columns:1fr 1fr;gap:7px 20px;margin-top:2px}
.strength{display:flex;gap:8px;font-size:10pt;line-height:1.45;color:#312C4A}
.strength .ck{flex-shrink:0;width:15px;height:15px;border-radius:50%;background:#22177A;color:#E6E9AF;font-size:9pt;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px}
.xps{display:flex;flex-direction:column;gap:12px;margin-top:2px}
.xp{display:flex;gap:12px;page-break-inside:avoid}
.yr{flex-shrink:0;font-family:ui-monospace,Menlo,monospace;font-size:8.5pt;font-weight:700;color:#8A8699;background:#F7F7F0;border-radius:6px;padding:3px 9px;height:fit-content;min-width:74px;text-align:center}
.xt{font-size:10.5pt;font-weight:800;color:#1A1533}
.xe{font-size:10pt;color:#22177A;font-weight:700;margin-top:1px}
.hl{margin:6px 0 0;padding:0 0 0 2px;list-style:none}
.hl li{font-size:9.5pt;line-height:1.5;color:#3C3654;padding-left:14px;position:relative;margin-bottom:2px}
.hl li:before{content:"";position:absolute;left:0;top:6px;width:5px;height:5px;border-radius:50%;background:#E6E9AF;box-shadow:0 0 0 1.5px #22177A}
.ideal{margin-top:16px;background:#F2F3D8;border-radius:12px;padding:12px 16px;font-size:10pt;color:#22177A;line-height:1.5}
.ideal b{font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:8.5pt;display:block;margin-bottom:3px;color:#4A4290}
.rec{margin:0 18mm 12mm;background:#FBFBF2;border:1px solid rgba(34,23,122,.14);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:14px;page-break-inside:avoid}
.rec-photo{width:52px;height:52px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#22177A;color:#E6E9AF;display:flex;align-items:center;justify-content:center;font-family:'Archivo Black',sans-serif;font-size:15pt;border:2px solid #E6E9AF}
.rec-info{flex:1;min-width:0}
.rec-name{font-size:11.5pt;font-weight:800;color:#1A1533}
.rec-role{font-size:9pt;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8A7F5A;margin-top:1px}
.rec-contact{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px}
.rec-contact span{font-size:9.5pt;color:#312C4A;font-weight:600}
.rec-logo{height:22px;width:auto;flex-shrink:0;opacity:.9}
.foot{text-align:center;font-size:8pt;color:#9A96AE;padding:0 18mm 10mm;letter-spacing:.03em}
.art{page-break-inside:avoid}
.art .sec{margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid rgba(34,23,122,.1)}
.art .para{font-size:9.5pt;line-height:1.72}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:34px;padding-top:18px;border-top:1px solid rgba(34,23,122,.14);page-break-inside:avoid}
.sign .cap{font-size:9pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9A96AE}
.sign .ln{height:52px;border-bottom:1px solid rgba(34,23,122,.25);margin-top:10px}
.sign .nm{font-size:9.5pt;color:#6E6A85;margin-top:6px}
.parties{display:flex;gap:34px;flex-wrap:wrap;margin-top:18px}
.pcap{font-size:8.5pt;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(230,233,175,.55)}
.pnm{font-size:11pt;font-weight:700;margin-top:4px}
.psub{font-size:9.5pt;color:rgba(230,233,175,.75);margin-top:2px}
</style>`;

// One-pager de PUSH : anonymisé (pas de nom/coordonnées/photo candidat), mais
// boîtes réelles + réalisations visibles, brandé HumanUp + bloc recruteur (trust).
function pushHtml(cand: CandidatLite, rec: Recruiter, opts: { lang: Lang; keepCity: boolean }): string {
  const { lang, keepCity } = opts;
  const T = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const origin = window.location.origin;
  const logoMarkCream = `${origin}/brand/logo-mark-cream.png`; // marque claire — sur le bandeau navy
  const logoMark = `${origin}/brand/logo-mark-navy.png`;       // marque foncée — sur le bloc recruteur crème

  const exps = (cand.experiences ?? []).slice().sort((a, b) => (b.anneeDebut || 0) - (a.anneeDebut || 0));
  const starts = exps.map(e => e.anneeDebut).filter((n): n is number => !!n);
  const years = starts.length ? Math.max(1, new Date().getFullYear() - Math.min(...starts)) : 0;

  const anon = cand.aiAnonymizedProfile || {};
  const title = anon.title || cand.posteActuel || T('Profil confidentiel', 'Confidential profile');
  const summary = anon.summary || cand.aiPitchLong || cand.aiPitchShort || T('Synthèse en cours de génération.', 'Summary being generated.');
  const strengths = (anon.bullet_points && anon.bullet_points.length ? anon.bullet_points : (cand.aiSellingPoints || [])).slice(0, 6);
  const skills = (cand.tags ?? []).slice(0, 12);

  const metaBits = [
    years ? `${years} ${T('ans d’expérience', 'years of experience')}` : null,
    keepCity ? cand.localisation : null,
    exps.length ? `${exps.length} ${T('expériences', 'roles')}` : null,
  ].filter(Boolean);

  const strengthsHtml = strengths.length
    ? `<div class="sec mt ab">${T('Points forts', 'Key strengths')}</div><div class="strengths">${strengths.map(s => `<div class="strength"><span class="ck">✓</span><span>${esc(s)}</span></div>`).join('')}</div>`
    : '';
  const skillsHtml = skills.length
    ? `<div class="sec mt ab">${T('Compétences', 'Skills')}</div><div class="chips">${skills.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>`
    : '';
  const expsHtml = exps.length
    ? `<div class="sec mt ab">${T('Parcours & réalisations', 'Track record')}</div><div class="xps">${exps.map(e => {
        const hl = (e.highlights ?? []).filter(Boolean);
        return `<div class="xp"><span class="yr">${esc(e.anneeDebut || '—')}–${e.anneeFin ? esc(e.anneeFin) : T('auj.', 'now')}</span><div style="min-width:0"><div class="xt">${esc(e.titre)}</div><div class="xe">${esc(e.entreprise || '—')}</div>${hl.length ? `<ul class="hl">${hl.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</div></div>`;
      }).join('')}</div>`
    : '';
  const idealHtml = cand.aiIdealFor
    ? `<div class="ideal"><b>${T('Idéal pour', 'Ideal for')}</b>${esc(cand.aiIdealFor)}</div>`
    : '';

  const recInitials = (rec.nom || 'HU').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const recPhoto = rec.avatarUrl
    ? `<img class="rec-photo" src="${esc(rec.avatarUrl)}" alt="${esc(rec.nom)}"/>`
    : `<div class="rec-photo">${esc(recInitials)}</div>`;
  const recContact = [
    rec.email ? `<span>✉&nbsp; ${esc(rec.email)}</span>` : '',
    rec.telephone ? `<span>☎&nbsp; ${esc(rec.telephone)}</span>` : '',
  ].filter(Boolean).join('');

  return `<!doctype html><html lang="${lang}"><head>${DOC_HEAD}<title>${T('Profil', 'Profile')} — ${esc(title)}</title></head><body>
<div class="hdr">
  <div class="brandbar">
    <div class="brand">
      <img class="mark" src="${logoMarkCream}" alt="HumanUp"/>
      <div class="wordmark"><div class="wm-name ab">HUMANUP</div><div class="wm-sub">Recruitment Agency&nbsp; ·&nbsp; humanup.io</div></div>
    </div>
    <span class="badge">${T('Profil confidentiel', 'Confidential profile')}</span>
  </div>
  <div class="hrule"></div>
  <div class="eyebrow">${T('Profil présenté par HumanUp', 'Profile presented by HumanUp')}</div>
  <div class="h1 ab">${esc(title)}</div>
  <div class="sub">${esc(metaBits.join('  ·  ') || T('Présenté par HumanUp', 'Presented by HumanUp'))}</div>
</div>
<div class="body">
  <div class="sec ab">${T('En bref', 'Summary')}</div>
  <p class="para">${esc(summary)}</p>
  ${strengthsHtml}
  ${skillsHtml}
  ${expsHtml}
  ${idealHtml}
</div>
<div class="rec">
  ${recPhoto}
  <div class="rec-info">
    <div class="rec-name">${esc(rec.nom || 'HumanUp')}</div>
    <div class="rec-role">${T('Votre contact chez HumanUp', 'Your contact at HumanUp')}</div>
    ${recContact ? `<div class="rec-contact">${recContact}</div>` : ''}
  </div>
  <img class="rec-logo" src="${logoMark}" alt="HumanUp"/>
</div>
<div class="foot">${T('Document confidentiel — HumanUp Recruitment Agency. Profil anonymisé, transmis pour évaluation uniquement.', 'Confidential — HumanUp Recruitment Agency. Anonymised profile, shared for evaluation only.')}</div>
</body></html>`;
}

function contratHtml(f: ContractForm, lang: Lang): string {
  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const articles = ARTICLES.map((a, i) => `<div class="art"><div class="sec ab">Article ${i + 1}${i === 8 ? ' bis' : ''} — ${esc(lang === 'fr' ? a.fr : a.en)}</div><p class="para">${esc(articleBody(i, lang, f))}</p></div>`).join('');
  return `<!doctype html><html lang="${lang}"><head>${DOC_HEAD}<title>${t('Contrat', 'Agreement')} — ${esc(f.client || 'HumanUp')}</title></head><body>
<div class="hdr">
  <div class="eyebrow">${t('Contrat de prestation de recrutement', 'Recruitment services agreement')}</div>
  <div class="h1 ab">${esc(f.poste || t('Mission de recrutement', 'Recruitment engagement'))}</div>
  <div class="parties">
    <div><div class="pcap">${t('Le Client', 'The Client')}</div><div class="pnm">${esc(f.client || '[Client]')}</div><div class="psub">${esc(f.rep || '—')}${f.siret ? ' · ' + esc(f.siret) : ''}</div></div>
    <div><div class="pcap">${t('Le Prestataire', 'The Provider')}</div><div class="pnm">HumanUp Recruitment Agency</div><div class="psub">${t('Représenté par le consultant en charge', 'Represented by the consultant in charge')}</div></div>
  </div>
</div>
<div class="body">
  ${articles}
  <div class="sign">
    <div><div class="cap">${t('Pour le Client', 'For the Client')}</div><div class="ln"></div><div class="nm">${esc(f.rep || f.client || '—')}</div></div>
    <div><div class="cap">${t('Pour HumanUp', 'For HumanUp')}</div><div class="ln"></div><div class="nm">HumanUp Recruitment Agency</div></div>
  </div>
</div>
</body></html>`;
}

// ═════════════════════════════════════════════════════
export default function OutilsPage() {
  usePageTitle('Outil Recruteurs');
  const [tool, setTool] = useState<Tool>('home');

  return (
    <div>
      <style>{`
        .st-card{ transition:transform .25s cubic-bezier(.16,1,.3,1), box-shadow .25s ease, border-color .25s ease; }
        .st-card:hover{ transform:translateY(-5px); box-shadow:0 30px 56px -30px rgba(34,23,122,.45); border-color:rgba(34,23,122,.28) !important; }
        .st-in{ transition:border-color .18s ease, box-shadow .2s ease; }
        .st-in:focus{ outline:none; border-color:#22177A; box-shadow:0 0 0 3px rgba(34,23,122,.1); }
        .st-spin{ animation:st-rot 1s linear infinite; } @keyframes st-rot{ to{ transform:rotate(360deg); } }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {tool !== 'home' && <button onClick={() => setTool('home')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#4A4568', border: '1px solid rgba(34,23,122,.14)', background: '#fff', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}><ArrowLeft size={14} strokeWidth={2.4} />Studio</button>}
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Recruiter Studio</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: tool === 'home' ? 38 : 28, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>
            {tool === 'home' ? 'Outil Recruteurs' : tool === 'contrat' ? 'Contrat client' : 'CV & Dossier'}
          </h1>
        </div>
      </div>

      {tool === 'home' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginTop: 28, maxWidth: 760 }}>
          <button onClick={() => setTool('contrat')} className="st-card" style={{ textAlign: 'left', cursor: 'pointer', background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 22, padding: 30 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, background: '#F0F1D6', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={27} /></span>
              <ArrowRight size={22} color="#C3BFDA" />
            </div>
            <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, color: '#22177A', marginTop: 20 }}>Contrat client</div>
            <div style={{ fontSize: 14, color: '#6E6A85', marginTop: 7, lineHeight: 1.5 }}>Term & conditions au succès. Fee, garantie, paiement éditables → envoi en signature.</div>
          </button>
          <button onClick={() => setTool('cv')} className="st-card" style={{ textAlign: 'left', cursor: 'pointer', background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 22, padding: 30 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, background: '#F0F1D6', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IdCard size={27} /></span>
              <ArrowRight size={22} color="#C3BFDA" />
            </div>
            <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, color: '#22177A', marginTop: 20 }}>CV & Dossier</div>
            <div style={{ fontSize: 14, color: '#6E6A85', marginTop: 7, lineHeight: 1.5 }}>Un candidat → format HumanUp. Sections à la carte, one-page ou dossier, anonyme.</div>
          </button>
        </div>
      )}

      {tool === 'contrat' && <ContratTool />}
      {tool === 'cv' && <CvTool />}
    </div>
  );
}

// ─── CONTRAT TOOL ───────────────────────────────────
function ContratTool() {
  const [lang, setLang] = useState<Lang>('fr');
  const [sent, setSent] = useState(false);
  const [f, setF] = useState<ContractForm>({
    client: '', siret: '', adresse: '', rep: '', email: '', pays: 'France',
    feePct: '20', garantieMois: '3', proprieteMois: '12', paiement: '30 jours date de facture', poste: '',
  });
  const set = (k: keyof ContractForm, v: string) => { setF(p => ({ ...p, [k]: v })); setSent(false); };
  const { data: mandats } = useQuery({ queryKey: ['mandats', 'contrat'], queryFn: () => api.get<{ data: { id: string; titrePoste: string; entreprise: { nom: string }; client: { nom: string; prenom: string | null } | null }[] }>('/mandats?perPage=100&scope=all') });

  const err = !f.client.trim() ? 'nom du client' : !f.email.trim() ? 'e-mail du signataire' : '';
  const inStyle: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '10px 12px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', color: '#1A1533', outline: 'none' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6E6A85', marginBottom: 6 };

  const send = () => {
    if (err) { toast('error', `À compléter : ${err}`); return; }
    setSent(true);
    toast('success', `Contrat prêt — envoi en signature à ${f.email} (branchement e-signature à finaliser)`);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, marginTop: 22, alignItems: 'start' }}>
      {/* FORM */}
      <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#1A1533' }}>Paramètres</span>
          <div style={{ display: 'flex', background: '#EFEFE6', borderRadius: 9, padding: 3 }}>
            {(['fr', 'en'] as const).map(l => <button key={l} onClick={() => setLang(l)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: lang === l ? '#fff' : 'transparent', color: lang === l ? '#22177A' : '#8A7F5A' }}>{l.toUpperCase()}</button>)}
          </div>
        </div>

        <label style={{ ...lbl, marginTop: 16 }}>Pré-remplir depuis un mandat</label>
        <select onChange={e => { const m = (mandats?.data ?? []).find(x => x.id === e.target.value); if (m) { set('client', m.client ? `${m.client.prenom ? m.client.prenom + ' ' : ''}${m.client.nom}` : m.entreprise.nom); set('poste', m.titrePoste); } }} style={{ ...inStyle, cursor: 'pointer' }} defaultValue="">
          <option value="">— Choisir un mandat —</option>
          {(mandats?.data ?? []).map(m => <option key={m.id} value={m.id}>{m.titrePoste} · {m.entreprise.nom}</option>)}
        </select>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <div><label style={lbl}>Nom du client</label><input className="st-in" value={f.client} onChange={e => set('client', e.target.value)} style={inStyle} placeholder="Axiome Concept" /></div>
          <div><label style={lbl}>E-mail signataire</label><input className="st-in" value={f.email} onChange={e => set('email', e.target.value)} style={inStyle} placeholder="signataire@client.com" /></div>
          <div><label style={lbl}>SIRET / immatriculation</label><input className="st-in" value={f.siret} onChange={e => set('siret', e.target.value)} style={inStyle} /></div>
          <div><label style={lbl}>Adresse du siège</label><input className="st-in" value={f.adresse} onChange={e => set('adresse', e.target.value)} style={inStyle} /></div>
          <div><label style={lbl}>Représenté par</label><input className="st-in" value={f.rep} onChange={e => set('rep', e.target.value)} style={inStyle} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Success fee (%)</label><input className="st-in" value={f.feePct} onChange={e => set('feePct', e.target.value)} style={inStyle} /></div>
            <div><label style={lbl}>Pays</label><input className="st-in" value={f.pays} onChange={e => set('pays', e.target.value)} style={inStyle} /></div>
            <div><label style={lbl}>Garantie (mois)</label><input className="st-in" value={f.garantieMois} onChange={e => set('garantieMois', e.target.value)} style={inStyle} /></div>
            <div><label style={lbl}>Propriété (mois)</label><input className="st-in" value={f.proprieteMois} onChange={e => set('proprieteMois', e.target.value)} style={inStyle} /></div>
          </div>
          <div><label style={lbl}>Conditions de paiement</label><input className="st-in" value={f.paiement} onChange={e => set('paiement', e.target.value)} style={inStyle} /></div>
        </div>

        {err && <div style={{ marginTop: 14, background: '#FBE3E3', border: '1px solid rgba(176,54,31,.28)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#B23', lineHeight: 1.5 }}><strong>À compléter :</strong> {err}.</div>}
        {sent && <div style={{ marginTop: 14, background: '#D6F3E3', color: '#1F7A4D', fontWeight: 700, fontSize: 13, padding: '10px 12px', borderRadius: 10, textAlign: 'center' }}>✓ Prêt — envoi en signature à {f.email}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={() => printDoc(contratHtml(f, lang))} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 11, padding: 12, cursor: 'pointer' }}><Printer size={15} />Exporter (PDF)</button>
          <button onClick={send} style={{ flex: 1.3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 11, padding: 12, cursor: 'pointer' }}><Send size={15} />Envoyer en signature</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#9A96AE', lineHeight: 1.5, display: 'flex', gap: 7 }}><ShieldCheck size={13} style={{ flexShrink: 0, marginTop: 1 }} />L'e-signature (Yousign/DocuSign) sera branchée à la finalisation ; le contrat est déjà généré et imprimable.</div>
      </div>

      {/* PREVIEW */}
      <div id="print-area" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, boxShadow: '0 1px 2px rgba(34,23,122,.04)', overflow: 'hidden' }}>
        <div style={{ background: '#22177A', color: '#fff', padding: '30px 40px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(230,233,175,.7)' }}>{lang === 'fr' ? 'Contrat de prestation de recrutement' : 'Recruitment services agreement'}</div>
          <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, marginTop: 8, color: '#E6E9AF' }}>{f.poste || (lang === 'fr' ? 'Mission de recrutement' : 'Recruitment engagement')}</div>
          <div style={{ display: 'flex', gap: 40, marginTop: 20, flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>Le Client</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{f.client || '[Client]'}</div><div style={{ fontSize: 11.5, color: 'rgba(230,233,175,.75)', marginTop: 2 }}>{f.rep || '—'}{f.siret ? ` · ${f.siret}` : ''}</div></div>
            <div><div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>Le Prestataire</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>HumanUp Recruitment Agency</div><div style={{ fontSize: 11.5, color: 'rgba(230,233,175,.75)', marginTop: 2 }}>{lang === 'fr' ? 'Représenté par le consultant en charge' : 'Represented by the consultant in charge'}</div></div>
          </div>
        </div>
        <div style={{ padding: '26px 40px 36px', maxHeight: 620, overflowY: 'auto' }}>
          {ARTICLES.map((a, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 13, color: '#22177A', margin: '24px 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(34,23,122,.1)' }}>Article {i + 1}{i === 8 ? ' bis' : ''} — {lang === 'fr' ? a.fr : a.en}</div>
              <p style={{ fontSize: 11.5, lineHeight: 1.78, color: '#312C4A', textAlign: 'justify' }}>{articleBody(i, lang, f)}</p>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, marginTop: 40, paddingTop: 20, borderTop: '1px solid rgba(34,23,122,.12)' }}>
            <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A96AE' }}>{lang === 'fr' ? 'Pour le Client' : 'For the Client'}</div><div style={{ height: 60, borderBottom: '1px solid rgba(34,23,122,.2)', marginTop: 12 }} /><div style={{ fontSize: 11.5, color: '#6E6A85', marginTop: 6 }}>{f.rep || f.client || '—'}</div></div>
            <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A96AE' }}>{lang === 'fr' ? 'Pour HumanUp' : 'For HumanUp'}</div><div style={{ height: 60, borderBottom: '1px solid rgba(34,23,122,.2)', marginTop: 12 }} /><div style={{ fontSize: 11.5, color: '#6E6A85', marginTop: 6 }}>HumanUp Recruitment Agency</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CV & DOSSIER TOOL (one-pager de push) ──────────
function CvTool() {
  const [lang, setLang] = useState<Lang>('fr');
  const [keepCity, setKeepCity] = useState(false);
  const [q, setQ] = useState('');
  const [debQ, setDebQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { user } = useAuthStore();
  useEffect(() => { const t = setTimeout(() => setDebQ(q), 300); return () => clearTimeout(t); }, [q]);

  const { data: list } = useQuery({ queryKey: ['candidats', 'cvtool', debQ], queryFn: () => api.get<{ data: CandidatLite[] }>(`/candidats?perPage=8${debQ ? `&search=${encodeURIComponent(debQ)}` : ''}`) });
  const { data: cand } = useQuery({ queryKey: ['candidat', 'cvtool', selId], queryFn: () => api.get<CandidatLite>(`/candidats/${selId}`), enabled: !!selId });
  const { data: team } = useQuery({ queryKey: ['team', 'cvtool'], queryFn: () => api.get<TeamMember[]>('/settings/team') });

  // Recruteur : défaut = utilisateur connecté, sinon 1er membre
  const [recruiterId, setRecruiterId] = useState<string | null>(null);
  useEffect(() => {
    if (recruiterId || !team?.length) return;
    const me = user ? team.find(m => m.id === (user as any).id || m.email === user.email) : null;
    setRecruiterId((me || team[0]).id);
  }, [team, user, recruiterId]);
  const member = (team ?? []).find(m => m.id === recruiterId) || null;

  // Coordonnées recruteur éditables (pré-remplies depuis le membre choisi)
  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoto, setRecPhoto] = useState('');
  useEffect(() => {
    if (!member) return;
    setRecEmail(member.email || '');
    setRecPhone(member.telephone || '');
    setRecPhoto(member.avatarData || member.avatarUrl || '');
  }, [recruiterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const T = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const results = list?.data ?? [];

  const recruiter: Recruiter = {
    nom: member ? `${member.prenom ? member.prenom + ' ' : ''}${member.nom}` : (user ? `${(user as any).prenom ? (user as any).prenom + ' ' : ''}${(user as any).nom ?? ''}`.trim() : 'HumanUp'),
    email: recEmail,
    telephone: recPhone,
    avatarUrl: recPhoto || null,
  };
  const html = useMemo(
    () => (cand ? pushHtml(cand, recruiter, { lang, keepCity }) : ''),
    [cand, recEmail, recPhone, recPhoto, member?.nom, member?.prenom, lang, keepCity],
  );

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('error', 'Image uniquement (JPG/PNG).'); }
    else {
      try { setRecPhoto(await fileToThumbnail(file)); }
      catch (err: any) { toast('error', err?.message || 'Image illisible'); }
    }
    if (photoRef.current) photoRef.current.value = '';
  }

  async function saveMyPhone() {
    if (!member || member.id !== (user as any)?.id) return;
    const body: Record<string, string> = { telephone: recPhone };
    if (recPhoto.startsWith('data:')) body.avatarData = recPhoto; else body.avatarUrl = recPhoto;
    try { await api.put('/settings/me', body); toast('success', 'Profil mis à jour'); qc.invalidateQueries({ queryKey: ['team'] }); }
    catch { toast('error', 'Échec de la sauvegarde'); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { toast('error', 'PDF uniquement pour l’instant.'); if (fileRef.current) fileRef.current.value = ''; return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/ai/create-from-cv', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd, credentials: 'include' });
      if (!res.ok) { const d = await res.json().catch(() => ({} as any)); throw new Error(d?.message || 'Échec de l’analyse du CV'); }
      const json = await res.json();
      const id = json?.data?.candidatId as string | undefined;
      toast('success', 'CV analysé — profil créé et anonymisé.');
      qc.invalidateQueries({ queryKey: ['candidats'] });
      if (id) { setSelId(id); setQ(''); }
    } catch (err: any) {
      toast('error', err?.message || 'Erreur lors de l’analyse');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const inStyle: React.CSSProperties = { width: '100%', fontSize: 12.5, padding: '8px 10px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', color: '#1A1533' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', margin: '0 0 4px' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, marginTop: 22, alignItems: 'start' }}>
      {/* PANNEAU GAUCHE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Source du profil */}
        <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#1A1533' }}>Profil</span>
            <div style={{ display: 'flex', background: '#EFEFE6', borderRadius: 9, padding: 3 }}>
              {(['fr', 'en'] as const).map(l => <button key={l} onClick={() => setLang(l)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: lang === l ? '#fff' : 'transparent', color: lang === l ? '#22177A' : '#8A7F5A' }}>{l.toUpperCase()}</button>)}
            </div>
          </div>

          {/* Upload CV */}
          <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: '100%', marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px 12px', borderRadius: 12, border: '1.5px dashed rgba(34,23,122,.28)', background: '#F7F7FB', cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? <Loader2 size={20} color="#22177A" className="st-spin" /> : <Upload size={20} color="#22177A" />}
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A' }}>{uploading ? 'Analyse du CV par l’IA…' : 'Ajouter un CV (PDF)'}</span>
            <span style={{ fontSize: 11, color: '#9A96AE' }}>{uploading ? 'Extraction boîtes + réalisations' : 'Anonymisé automatiquement, enregistré en base'}</span>
          </button>

          {/* Recherche candidat existant */}
          <div style={{ position: 'relative', marginTop: 14 }}>
            <Search size={15} color="#9A96AE" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="st-in" value={q} onChange={e => setQ(e.target.value)} placeholder="…ou choisir un candidat existant" style={{ width: '100%', fontSize: 13, padding: '10px 12px 10px 34px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
          </div>
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 260, overflowY: 'auto' }}>
              {results.map(c => (
                <button key={c.id} onClick={() => setSelId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: `1px solid ${selId === c.id ? '#22177A' : 'rgba(34,23,122,.1)'}`, background: selId === c.id ? '#F2F3D8' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 10 }}>{`${(c.prenom?.[0] ?? '')}${c.nom[0] ?? ''}`.toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${c.prenom ? c.prenom + ' ' : ''}${c.nom}`}</div><div style={{ fontSize: 11.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.posteActuel || '—'}</div></div>
                </button>
              ))}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, cursor: 'pointer' }} onClick={() => setKeepCity(v => !v)}>
            <span style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${keepCity ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: keepCity ? '#E6E9AF' : '#fff', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#4A4568' }}>Afficher la ville (sinon masquée)</span>
          </label>
        </div>

        {/* Bloc recruteur (trust) */}
        <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ShieldCheck size={15} color="#22177A" />
            <span style={{ fontWeight: 800, fontSize: 14, color: '#1A1533' }}>Contact HumanUp (trust)</span>
          </div>
          <label style={lbl}>Recruteur</label>
          <select value={recruiterId ?? ''} onChange={e => setRecruiterId(e.target.value)} style={{ ...inStyle, cursor: 'pointer' }}>
            {(team ?? []).map(m => <option key={m.id} value={m.id}>{`${m.prenom ? m.prenom + ' ' : ''}${m.nom}`}</option>)}
          </select>
          <div style={{ marginTop: 10 }}><label style={lbl}>E-mail</label><input className="st-in" value={recEmail} onChange={e => setRecEmail(e.target.value)} placeholder="prenom@humanup.io" style={inStyle} /></div>
          <div style={{ marginTop: 10 }}><label style={lbl}>Téléphone</label><input className="st-in" value={recPhone} onChange={e => setRecPhone(e.target.value)} placeholder="+33 6 12 34 56 78" style={inStyle} /></div>
          <div style={{ marginTop: 10 }}>
            <label style={lbl}>Photo</label>
            <input ref={photoRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {recPhoto
                ? <img src={recPhoto} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(34,23,122,.2)', flexShrink: 0 }} />
                : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#EFEFE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Upload size={15} color="#9A96AE" /></div>}
              <button onClick={() => photoRef.current?.click()} style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#fff', border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }}>{recPhoto ? 'Changer la photo' : 'Téléverser une photo'}</button>
              {recPhoto && <button onClick={() => setRecPhoto('')} title="Retirer" style={{ fontSize: 13, color: '#9A96AE', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>✕</button>}
            </div>
          </div>
          {member && member.id === (user as any)?.id && (
            <button onClick={saveMyPhone} style={{ marginTop: 10, width: '100%', fontSize: 11.5, fontWeight: 700, color: '#22177A', background: '#F2F3D8', border: 'none', borderRadius: 9, padding: '8px 10px', cursor: 'pointer' }}>Enregistrer dans mon profil</button>
          )}
        </div>

        {cand && <button onClick={() => printDoc(pushHtml(cand, recruiter, { lang, keepCity }))} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 12, padding: 14, cursor: 'pointer', boxShadow: '0 10px 24px -12px rgba(34,23,122,.6)' }}><Printer size={16} />Exporter le one-pager (PDF)</button>}
      </div>

      {/* APERÇU WYSIWYG (= le document exporté) */}
      <div style={{ background: '#EFEFE6', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, boxShadow: '0 1px 2px rgba(34,23,122,.04)', overflow: 'hidden', minHeight: 500 }}>
        {!cand ? (
          <div style={{ padding: '80px 40px', textAlign: 'center', color: '#9A96AE', fontSize: 14, lineHeight: 1.6 }}>
            <FileText size={30} color="#C4C0D6" style={{ marginBottom: 12 }} /><br />
            Ajoutez un CV (PDF) ou choisissez un candidat.<br />HumanUp génère un one-pager <strong style={{ color: '#6E6A85' }}>anonymisé</strong> — boîtes et réalisations visibles, coordonnées masquées.
          </div>
        ) : (
          <iframe title="one-pager" srcDoc={html} style={{ width: '100%', height: 1040, border: 0, display: 'block', background: '#EFEFE6' }} />
        )}
      </div>
    </div>
  );
}
