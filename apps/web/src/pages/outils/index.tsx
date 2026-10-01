import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, IdCard, ArrowRight, ArrowLeft, Send, Printer, Search, Building2, ShieldCheck, Upload, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';
import { useAuthStore } from '../../stores/auth-store';

type Tool = 'home' | 'contrat' | 'cv';
type Lang = 'fr' | 'en';

// ─── CONTRAT : articles rédigés (FR/EN) ─────────────
interface Article { num: string; title: string; blocks: { lead: string; text: string }[] }
const A = (num: string, title: string, blocks: [string, string][]): Article => ({ num, title, blocks: blocks.map(([lead, text]) => ({ lead, text })) });

const PREAMBLE: Record<Lang, string> = {
  fr: 'Le Client souhaite faire appel au Prestataire, cabinet de recrutement, pour l’accompagner dans le recrutement de collaborateurs. Les Parties conviennent de formaliser leur collaboration dans le présent Contrat.',
  en: 'The Client wishes to engage the Provider, a recruitment agency, to support the hiring of employees. The Parties agree to formalise their collaboration in this Agreement.',
};

const artHead = (a: Article) => `Article ${a.num.replace('bis', ' bis')} - ${a.title}`;

function contractArticles(lang: Lang, f: ContractForm): Article[] {
  const fr = lang === 'fr';
  const commClient = `${f.client || '[Client]'} : ${f.adresse || (fr ? '[adresse]' : '[address]')}${f.email ? ` / ${f.email}` : ''}`;
  if (!fr) return [
    A('1','Purpose of the Agreement',[['','The purpose of this Agreement is to define the conditions under which the Provider shall deliver recruitment services to the Client for positions to be filled within its organisation.']]),
    A('2','Description of Services',[
      ['','The Provider undertakes to deliver the following services to the Client:'],
      ['a) ','In-depth analysis of the recruitment needs expressed by the Client and definition of the target profile;'],
      ['b) ','Drafting and posting of job advertisements on the appropriate channels;'],
      ['c) ','Identification, direct approach (headhunting) and pre-selection of candidates matching the defined criteria;'],
      ['d) ','Conduct of qualification interviews and assessment of candidates’ skills;'],
      ['e) ','Presentation to the Client of a selection of qualified profiles together with detailed application files;'],
      ['f) ','Follow-up of the recruitment process through to the effective onboarding of the selected candidate;'],
      ['g) ','Collection of professional references from the finalist candidates’ former employers.'],
      ['','It is expressly agreed that the Provider acts as an intermediary. The final hiring decision rests exclusively with the Client.']
    ]),
    A('3','Term of the Agreement',[
      ['3.1 Entry into force: ','This Agreement takes effect upon its signature by both Parties.'],
      ['3.2 Term: ','The Agreement is entered into for an indefinite term.'],
      ['3.3 Termination: ','Either Party may terminate the Agreement at any time by written notice sent to the other Party by email. Termination takes effect on the date the email is received.'],
      ['3.4 Effects of termination: ','Termination does not release the Client from its payment obligations for assignments in progress or candidates presented before the termination date, in accordance with Article 5.']
    ]),
    A('4','Fees',[
      ['4.1 Success fee: ',`Upon a successful hire, the Client shall pay the Provider fees equal to ${f.feePct} % of the annual gross package of the hired candidate.`],
      ['','The annual gross package comprises: the fixed annual gross salary, the target variable pay over twelve (12) months, and any benefit in kind measurable in cash (company car, etc.).'],
      ['','No amount is due until a candidate is hired. The service is remunerated on a success basis only.'],
      ['4.2 Triggering event: ','The fees become payable on the date the candidate signs the employment offer.'],
      ['4.3 Payment terms: ',`${f.paiement}. Fees are stated exclusive of tax; any applicable tax is borne by the Client.`],
      ['4.4 Late-payment penalties: ','Any late payment automatically incurs penalties calculated at three times the legal interest rate in force, together with a fixed recovery indemnity of forty euros (€40) (art. L.441-10 French Commercial Code).']
    ]),
    A('5','Ownership of candidates',[
      ['5.1 Presented candidates: ',`Candidates identified, approached and presented by the Provider under this Agreement remain the exclusive property of HUMANUP for a period of ${f.proprieteMois} months from their presentation to the Client.`],
      ['5.2 Deferred hiring: ','If the Client hires, directly or indirectly, a candidate presented by the Provider within this period, whether for the initial role or any other role, the fees set out in Article 4.1 are due in full.'],
      ['5.3 Disclosure to third parties: ','The Client shall not disclose application files to third parties, subsidiaries or affiliated companies without the Provider’s prior written consent. Any hiring by such an entity of a presented candidate makes the fees fully due.'],
      ['5.4 Survival: ','The provisions of this article survive termination of the Agreement.']
    ]),
    A('6','Replacement guarantee',[
      ['6.1 Principle: ',`In the event of the voluntary departure of the hired candidate, or termination of the employment contract at the Client’s initiative, occurring during the initial probation period and within ${f.garantieMois} months of the effective start date, the Provider undertakes to carry out a new search at no additional fee.`],
      ['6.2 Conditions: ','This guarantee is subject to the following cumulative conditions: a) the Client informs the Provider in writing within fifteen (15) calendar days of the effective end of the employment contract; b) the role remains identical in duties, responsibilities and pay level; c) the Client has paid all sums due for the initial assignment.'],
      ['6.3 Exclusions: ','The guarantee does not apply in the event of economic redundancy, removal or substantial modification of the role, or the Client’s breach of its contractual obligations towards the candidate.']
    ]),
    A('7','Confidentiality',[
      ['7.1 Principle: ','Each Party undertakes to treat as strictly confidential all information exchanged under this Agreement.'],
      ['7.2 Term: ','This confidentiality obligation remains in force throughout the Agreement and for five (5) years after its termination.'],
      ['7.3 Exceptions: ','Information already in the public domain or required to be disclosed under a legal obligation is not deemed confidential.']
    ]),
    A('8','Personal data',[
      ['','Each Party processes personal data for the sole purpose of performing this Agreement. Candidate files are transmitted for assessment purposes only and may not be retained, duplicated or reused for any other role without the Provider’s prior written consent.']
    ]),
    A('8bis','Reference and communication',[
      ['','The Client authorises the Provider to mention its name and display its logo as a commercial reference on its website, presentation materials and client testimonials. This authorisation may be withdrawn at any time by written notice.']
    ]),
    A('9','Non-solicitation',[
      ['','The Client undertakes not to solicit, poach or hire, directly or indirectly, the Provider’s staff throughout the Agreement and for twelve (12) months after its termination.'],
      ['','In the event of breach, the Client shall owe a fixed indemnity equal to twelve (12) months of the gross pay of the staff member concerned.']
    ]),
    A('10','Liability and indemnification',[
      ['10.1 Limitation: ','The Provider cannot be held liable for the hiring decisions made by the Client, for the final fit between candidate and role, or for any direct or indirect consequences of hiring or not hiring a presented candidate.'],
      ['10.2 Indemnification: ','Each Party’s liability, on all grounds combined, is capped at the amount of the fees due for the relevant assignment.']
    ]),
    A('11','Independence of the Parties',[['','The Provider carries out its activity in full independence. This Agreement creates no relationship of subordination, agency, partnership or company between the Parties.']]),
    A('12','Communications',[
      ['','Any notice or communication between the Parties shall be sent to the following contacts:'],
      ['a) ',commClient],
      ['b) ','HUMANUP : 86-90 Paul Street, London EC2A 4NE, UK / Suite 2504, 25/F Tower 1, The Gateway, Kowloon, Hong Kong / meroe@humanup.io']
    ]),
    A('13','Amendments',[['','Any amendment to this Agreement must be the subject of a written addendum signed by both Parties.']]),
    A('14','Assignment',[['','This Agreement is intuitu personae. Neither Party may assign its rights or obligations without the prior written consent of the other Party.']]),
    A('15','Entire agreement',[['','This Agreement constitutes the entire agreement between the Parties and supersedes any prior agreement, negotiation or discussion, written or oral, relating to its subject matter.']]),
    A('16','Severability',[['','Should any clause of this Agreement be declared void or unenforceable, the remaining provisions shall remain in force and retain full effect.']]),
    A('17','Dispute resolution',[
      ['17.1 Mediation: ','In the event of a dispute relating to the interpretation or performance of this Agreement, the Parties undertake to seek an amicable solution before any legal action.'],
      ['17.2 Jurisdiction: ',`Failing an amicable resolution within thirty (30) days, the dispute shall be submitted to the competent courts of ${f.pays}.`]
    ]),
    A('18','Governing law',[['',`This Agreement is governed by the law of ${f.pays}.`]])
  ];
  return [
    A('1','Objet du Contrat',[['','Le présent Contrat a pour objet de définir les conditions dans lesquelles le Prestataire fournira au Client des prestations de recrutement pour des postes à pourvoir au sein de son organisation.']]),
    A('2','Description des Services',[
      ['','Le Prestataire s’engage à fournir au Client les prestations suivantes :'],
      ['a) ','L’analyse approfondie des besoins en recrutement exprimés par le Client et la définition du profil recherché ;'],
      ['b) ','La rédaction et la diffusion des offres d’emploi sur les supports appropriés ;'],
      ['c) ','L’identification, l’approche directe (chasse) et la présélection de candidats répondant aux critères définis ;'],
      ['d) ','La conduite des entretiens de qualification et l’évaluation des compétences des candidats ;'],
      ['e) ','La présentation au Client d’une sélection de profils qualifiés accompagnés de dossiers de candidature détaillés ;'],
      ['f) ','Le suivi du processus de recrutement jusqu’à l’intégration effective du candidat retenu ;'],
      ['g) ','La prise de références professionnelles auprès des anciens employeurs des candidats finalistes.'],
      ['','Il est expressément convenu que le Prestataire intervient en qualité d’intermédiaire. La décision finale de recrutement appartient exclusivement au Client.']
    ]),
    A('3','Durée du Contrat',[
      ['3.1 Entrée en vigueur : ','Le présent Contrat entre en vigueur à compter de sa signature par les deux Parties.'],
      ['3.2 Durée : ','Le Contrat est conclu pour une durée indéterminée.'],
      ['3.3 Résiliation : ','Chaque Partie peut mettre fin au présent Contrat à tout moment par notification écrite adressée par email à l’autre Partie. La résiliation prend effet à la date de réception de l’email.'],
      ['3.4 Effets de la résiliation : ','La résiliation du Contrat ne libère pas le Client de ses obligations de paiement pour les missions en cours ou les candidats présentés avant la date de résiliation, conformément à l’Article 5 du présent Contrat.']
    ]),
    A('4','Rémunération',[
      ['4.1 Honoraires de succès : ',`En cas de recrutement réussi, le Client versera au Prestataire des honoraires équivalents à ${f.feePct} % du package annuel brut du candidat recruté.`],
      ['','Le package annuel brut comprend : le salaire fixe brut annuel, la rémunération variable cible sur douze (12) mois, ainsi que tout avantage en nature évaluable en numéraire (véhicule de fonction, etc.).'],
      ['','Aucune somme n’est due tant qu’aucun candidat n’est recruté. La prestation est exclusivement rémunérée au succès.'],
      ['4.2 Fait générateur : ','Les honoraires deviennent exigibles à la date de signature de l’offre d’embauche par le candidat.'],
      ['4.3 Modalités de paiement : ',`${f.paiement}. Les honoraires sont indiqués hors taxes ; toute taxe applicable sera à la charge du Client.`],
      ['4.4 Pénalités de retard : ','En cas de retard de paiement, des pénalités seront automatiquement exigibles, calculées sur la base de trois fois le taux d’intérêt légal en vigueur. Une indemnité forfaitaire de recouvrement de quarante euros (40 €) sera également due conformément à l’article L.441-10 du Code de commerce.']
    ]),
    A('5','Propriété des candidats',[
      ['5.1 Candidats présentés : ',`Les candidats identifiés, approchés et présentés par le Prestataire dans le cadre du présent Contrat demeurent la propriété exclusive de HUMANUP pendant une durée de ${f.proprieteMois} mois à compter de leur présentation au Client.`],
      ['5.2 Recrutement différé : ','Si le Client recrute, directement ou indirectement, un candidat présenté par le Prestataire dans ce délai, que ce soit pour le poste initial ou pour tout autre poste, les honoraires prévus à l’Article 4.1 seront intégralement dus.'],
      ['5.3 Transmission à des tiers : ','Le Client s’interdit de transmettre les dossiers de candidature à des tiers, filiales, sociétés liées ou partenaires sans l’accord écrit préalable du Prestataire. En cas de recrutement par l’une de ces entités d’un candidat présenté, les honoraires seront intégralement dus.'],
      ['5.4 Survie de la clause : ','Les dispositions du présent article survivent à la résiliation du Contrat.']
    ]),
    A('6','Garantie de remplacement',[
      ['6.1 Principe : ',`En cas de départ volontaire du candidat recruté ou de rupture du contrat de travail à l’initiative du Client intervenant durant la période d’essai initiale et dans la limite de ${f.garantieMois} mois suivant la prise de poste effective, le Prestataire s’engage à effectuer une nouvelle recherche de candidat sans honoraires supplémentaires.`],
      ['6.2 Conditions d’application : ','Cette garantie est soumise au respect cumulatif des conditions suivantes : a) le Client informe le Prestataire par écrit dans un délai de quinze (15) jours calendaires suivant la fin effective du contrat de travail ; b) le poste à pourvoir demeure identique en termes de fonctions, responsabilités et niveau de rémunération ; c) le Client a réglé l’intégralité des sommes dues au titre de la mission initiale.'],
      ['6.3 Exclusions : ','La garantie ne s’applique pas en cas de licenciement économique, suppression ou modification substantielle du poste, ou manquement du Client à ses obligations contractuelles envers le candidat.']
    ]),
    A('7','Confidentialité',[
      ['7.1 Principe : ','Chaque Partie s’engage à considérer comme strictement confidentielles toutes les informations échangées dans le cadre du présent Contrat.'],
      ['7.2 Durée : ','Cette obligation de confidentialité reste en vigueur pendant toute la durée du Contrat et se poursuit pendant une durée de cinq (5) ans après sa résiliation.'],
      ['7.3 Exceptions : ','Ne sont pas considérées comme confidentielles les informations qui étaient déjà dans le domaine public ou qui doivent être divulguées en vertu d’une obligation légale.']
    ]),
    A('8','Données personnelles',[
      ['','Chaque Partie traite les données personnelles aux seules fins d’exécution du présent Contrat. Les dossiers de candidature sont transmis pour évaluation uniquement et ne peuvent être conservés, dupliqués ou réutilisés pour un autre poste sans accord écrit préalable du Prestataire.']
    ]),
    A('8bis','Référence et communication',[
      ['','Le Client autorise le Prestataire à mentionner son nom et à afficher son logo à titre de référence commerciale sur son site, ses supports de présentation et ses témoignages clients. Cette autorisation est révocable à tout moment par simple notification écrite.']
    ]),
    A('9','Non-sollicitation',[
      ['','Le Client s’engage à ne pas solliciter, débaucher ou recruter, directement ou indirectement, les collaborateurs du Prestataire pendant toute la durée du Contrat et pendant une période de douze (12) mois suivant sa résiliation.'],
      ['','En cas de non-respect de cet engagement, le Client sera redevable d’une indemnité forfaitaire équivalente à douze (12) mois de rémunération brute du collaborateur concerné.']
    ]),
    A('10','Responsabilité et indemnisation',[
      ['10.1 Limitation : ','Le Prestataire ne pourra être tenu responsable des décisions de recrutement prises par le Client, de l’adéquation définitive entre le candidat et le poste, ni des conséquences directes ou indirectes résultant de l’embauche ou de la non-embauche d’un candidat présenté.'],
      ['10.2 Indemnisation : ','La responsabilité de chaque Partie, toutes causes confondues, est limitée au montant des honoraires dus au titre de la mission concernée.']
    ]),
    A('11','Indépendance des Parties',[['','Le Prestataire exerce son activité en toute indépendance. Le présent Contrat ne crée entre les Parties aucun lien de subordination, de mandat, de société ou d’association.']]),
    A('12','Communications',[
      ['','Toute notification ou communication entre les Parties sera adressée aux coordonnées suivantes :'],
      ['a) ',commClient],
      ['b) ','HUMANUP : 86-90 Paul Street, London EC2A 4NE, UK / Suite 2504, 25/F Tower 1, The Gateway, Kowloon, Hong Kong / meroe@humanup.io']
    ]),
    A('13','Modifications',[['','Toute modification du présent Contrat devra faire l’objet d’un avenant écrit signé par les deux Parties.']]),
    A('14','Cession',[['','Le présent Contrat est conclu intuitu personae. Aucune Partie ne pourra céder ses droits ou obligations sans l’accord écrit préalable de l’autre Partie.']]),
    A('15','Intégralité de l’accord',[['','Le présent Contrat constitue l’intégralité de l’accord entre les Parties et annule et remplace tout accord, négociation ou discussion antérieure, écrite ou verbale, relative à son objet.']]),
    A('16','Divisibilité',[['','Si l’une des clauses du présent Contrat était déclarée nulle ou inapplicable, les autres dispositions resteraient en vigueur et conserveraient leur plein effet.']]),
    A('17','Résolution des litiges',[
      ['17.1 Médiation : ','En cas de différend relatif à l’interprétation ou à l’exécution du présent Contrat, les Parties s’engagent à rechercher une solution amiable avant toute action judiciaire.'],
      ['17.2 Juridiction compétente : ',`À défaut de résolution amiable dans un délai de trente (30) jours, le litige sera soumis aux tribunaux compétents de ${f.pays}.`]
    ]),
    A('18','Loi applicable',[['',`Le présent Contrat est régi par le droit de ${f.pays}.`]])
  ];
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
.hdr-right{display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0}
.badge{font-size:8pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#E6E9AF;border:1px solid rgba(230,233,175,.5);border-radius:999px;padding:6px 13px;white-space:nowrap}
.offices{font-size:7.5pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(230,233,175,.55);white-space:nowrap}
.hrule{height:1px;background:rgba(230,233,175,.22);margin:14px 0 13px}
.eyebrow{font-size:8.5pt;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:rgba(230,233,175,.62)}
.h1{font-size:22pt;margin-top:5px;color:#E6E9AF;line-height:1.08}
.poste{font-size:12pt;font-weight:700;color:#F2F3D8;margin-top:5px}
.sub{font-size:10.5pt;color:rgba(230,233,175,.85);margin-top:7px}
.body{padding:12mm 18mm 10mm}
.sec{font-size:11pt;color:#22177A;margin:0 0 8px}
.sec.mt{margin-top:17px}
.para{font-size:10.5pt;line-height:1.7;color:#312C4A;text-align:justify;margin:0}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:9.5pt;font-weight:700;border-radius:999px;padding:5px 12px;background:#F2F3D8;color:#22177A}
.kpis{margin-top:16px;background:#F7F7EE;border-left:3px solid #E6E9AF;padding:13px 18px}
.kpis-t{font-size:8pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8A7F5A;margin-bottom:9px}
.kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}
.kpi{font-size:10.5pt;line-height:1.4;color:#22177A;font-weight:700}
.strengths{display:flex;flex-direction:column;gap:6px;margin-top:2px}
.strength{display:flex;gap:10px;font-size:10.5pt;line-height:1.5;color:#312C4A}
.strength .ck{flex-shrink:0;width:5px;height:5px;border-radius:1px;background:#22177A;margin-top:7px}
.xps{display:flex;flex-direction:column;gap:12px;margin-top:2px}
.xp{display:flex;gap:12px;page-break-inside:avoid}
.yr{flex-shrink:0;font-family:ui-monospace,Menlo,monospace;font-size:8.5pt;font-weight:700;color:#8A8699;background:#F7F7F0;border-radius:6px;padding:3px 9px;height:fit-content;min-width:74px;text-align:center}
.yr.np{background:transparent;box-shadow:none}
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
.art .sec{margin:20px 0 9px;padding-bottom:6px;border-bottom:1px solid rgba(34,23,122,.1);break-after:avoid;page-break-after:avoid}
.art .para{font-size:9.5pt;line-height:1.72;margin-bottom:7px;orphans:3;widows:3}
.art .para b{font-weight:800}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:34px;padding-top:18px;border-top:1px solid rgba(34,23,122,.14);page-break-inside:avoid}
.sign .cap{font-size:9pt;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9A96AE}
.sign .ln{height:52px;border-bottom:1px solid rgba(34,23,122,.25);margin-top:10px}
.sign .nm{font-size:9.5pt;color:#6E6A85;margin-top:6px}
.parties{display:flex;gap:34px;flex-wrap:wrap;margin-top:18px}
.pcap{font-size:8.5pt;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:rgba(230,233,175,.55)}
.pnm{font-size:11pt;font-weight:700;margin-top:4px}
.psub{font-size:9.5pt;color:rgba(230,233,175,.75);margin-top:2px}
.dc .body{padding:14mm 20mm 12mm}
.dc .sec{font-size:12pt;margin-top:22px}
.dc .para{font-size:11pt;line-height:1.75}
.dc .h1{font-size:24pt}
.dc .strength{font-size:10.5pt}
.dc .xp{page-break-inside:avoid;margin-bottom:3px}
.dc .hl li{font-size:10pt}
</style>`;

// One-pager de PUSH : anonymisé (pas de nom/coordonnées/photo candidat), mais
// boîtes réelles + réalisations visibles, brandé HumanUp + bloc recruteur (trust).
// ─── MODÈLE DE DOCUMENT (Studio de proposition) ─────
type DocFormat = 'onepager' | 'dc';
type SecKind = 'summary' | 'strengths' | 'skills' | 'experience' | 'pitch' | 'availability';
interface SecItem { id: string; text: string; on: boolean; hi: boolean }
interface ExpEntry { id: string; on: boolean; titre: string; entreprise: string; anneeDebut: string; anneeFin: string; highlights: SecItem[] }
interface DocSection { id: string; kind: SecKind; title: string; on: boolean; body?: string; items?: SecItem[]; exps?: ExpEntry[] }
interface AnonCfg { name: boolean; currentCompany: boolean; allCompanies: boolean; city: boolean }
interface HdrTr { title: string; poste: string } // intitulés d'en-tête traduits (vide = valeur de la fiche)
interface DocConfig { format: DocFormat; anon: AnonCfg; target: string; sections: DocSection[]; hideOffices: boolean; hdr?: HdrTr }

// Applique fn à tous les textes traduisibles (titres, corps, items, intitulés de poste, réalisations).
function mapSectionTexts(secs: DocSection[], fn: (t: string) => string): DocSection[] {
  return secs.map(s => ({
    ...s, title: fn(s.title), body: s.body === undefined ? s.body : fn(s.body),
    items: s.items?.map(i => ({ ...i, text: fn(i.text) })),
    exps: s.exps?.map(x => ({ ...x, titre: fn(x.titre), highlights: x.highlights.map(h => ({ ...h, text: fn(h.text) })) })),
  }));
}

// Titres de sections par défaut : traduction fixe (pas d'appel IA).
const SECTION_TITLES: [string, string][] = [
  ['En bref', 'Summary'], ['Points forts', 'Key strengths'], ['Parcours & réalisations', 'Track record'],
  ['Pourquoi ce candidat', 'Why this candidate'], ['Disponibilité & prétentions', 'Availability & expectations'],
];

// Construit les sections par défaut depuis le candidat (l'utilisateur les édite ensuite).
function buildSections(cand: CandidatLite, lang: Lang): DocSection[] {
  const T = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const anon = cand.aiAnonymizedProfile || {};
  const exps = (cand.experiences ?? []).slice().sort((a, b) => (b.anneeDebut || 0) - (a.anneeDebut || 0));
  const numericKeys = new Set(
    exps.flatMap((e, ei) => (e.highlights ?? []).map((h, hi) => ({ h, k: `${ei}-${hi}` })))
      .filter(x => /\d/.test(x.h)).slice(0, 4).map(x => x.k),
  );
  const strengthsSeed = (anon.bullet_points && anon.bullet_points.length ? anon.bullet_points : (cand.aiSellingPoints || [])).slice(0, 6);
  return [
    { id: 'summary', kind: 'summary', title: T(...SECTION_TITLES[0]), on: true, body: anon.summary || cand.aiPitchLong || cand.aiPitchShort || '' },
    { id: 'strengths', kind: 'strengths', title: T(...SECTION_TITLES[1]), on: true, items: strengthsSeed.map((t, i) => ({ id: `s${i}`, text: t, on: true, hi: false })) },
    {
      id: 'experience', kind: 'experience', title: T(...SECTION_TITLES[2]), on: true,
      exps: exps.map((e, ei) => ({
        id: `x${ei}`, on: true, titre: e.titre, entreprise: e.entreprise, anneeDebut: String(e.anneeDebut ?? ''), anneeFin: e.anneeFin ? String(e.anneeFin) : '',
        highlights: (e.highlights ?? []).map((h, hi) => ({ id: `x${ei}h${hi}`, text: h, on: true, hi: numericKeys.has(`${ei}-${hi}`) })),
      })),
    },
    { id: 'pitch', kind: 'pitch', title: T(...SECTION_TITLES[3]), on: false, body: cand.aiIdealFor || '' },
    { id: 'availability', kind: 'availability', title: T(...SECTION_TITLES[4]), on: false, body: '' },
  ];
}

// Moteur de rendu du document (one-pager OU DC) piloté par la config.
function docHtml(cand: CandidatLite, cfg: DocConfig, rec: Recruiter, lang: Lang): string {
  const T = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const origin = window.location.origin;
  const logoMarkCream = `${origin}/brand/logo-mark-cream.png`;
  const { anon } = cfg;
  const isDc = cfg.format === 'dc';

  const exps = (cand.experiences ?? []);
  const starts = exps.map(e => e.anneeDebut).filter((n): n is number => !!n);
  const years = starts.length ? Math.max(1, new Date().getFullYear() - Math.min(...starts)) : 0;

  const anonProfile = cand.aiAnonymizedProfile || {};
  const fullName = `${cand.prenom ? cand.prenom + ' ' : ''}${cand.nom}`.trim();
  const jobTitle = cfg.hdr?.title || anonProfile.title || cand.posteActuel || T('Profil', 'Profile');
  const showName = !anon.name && !!fullName;
  const h1 = showName ? fullName : jobTitle;
  const posteLine = showName && cand.posteActuel ? esc(cfg.hdr?.poste || cand.posteActuel) : '';

  const metaBits = [
    years ? `${years} ${T('ans d’expérience', 'years of experience')}` : null,
    exps.length ? `${exps.length} ${T('expériences', 'roles')}` : null,
    !anon.city && cand.localisation ? cand.localisation : null,
  ].filter(Boolean);

  // Bandeau highlight = tous les éléments étoilés (points forts + réalisations de parcours).
  const starred: string[] = [];
  for (const s of cfg.sections) {
    if (!s.on) continue;
    if (s.items) starred.push(...s.items.filter(i => i.on && i.hi).map(i => i.text));
    if (s.exps) for (const x of s.exps) if (x.on) starred.push(...x.highlights.filter(h => h.on && h.hi).map(h => h.text));
  }
  const kpisHtml = starred.length
    ? `<div class="kpis"><div class="kpis-t">${T('Réalisations clés', 'Key achievements')}</div><div class="kpi-grid">${starred.slice(0, isDc ? 8 : 4).map(a => `<div class="kpi">${esc(a)}</div>`).join('')}</div></div>`
    : '';

  const companyLabel = (entreprise: string, isRecent: boolean): string => {
    if (anon.allCompanies || (anon.currentCompany && isRecent)) return T('Entreprise confidentielle', 'Confidential company');
    return entreprise || '';
  };

  const sectionsHtml = cfg.sections.filter(s => s.on).map(s => {
    if (s.kind === 'summary' || s.kind === 'availability') {
      const body = (s.body || '').trim();
      return body ? `<div class="sec mt ab">${esc(s.title)}</div><p class="para">${esc(body)}</p>` : '';
    }
    if (s.kind === 'pitch') {
      const body = (s.body || '').trim();
      return body ? `<div class="ideal"><b>${esc(s.title)}${cfg.target ? ` — ${esc(cfg.target)}` : ''}</b>${esc(body)}</div>` : '';
    }
    if (s.kind === 'strengths') {
      const items = (s.items ?? []).filter(i => i.on && !i.hi); // les étoilés remontent dans le bandeau
      return items.length ? `<div class="sec mt ab">${esc(s.title)}</div><div class="strengths">${items.map(i => `<div class="strength"><span class="ck"></span><span>${esc(i.text)}</span></div>`).join('')}</div>` : '';
    }
    if (s.kind === 'skills') {
      const items = (s.items ?? []).filter(i => i.on);
      return items.length ? `<div class="sec mt ab">${esc(s.title)}</div><div class="chips">${items.map(i => `<span class="chip">${esc(i.text)}</span>`).join('')}</div>` : '';
    }
    if (s.kind === 'experience') {
      const list = (s.exps ?? []).filter(x => x.on);
      if (!list.length) return '';
      return `<div class="sec mt ab">${esc(s.title)}</div><div class="xps">${list.map((x, idx) => {
        const hl = x.highlights.filter(h => h.on && !h.hi);
        const period = x.anneeDebut ? `${esc(x.anneeDebut)}–${x.anneeFin ? esc(x.anneeFin) : T('auj.', 'now')}` : (x.anneeFin ? esc(x.anneeFin) : '');
        const company = companyLabel(x.entreprise, idx === 0);
        return `<div class="xp">${period ? `<span class="yr">${period}</span>` : '<span class="yr np"></span>'}<div style="min-width:0"><div class="xt">${esc(x.titre)}</div>${company ? `<div class="xe">${esc(company)}</div>` : ''}${hl.length ? `<ul class="hl">${hl.map(h => `<li>${esc(h.text)}</li>`).join('')}</ul>` : ''}</div></div>`;
      }).join('')}</div>`;
    }
    return '';
  }).join('\n  ');

  const recInitials = (rec.nom || 'HU').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const recPhoto = rec.avatarUrl ? `<img class="rec-photo" src="${esc(rec.avatarUrl)}" alt="${esc(rec.nom)}"/>` : `<div class="rec-photo">${esc(recInitials)}</div>`;
  const recContact = [
    rec.email ? `<span>${esc(rec.email)}</span>` : '',
    rec.telephone ? `<span>${esc(rec.telephone)}</span>` : '',
  ].filter(Boolean).join('');

  const badge = isDc ? T('Dossier de compétences', 'Competency file') : T('Profil confidentiel', 'Confidential profile');
  const eyebrow = cfg.target ? `${T('Proposé pour', 'Proposed for')} ${esc(cfg.target)}` : '';
  const footAnon = anon.name ? T('Profil anonymisé, transmis pour évaluation uniquement.', 'Anonymised profile, shared for evaluation only.') : T('Document transmis pour évaluation uniquement.', 'Shared for evaluation only.');

  return `<!doctype html><html lang="${lang}"><head>${DOC_HEAD}<title>${isDc ? 'DC' : T('Profil', 'Profile')} — ${esc(h1)}</title></head><body class="doc ${isDc ? 'dc' : 'op'}">
<div class="hdr">
  <div class="brandbar">
    <div class="brand">
      <img class="mark" src="${logoMarkCream}" alt="HumanUp"/>
      <div class="wordmark"><div class="wm-name ab">HUMANUP</div><div class="wm-sub">Recruitment Agency&nbsp; ·&nbsp; humanup.io</div></div>
    </div>
    <div class="hdr-right">
      <span class="badge">${badge}</span>
      ${cfg.hideOffices ? '' : '<div class="offices">Hong Kong&nbsp; ·&nbsp; Canada</div>'}
    </div>
  </div>
  <div class="hrule"></div>
  ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
  <div class="h1 ab">${esc(h1)}</div>
  ${posteLine ? `<div class="poste">${posteLine}</div>` : ''}
  ${metaBits.length ? `<div class="sub">${esc(metaBits.join('  ·  '))}</div>` : ''}
</div>
<div class="body">
  ${kpisHtml}
  ${sectionsHtml}
</div>
<div class="rec">
  ${recPhoto}
  <div class="rec-info">
    <div class="rec-name">${esc(rec.nom || 'HumanUp')}</div>
    <div class="rec-role">International Recruiter</div>
    ${recContact ? `<div class="rec-contact">${recContact}</div>` : ''}
  </div>
</div>
<div class="foot">${cfg.hideOffices ? '' : 'Hong Kong · Canada · '}humanup.io — ${footAnon}</div>
</body></html>`;
}

function contratHtml(f: ContractForm, lang: Lang): string {
  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const articles = contractArticles(lang, f).map(a => `<div class="art"><div class="sec ab">${esc(artHead(a))}</div>${a.blocks.map(b => `<p class="para">${b.lead ? `<b>${esc(b.lead)}</b>` : ''}${esc(b.text)}</p>`).join('')}</div>`).join('');
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
  <div class="art"><div class="sec ab">${t('Préambule', 'Preamble')}</div><p class="para">${esc(PREAMBLE[lang])}</p></div>
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
            <div><div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>{lang === 'fr' ? 'Le Client' : 'The Client'}</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>{f.client || '[Client]'}</div><div style={{ fontSize: 11.5, color: 'rgba(230,233,175,.75)', marginTop: 2 }}>{f.rep || '—'}{f.siret ? ` · ${f.siret}` : ''}</div></div>
            <div><div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>{lang === 'fr' ? 'Le Prestataire' : 'The Provider'}</div><div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4 }}>HumanUp Recruitment Agency</div><div style={{ fontSize: 11.5, color: 'rgba(230,233,175,.75)', marginTop: 2 }}>{lang === 'fr' ? 'Représenté par le consultant en charge' : 'Represented by the consultant in charge'}</div></div>
          </div>
        </div>
        <div style={{ padding: '26px 40px 36px', maxHeight: 620, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 13, color: '#22177A', margin: '0 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(34,23,122,.1)' }}>{lang === 'fr' ? 'Préambule' : 'Preamble'}</div>
          <p style={{ fontSize: 11.5, lineHeight: 1.78, color: '#312C4A', textAlign: 'justify' }}>{PREAMBLE[lang]}</p>
          {contractArticles(lang, f).map(a => (
            <div key={a.num}>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 13, color: '#22177A', margin: '24px 0 10px', paddingBottom: 6, borderBottom: '1px solid rgba(34,23,122,.1)' }}>{artHead(a)}</div>
              {a.blocks.map((b, j) => (
                <p key={j} style={{ fontSize: 11.5, lineHeight: 1.78, color: '#312C4A', textAlign: 'justify', marginBottom: 9 }}>{b.lead && <strong style={{ fontWeight: 800 }}>{b.lead}</strong>}{b.text}</p>
              ))}
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

// ─── STUDIO DE PROPOSITION (one-pager / DC) ─────────
function CvTool() {
  const [lang, setLang] = useState<Lang>('fr');
  const [format, setFormat] = useState<DocFormat>('onepager');
  const [anon, setAnon] = useState<AnonCfg>({ name: true, currentCompany: false, allCompanies: false, city: true });
  const [hideOffices, setHideOffices] = useState(false);
  const [targetMode, setTargetMode] = useState<'none' | 'mandat' | 'free'>('none');
  const [mandatId, setMandatId] = useState('');
  const [targetFree, setTargetFree] = useState('');
  const [sections, setSections] = useState<DocSection[]>([]);
  const [openSec, setOpenSec] = useState<Set<string>>(() => new Set(['strengths', 'experience']));
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
  const { data: mandats } = useQuery({ queryKey: ['mandats', 'cvtarget'], queryFn: () => api.get<{ data: { id: string; titrePoste: string; entreprise: { nom: string } }[] }>('/mandats?perPage=100&scope=all'), enabled: targetMode === 'mandat' });

  // ── traduction du contenu (une version du document par langue) ──
  const NO_HDR: HdrTr = { title: '', poste: '' };
  const [hdr, setHdr] = useState<HdrTr>(NO_HDR);
  const [translating, setTranslating] = useState(false);
  const versions = useRef<Partial<Record<Lang, { sections: DocSection[]; hdr: HdrTr }>>>({});
  const trReq = useRef(0);

  async function translateInto(target: Lang, src: DocSection[]) {
    if (!cand) return;
    const reqId = ++trReq.current;
    setTranslating(true);
    try {
      const hdrSrc: HdrTr = { title: cand.aiAnonymizedProfile?.title || cand.posteActuel || '', poste: cand.posteActuel || '' };
      const dict = new Map<string, string>(SECTION_TITLES.flatMap(([fr, en]) => (target === 'en' ? [[fr, en]] : [[en, fr]]) as [string, string][]));
      const todo = new Set<string>();
      const collect = (t: string) => { if (t.trim() && !dict.has(t)) todo.add(t); return t; };
      mapSectionTexts(src, collect); collect(hdrSrc.title); collect(hdrSrc.poste);
      const texts = [...todo];
      if (texts.length) {
        const res = await api.post<{ data: { texts: string[] } }>('/ai/translate', { texts, target });
        texts.forEach((t, i) => dict.set(t, res.data.texts[i] ?? t));
      }
      if (trReq.current !== reqId) return; // candidat ou langue changé entre-temps
      const tr = (t: string) => dict.get(t) ?? t;
      const out = { sections: mapSectionTexts(src, tr), hdr: { title: tr(hdrSrc.title), poste: tr(hdrSrc.poste) } };
      versions.current[target] = out;
      setSections(out.sections); setHdr(out.hdr);
    } catch (err: any) {
      if (trReq.current === reqId) toast('error', err?.message || 'Traduction impossible');
    } finally {
      if (trReq.current === reqId) setTranslating(false);
    }
  }

  function switchLang(l: Lang) {
    if (l === lang) return;
    if (cand && !translating) versions.current[lang] = { sections, hdr };
    setLang(l);
    if (!cand) return;
    const saved = versions.current[l];
    if (saved) { trReq.current++; setTranslating(false); setSections(saved.sections); setHdr(saved.hdr); }
    else translateInto(l, sections);
  }

  // (Re)construit les sections quand on change de candidat (la fiche fait foi, en français)
  useEffect(() => {
    if (!cand) return;
    const base = buildSections(cand, 'fr');
    trReq.current++; setTranslating(false);
    versions.current = { fr: { sections: base, hdr: NO_HDR } };
    setSections(base); setHdr(NO_HDR);
    if (lang !== 'fr') translateInto(lang, base);
  }, [cand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recruteur : défaut = utilisateur connecté, sinon 1er membre
  const [recruiterId, setRecruiterId] = useState<string | null>(null);
  useEffect(() => {
    if (recruiterId || !team?.length) return;
    const me = user ? team.find(m => m.id === (user as any).id || m.email === user.email) : null;
    setRecruiterId((me || team[0]).id);
  }, [team, user, recruiterId]);
  const member = (team ?? []).find(m => m.id === recruiterId) || null;

  const [recEmail, setRecEmail] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recPhoto, setRecPhoto] = useState('');
  useEffect(() => {
    if (!member) return;
    setRecEmail(member.email || '');
    setRecPhone(member.telephone || '');
    setRecPhoto(member.avatarData || member.avatarUrl || '');
  }, [recruiterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = list?.data ?? [];
  const selMandat = (mandats?.data ?? []).find(m => m.id === mandatId);
  const targetLabel = targetMode === 'free' ? targetFree.trim()
    : targetMode === 'mandat' && selMandat ? `${selMandat.titrePoste} · ${selMandat.entreprise?.nom ?? ''}`.trim().replace(/ · $/, '')
      : '';

  const recruiter: Recruiter = {
    nom: member ? `${member.prenom ? member.prenom + ' ' : ''}${member.nom}` : (user ? `${(user as any).prenom ? (user as any).prenom + ' ' : ''}${(user as any).nom ?? ''}`.trim() : 'HumanUp'),
    email: recEmail, telephone: recPhone, avatarUrl: recPhoto || null,
  };
  const cfg: DocConfig = { format, anon, target: targetLabel, sections, hideOffices, hdr };
  const html = useMemo(
    () => (cand ? docHtml(cand, cfg, recruiter, lang) : ''),
    [cand, sections, hdr, format, anon, hideOffices, targetLabel, recEmail, recPhone, recPhoto, member?.nom, member?.prenom, lang],
  );

  // ── mutateurs de sections ──
  const patchSec = (id: string, patch: Partial<DocSection>) => setSections(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s));
  const moveSec = (id: string, dir: -1 | 1) => setSections(ss => { const i = ss.findIndex(s => s.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= ss.length) return ss; const c = ss.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; });
  const patchItem = (sid: string, iid: string, p: Partial<SecItem>) => setSections(ss => ss.map(s => s.id === sid ? { ...s, items: s.items?.map(it => it.id === iid ? { ...it, ...p } : it) } : s));
  const addItem = (sid: string) => setSections(ss => ss.map(s => s.id === sid ? { ...s, items: [...(s.items ?? []), { id: `n${sid}${(s.items?.length ?? 0)}${q.length}`, text: '', on: true, hi: false }] } : s));
  const rmItem = (sid: string, iid: string) => setSections(ss => ss.map(s => s.id === sid ? { ...s, items: s.items?.filter(it => it.id !== iid) } : s));
  const patchExp = (sid: string, xid: string, p: Partial<ExpEntry>) => setSections(ss => ss.map(s => s.id === sid ? { ...s, exps: s.exps?.map(x => x.id === xid ? { ...x, ...p } : x) } : s));
  const patchHl = (sid: string, xid: string, hid: string, p: Partial<SecItem>) => setSections(ss => ss.map(s => s.id === sid ? { ...s, exps: s.exps?.map(x => x.id === xid ? { ...x, highlights: x.highlights.map(h => h.id === hid ? { ...h, ...p } : h) } : x) } : s));
  const toggleOpen = (id: string) => setOpenSec(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('error', 'Image uniquement (JPG/PNG).'); }
    else { try { setRecPhoto(await fileToThumbnail(file)); } catch (err: any) { toast('error', err?.message || 'Image illisible'); } }
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
      const fd = new FormData(); fd.append('file', file);
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/v1/ai/create-from-cv', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd, credentials: 'include' });
      if (!res.ok) { const d = await res.json().catch(() => ({} as any)); throw new Error(d?.message || 'Échec de l’analyse du CV'); }
      const json = await res.json();
      const id = json?.data?.candidatId as string | undefined;
      toast('success', 'CV analysé — profil créé.');
      qc.invalidateQueries({ queryKey: ['candidats'] });
      if (id) { setSelId(id); setQ(''); }
    } catch (err: any) { toast('error', err?.message || 'Erreur lors de l’analyse'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  // ── styles ──
  const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(34,23,122,.04)' };
  const inStyle: React.CSSProperties = { width: '100%', fontSize: 12.5, padding: '8px 10px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', color: '#1A1533' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', margin: '0 0 4px' };
  const cbox = (on: boolean): React.CSSProperties => ({ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${on ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: on ? '#E6E9AF' : '#fff', flexShrink: 0, cursor: 'pointer' });
  const starBtn = (hi: boolean): React.CSSProperties => ({ fontSize: 14, lineHeight: 1, color: hi ? '#C9A400' : '#C7C3D6', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0 });
  const iconBtn: React.CSSProperties = { fontSize: 12, color: '#8A8699', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 5px', flexShrink: 0 };
  const seg = (active: boolean): React.CSSProperties => ({ flex: 1, fontSize: 12, fontWeight: 800, padding: '7px 6px', borderRadius: 7, border: 'none', cursor: 'pointer', background: active ? '#22177A' : 'transparent', color: active ? '#E6E9AF' : '#8A7F5A' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, marginTop: 22, alignItems: 'start' }}>
      {/* PANNEAU GAUCHE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Source + format */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: '#1A1533' }}>Document</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {translating && <Loader2 size={15} color="#22177A" className="st-spin" />}
              <div style={{ display: 'flex', background: '#EFEFE6', borderRadius: 9, padding: 3 }}>
                {(['fr', 'en'] as const).map(l => <button key={l} onClick={() => switchLang(l)} style={{ fontSize: 12, fontWeight: 800, padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', background: lang === l ? '#fff' : 'transparent', color: lang === l ? '#22177A' : '#8A7F5A' }}>{l.toUpperCase()}</button>)}
              </div>
            </div>
          </div>
          {cand && lang === 'en' && !translating && (
            <button onClick={() => translateInto('en', versions.current.fr?.sections ?? sections)} style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, color: '#22177A', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>Retraduire depuis le français</button>
          )}
          <div style={{ display: 'flex', gap: 4, background: '#EFEFE6', borderRadius: 9, padding: 3, marginTop: 12 }}>
            <button onClick={() => setFormat('onepager')} style={seg(format === 'onepager')}>One-pager</button>
            <button onClick={() => setFormat('dc')} style={seg(format === 'dc')}>Dossier (DC)</button>
          </div>

          <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: '100%', marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 12px', borderRadius: 12, border: '1.5px dashed rgba(34,23,122,.28)', background: '#F7F7FB', cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? <Loader2 size={20} color="#22177A" className="st-spin" /> : <Upload size={20} color="#22177A" />}
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A' }}>{uploading ? 'Analyse du CV par l’IA…' : 'Ajouter un CV (PDF)'}</span>
            <span style={{ fontSize: 11, color: '#9A96AE' }}>{uploading ? 'Extraction boîtes + réalisations' : 'Crée un profil réutilisable'}</span>
          </button>
          <div style={{ position: 'relative', marginTop: 12 }}>
            <Search size={15} color="#9A96AE" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="…ou choisir un candidat existant" style={{ width: '100%', fontSize: 13, padding: '10px 12px 10px 34px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
          </div>
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
              {results.map(c => (
                <button key={c.id} onClick={() => setSelId(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: `1px solid ${selId === c.id ? '#22177A' : 'rgba(34,23,122,.1)'}`, background: selId === c.id ? '#F2F3D8' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 10 }}>{`${(c.prenom?.[0] ?? '')}${c.nom[0] ?? ''}`.toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${c.prenom ? c.prenom + ' ' : ''}${c.nom}`}</div><div style={{ fontSize: 11.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.posteActuel || '—'}</div></div>
                </button>
              ))}
            </div>
          )}
        </div>

        {cand && <>
          {/* Anonymisation */}
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1533', marginBottom: 10 }}>Anonymisation</div>
            {([
              { k: 'name', label: 'Masquer le nom du candidat' },
              { k: 'currentCompany', label: 'Masquer l’entreprise actuelle' },
              { k: 'allCompanies', label: 'Masquer toutes les entreprises' },
              { k: 'city', label: 'Masquer la ville' },
            ] as const).map(o => (
              <label key={o.k} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, cursor: 'pointer' }} onClick={() => setAnon(a => ({ ...a, [o.k]: !a[o.k] }))}>
                <span style={cbox(anon[o.k])} />
                <span style={{ fontSize: 12.5, color: '#4A4568' }}>{o.label}</span>
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }} onClick={() => setHideOffices(v => !v)}>
              <span style={cbox(hideOffices)} />
              <span style={{ fontSize: 12.5, color: '#4A4568' }}>Masquer les bureaux (Hong Kong · Canada)</span>
            </label>
          </div>

          {/* Cible (proposition) */}
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1533', marginBottom: 10 }}>Cible (optionnel)</div>
            <div style={{ display: 'flex', gap: 4, background: '#EFEFE6', borderRadius: 9, padding: 3 }}>
              {([['none', 'Aucune'], ['mandat', 'Mandat'], ['free', 'Libre']] as const).map(([m, lab]) => <button key={m} onClick={() => setTargetMode(m)} style={seg(targetMode === m)}>{lab}</button>)}
            </div>
            {targetMode === 'mandat' && (
              <select value={mandatId} onChange={e => setMandatId(e.target.value)} style={{ ...inStyle, cursor: 'pointer', marginTop: 10 }}>
                <option value="">— Choisir un mandat —</option>
                {(mandats?.data ?? []).map(m => <option key={m.id} value={m.id}>{m.titrePoste} · {m.entreprise?.nom}</option>)}
              </select>
            )}
            {targetMode === 'free' && <input value={targetFree} onChange={e => setTargetFree(e.target.value)} placeholder="Ex. Directeur Commercial chez Acme" style={{ ...inStyle, marginTop: 10 }} />}
            {targetLabel && <div style={{ fontSize: 11.5, color: '#22177A', marginTop: 8 }}>Proposé pour <strong>{targetLabel}</strong> — pense à activer la section « Pourquoi ce candidat ».</div>}
          </div>

          {/* Éditeur de sections */}
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1533' }}>Sections du document</div>
            <div style={{ fontSize: 11.5, color: '#9A96AE', margin: '3px 0 12px' }}>Coche pour inclure · ★ met en highlight (bandeau) · édite le texte</div>
            {sections.map((s, idx) => (
              <div key={s.id} style={{ border: '1px solid rgba(34,23,122,.1)', borderRadius: 11, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', background: s.on ? '#F7F7FB' : '#fff' }}>
                  <span onClick={() => patchSec(s.id, { on: !s.on })} style={cbox(s.on)} />
                  <span onClick={() => toggleOpen(s.id)} style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: s.on ? '#1A1533' : '#9A96AE', cursor: 'pointer' }}>{s.title}</span>
                  <button onClick={() => moveSec(s.id, -1)} disabled={idx === 0} style={{ ...iconBtn, opacity: idx === 0 ? .3 : 1 }}>↑</button>
                  <button onClick={() => moveSec(s.id, 1)} disabled={idx === sections.length - 1} style={{ ...iconBtn, opacity: idx === sections.length - 1 ? .3 : 1 }}>↓</button>
                  <button onClick={() => toggleOpen(s.id)} style={iconBtn}>{openSec.has(s.id) ? '▾' : '▸'}</button>
                </div>
                {openSec.has(s.id) && (
                  <div style={{ padding: 10, borderTop: '1px solid rgba(34,23,122,.08)' }}>
                    <input value={s.title} onChange={e => patchSec(s.id, { title: e.target.value })} style={{ ...inStyle, fontSize: 11.5, marginBottom: 8, fontWeight: 700 }} />
                    {(s.kind === 'summary' || s.kind === 'pitch' || s.kind === 'availability') && (
                      <textarea value={s.body || ''} onChange={e => patchSec(s.id, { body: e.target.value })} rows={s.kind === 'summary' ? 5 : 3} style={{ ...inStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} placeholder="Texte…" />
                    )}
                    {(s.kind === 'strengths' || s.kind === 'skills') && (<>
                      {(s.items ?? []).map(it => (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <span onClick={() => patchItem(s.id, it.id, { on: !it.on })} style={cbox(it.on)} />
                          {s.kind !== 'skills' && <button onClick={() => patchItem(s.id, it.id, { hi: !it.hi })} title="Highlight" style={starBtn(it.hi)}>{it.hi ? '★' : '☆'}</button>}
                          <input value={it.text} onChange={e => patchItem(s.id, it.id, { text: e.target.value })} style={{ ...inStyle, fontSize: 11.5, padding: '6px 8px' }} />
                          <button onClick={() => rmItem(s.id, it.id)} style={iconBtn}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => addItem(s.id)} style={{ fontSize: 11.5, fontWeight: 700, color: '#22177A', background: '#F2F3D8', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', marginTop: 2 }}>+ Ajouter</button>
                    </>)}
                    {s.kind === 'experience' && (s.exps ?? []).map(x => (
                      <div key={x.id} style={{ border: '1px solid rgba(34,23,122,.08)', borderRadius: 9, padding: 8, marginBottom: 7, background: x.on ? '#fff' : '#FAFAF7' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span onClick={() => patchExp(s.id, x.id, { on: !x.on })} style={cbox(x.on)} />
                          <input value={x.titre} onChange={e => patchExp(s.id, x.id, { titre: e.target.value })} style={{ ...inStyle, fontSize: 11.5, fontWeight: 700, padding: '5px 7px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                          <input value={x.entreprise} onChange={e => patchExp(s.id, x.id, { entreprise: e.target.value })} placeholder="Entreprise" style={{ ...inStyle, fontSize: 11, padding: '5px 7px', flex: 2 }} />
                          <input value={x.anneeDebut} onChange={e => patchExp(s.id, x.id, { anneeDebut: e.target.value })} placeholder="Début" style={{ ...inStyle, fontSize: 11, padding: '5px 7px', width: 58 }} />
                          <input value={x.anneeFin} onChange={e => patchExp(s.id, x.id, { anneeFin: e.target.value })} placeholder="Fin" style={{ ...inStyle, fontSize: 11, padding: '5px 7px', width: 58 }} />
                        </div>
                        {x.highlights.map(h => (
                          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                            <span onClick={() => patchHl(s.id, x.id, h.id, { on: !h.on })} style={cbox(h.on)} />
                            <button onClick={() => patchHl(s.id, x.id, h.id, { hi: !h.hi })} title="Highlight" style={starBtn(h.hi)}>{h.hi ? '★' : '☆'}</button>
                            <input value={h.text} onChange={e => patchHl(s.id, x.id, h.id, { text: e.target.value })} style={{ ...inStyle, fontSize: 11, padding: '5px 7px' }} />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bloc recruteur (trust) */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={15} color="#22177A" />
              <span style={{ fontWeight: 800, fontSize: 14, color: '#1A1533' }}>Contact HumanUp (trust)</span>
            </div>
            <label style={lbl}>Recruteur</label>
            <select value={recruiterId ?? ''} onChange={e => setRecruiterId(e.target.value)} style={{ ...inStyle, cursor: 'pointer' }}>
              {(team ?? []).map(m => <option key={m.id} value={m.id}>{`${m.prenom ? m.prenom + ' ' : ''}${m.nom}`}</option>)}
            </select>
            <div style={{ marginTop: 10 }}><label style={lbl}>E-mail</label><input value={recEmail} onChange={e => setRecEmail(e.target.value)} placeholder="prenom@humanup.io" style={inStyle} /></div>
            <div style={{ marginTop: 10 }}><label style={lbl}>Téléphone</label><input value={recPhone} onChange={e => setRecPhone(e.target.value)} placeholder="+33 6 12 34 56 78" style={inStyle} /></div>
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

          <button onClick={() => printDoc(docHtml(cand, cfg, recruiter, lang))} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 12, padding: 14, cursor: 'pointer', boxShadow: '0 10px 24px -12px rgba(34,23,122,.6)' }}><Printer size={16} />{format === 'dc' ? 'Exporter le DC (PDF)' : 'Exporter le one-pager (PDF)'}</button>
        </>}
      </div>

      {/* APERÇU WYSIWYG (= le document exporté) */}
      <div style={{ background: '#EFEFE6', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, boxShadow: '0 1px 2px rgba(34,23,122,.04)', overflow: 'hidden', minHeight: 500, position: 'sticky', top: 20 }}>
        {!cand ? (
          <div style={{ padding: '80px 40px', textAlign: 'center', color: '#9A96AE', fontSize: 14, lineHeight: 1.6 }}>
            <FileText size={30} color="#C4C0D6" style={{ marginBottom: 12 }} /><br />
            Ajoutez un CV (PDF) ou choisissez un candidat.<br />HumanUp compose une <strong style={{ color: '#6E6A85' }}>proposition</strong> — one-pager ou dossier — dont vous choisissez les sections, ce qui est masqué et ce qui est mis en avant.
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <iframe title="document" srcDoc={html} style={{ width: '100%', height: 1040, border: 0, display: 'block', background: '#EFEFE6', opacity: translating ? .45 : 1, transition: 'opacity .2s ease' }} />
            {translating && <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#E6E9AF', background: '#22177A', borderRadius: 999, padding: '9px 16px', boxShadow: '0 10px 24px -12px rgba(34,23,122,.6)' }}><Loader2 size={14} className="st-spin" />Traduction en cours</div>}
          </div>
        )}
      </div>
    </div>
  );
}
