/**
 * Texte du contrat de prestation de recrutement (FR/EN), côté serveur.
 *
 * Copie conforme de apps/web/src/pages/outils/index.tsx (outil Contrat client).
 * Toute modification d'article doit être reportée dans les deux fichiers,
 * sinon le PDF généré par le MCP et celui de l'outil web divergent.
 */

export type ContractLang = 'fr' | 'en';

export interface ContractForm {
  client: string; siret: string; adresse: string; rep: string; email: string; pays: string;
  feePct: string; garantieMois: string; proprieteMois: string; paiement: string; poste: string;
}

export interface Article { num: string; title: string; blocks: { lead: string; text: string }[] }
const A = (num: string, title: string, blocks: [string, string][]): Article => ({ num, title, blocks: blocks.map(([lead, text]) => ({ lead, text })) });

export const PREAMBLE: Record<ContractLang, string> = {
  fr: 'Le Client souhaite faire appel au Prestataire, cabinet de recrutement, pour l’accompagner dans le recrutement de collaborateurs. Les Parties conviennent de formaliser leur collaboration dans le présent Contrat.',
  en: 'The Client wishes to engage the Provider, a recruitment agency, to support the hiring of employees. The Parties agree to formalise their collaboration in this Agreement.',
};

export const artHead = (a: Article) => `Article ${a.num.replace('bis', ' bis')} - ${a.title}`;

export function contractArticles(lang: ContractLang, f: ContractForm): Article[] {
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
