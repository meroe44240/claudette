import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, IdCard, ArrowRight, ArrowLeft, Send, Printer, Search, Building2, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';

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
  experiences?: { id: string; titre: string; entreprise: string; anneeDebut: number; anneeFin: number | null }[];
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
        @media print { body * { visibility:hidden; } #print-area, #print-area * { visibility:visible; } #print-area{ position:absolute; left:0; top:0; width:100%; } }
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
          <button onClick={() => window.print()} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 11, padding: 12, cursor: 'pointer' }}><Printer size={15} />Imprimer</button>
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

// ─── CV & DOSSIER TOOL ──────────────────────────────
function CvTool() {
  const [lang, setLang] = useState<Lang>('fr');
  const [anon, setAnon] = useState(false);
  const [q, setQ] = useState('');
  const [debQ, setDebQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => setDebQ(q), 300); return () => clearTimeout(t); }, [q]);

  const { data: list } = useQuery({ queryKey: ['candidats', 'cvtool', debQ], queryFn: () => api.get<{ data: CandidatLite[] }>(`/candidats?perPage=8${debQ ? `&search=${encodeURIComponent(debQ)}` : ''}`) });
  const { data: cand } = useQuery({ queryKey: ['candidat', 'cvtool', selId], queryFn: () => api.get<CandidatLite>(`/candidats/${selId}`), enabled: !!selId });

  const results = list?.data ?? [];
  const name = cand ? (anon ? 'Candidat HumanUp' : `${cand.prenom ? cand.prenom + ' ' : ''}${cand.nom}`) : '';
  const T = (fr: string, en: string) => (lang === 'fr' ? fr : en);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginTop: 22, alignItems: 'start' }}>
      {/* PICKER */}
      <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#1A1533' }}>Candidat</span>
          <div style={{ display: 'flex', background: '#EFEFE6', borderRadius: 9, padding: 3 }}>
            {(['fr', 'en'] as const).map(l => <button key={l} onClick={() => setLang(l)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: lang === l ? '#fff' : 'transparent', color: lang === l ? '#22177A' : '#8A7F5A' }}>{l.toUpperCase()}</button>)}
          </div>
        </div>
        <div style={{ position: 'relative', marginTop: 14 }}>
          <Search size={15} color="#9A96AE" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input className="st-in" value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un candidat…" style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 34px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {results.map(c => (
            <button key={c.id} onClick={() => setSelId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: `1px solid ${selId === c.id ? '#22177A' : 'rgba(34,23,122,.1)'}`, background: selId === c.id ? '#F2F3D8' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 10 }}>{`${(c.prenom?.[0] ?? '')}${c.nom[0] ?? ''}`.toUpperCase()}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${c.prenom ? c.prenom + ' ' : ''}${c.nom}`}</div><div style={{ fontSize: 11.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.posteActuel || '—'}</div></div>
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14, cursor: 'pointer' }}>
          <span onClick={() => setAnon(a => !a)} style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${anon ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: anon ? '#E6E9AF' : '#fff', flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: '#4A4568' }}>Anonymiser (logo HumanUp au lieu du nom)</span>
        </label>
        {cand && <button onClick={() => window.print()} style={{ width: '100%', marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 11, padding: 12, cursor: 'pointer' }}><Printer size={15} />Exporter (PDF)</button>}
      </div>

      {/* PREVIEW */}
      <div id="print-area" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, boxShadow: '0 1px 2px rgba(34,23,122,.04)', overflow: 'hidden', minHeight: 400 }}>
        {!cand ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9A96AE', fontSize: 14 }}>Choisissez un candidat pour générer son dossier au format HumanUp.</div>
        ) : (
          <>
            <div style={{ background: '#22177A', color: '#fff', padding: '28px 36px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(230,233,175,.7)' }}>{T('Dossier de compétences', 'Competency file')}</div>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 26, marginTop: 8, color: '#E6E9AF' }}>{anon ? 'HUMANUP' : name}</div>
              <div style={{ fontSize: 13, color: 'rgba(230,233,175,.85)', marginTop: 4 }}>{[cand.posteActuel, anon ? null : cand.entrepriseActuelle, anon ? null : cand.localisation].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <div style={{ padding: '24px 36px 36px' }}>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 13, color: '#22177A', marginBottom: 8 }}>{T('Présentation', 'Summary')}</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: '#312C4A', textAlign: 'justify' }}>{cand.aiPitchLong || cand.aiPitchShort || T('Synthèse à générer depuis la fiche candidat.', 'Summary to be generated from the candidate profile.')}</p>

              {cand.tags?.length > 0 && (
                <>
                  <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 13, color: '#22177A', margin: '22px 0 8px' }}>{T('Compétences', 'Skills')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>{cand.tags.map(t => <span key={t} style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '5px 12px', background: '#F2F3D8', color: '#22177A' }}>{t}</span>)}</div>
                </>
              )}

              {(cand.experiences?.length ?? 0) > 0 && (
                <>
                  <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 13, color: '#22177A', margin: '22px 0 10px' }}>{T('Parcours', 'Experience')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {cand.experiences!.map(e => (
                      <div key={e.id} style={{ display: 'flex', gap: 12 }}>
                        <span style={{ flexShrink: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 700, color: '#8A8699', background: '#F7F7F0', borderRadius: 6, padding: '3px 9px', height: 'fit-content' }}>{e.anneeDebut}–{e.anneeFin ?? 'auj.'}</span>
                        <div><div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>{e.titre}</div><div style={{ fontSize: 12.5, color: '#22177A', fontWeight: 600 }}>{anon ? '—' : e.entreprise}</div></div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30, paddingTop: 16, borderTop: '1px solid rgba(34,23,122,.12)' }}>
                <Building2 size={16} color="#22177A" />
                <span style={{ fontSize: 11.5, color: '#6E6A85' }}>{T('Dossier confidentiel — présenté par HumanUp Recruitment Agency.', 'Confidential file — presented by HumanUp Recruitment Agency.')}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
