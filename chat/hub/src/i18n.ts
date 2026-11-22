// Labels the Hub itself writes (cards, buttons, slash commands), in each person's language.
// Agents write their own text in the person's language.

type Lang = 'en' | 'fr';
const L: Record<Lang, Record<string, string>> = {
  en: {
    due: 'Due {date}',
    overdue: 'overdue',
    about: 'About',
    reply_hint: 'Or reply in this thread.',
    answered: 'Answered: {answer}. {agent} is on it.',
    answered_text: 'Answered in the thread. {agent} is on it.',
    resolved: 'Resolved',
    already: 'This question is already answered.',
    not_yours: 'This question is not for you.',
    redirect: 'This is for {agent} ({title}).',
    forward: 'Forward to {agent}',
    forwarded: 'Forwarded to {agent}.',
    forwarded_from: 'Forwarded from your chat with {agent}:',
    inbox_empty: 'No open questions. 🎉',
    inbox_title: 'Your open questions ({n})',
    col_due: 'Due', col_agent: 'Agent', col_question: 'Question',
    no_deadline: 'no deadline',
    agents_title: 'Agents',
    col_does: 'What they do', col_reports: 'Reports to',
    unknown_command: 'Unknown command.',
    obj_candidate: 'candidate', obj_mandate: 'mandate', obj_company: 'company', obj_client: 'client', obj_other: 'other',
  },
  fr: {
    due: 'Échéance {date}',
    overdue: 'en retard',
    about: 'Concerne',
    reply_hint: 'Ou réponds dans ce fil.',
    answered: 'Réponse : {answer}. {agent} s’en occupe.',
    answered_text: 'Réponse donnée dans le fil. {agent} s’en occupe.',
    resolved: 'Résolu',
    already: 'Cette question a déjà une réponse.',
    not_yours: 'Cette question ne t’est pas adressée.',
    redirect: 'C’est pour {agent} ({title}).',
    forward: 'Transférer à {agent}',
    forwarded: 'Transféré à {agent}.',
    forwarded_from: 'Transféré depuis ta conversation avec {agent} :',
    inbox_empty: 'Aucune question en attente. 🎉',
    inbox_title: 'Tes questions en attente ({n})',
    col_due: 'Échéance', col_agent: 'Agent', col_question: 'Question',
    no_deadline: 'sans échéance',
    agents_title: 'Agents',
    col_does: 'Ce qu’il fait', col_reports: 'Rend compte à',
    unknown_command: 'Commande inconnue.',
    obj_candidate: 'candidat', obj_mandate: 'mandat', obj_company: 'société', obj_client: 'client', obj_other: 'autre',
  },
};

export function t(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const dict = L[(lang as Lang)] ?? L.en;
  let s = dict[key] ?? L.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function fmtDate(d: Date, lang: string, timeZone: string): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d);
}
