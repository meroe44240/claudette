import { getTeamDailyReport } from './team-daily-report.service.js';
import { sendEmail } from '../../lib/mailer.js';

/**
 * Email standup 7h30 (gabarit §8 de la spec get_team_daily_report).
 * Destinataires : STANDUP_RECIPIENTS (csv) — défaut meroe@humanup.io le temps
 * de la vérification (§9). Élargir à toute l'équipe une fois les chiffres validés.
 */

const DOT: Record<string, string> = { RED: '🔴', ORANGE: '🟠', GREEN: '🟢' };
const HEX: Record<string, string> = { RED: '#B3261E', ORANGE: '#C9A227', GREEN: '#3B9A54' };

function frDate(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z');
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(d);
}
const roleLabel = (r: string) => (r === 'SALES' ? 'Sales' : r === 'LES_DEUX' ? 'Sales + Recruteur' : 'Recruteur');
const chk = (v: number, t: number) => (v >= t ? ' ✓' : '');

function salesLines(m: any): string[] {
  return [
    `Calls ${m.calls.value}/${m.calls.target} (moy. 5j : ${m.calls.avg_5d})   ·   RDV ${m.rdv_nouveaux.value}/${m.rdv_nouveaux.target}${chk(m.rdv_nouveaux.value, m.rdv_nouveaux.target)}   ·   Push ${m.push.value}/${m.push.target}${chk(m.push.value, m.push.target)}`,
    `Présentations ${m.presentations.value}/${m.presentations.target}${chk(m.presentations.value, m.presentations.target)} · ${m.presentations.days_left}j restants`,
  ];
}
function recruteurLines(m: any): string[] {
  const callsPart = m.calls ? `   ·   Calls ${m.calls.value}${m.calls.target ? '/' + m.calls.target : ''}` : '';
  return [
    `Screenings ${m.screenings.value}/${m.screenings.target}${chk(m.screenings.value, m.screenings.target)} (moy. 5j : ${m.screenings.avg_5d})   ·   Nouvelles ${m.nouvelles_personnes.value}/${m.nouvelles_personnes.target}${chk(m.nouvelles_personnes.value, m.nouvelles_personnes.target)}${callsPart}`,
  ];
}

const kEuro = (n: number) => `${Math.round((n || 0) / 1000)} k€`;
const EV_DOT: Record<string, string> = { offre: '🟡', presentation: '🔵' };
const EV_LABEL: Record<string, string> = { offre: 'Offre', presentation: 'Présentation' };

// ─── Design pack "Rapport d'activité" (34) : navy #22177A / lime #E6E9AF ───
const FONT = "Arial,Helvetica,sans-serif";
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Titre de section : petit sur-titre navy + filet lime, avec indice à droite optionnel.
function sectionLabel(txt: string, hint = '', topMargin = 28): string {
  const hintHtml = hint
    ? `<td style="vertical-align:bottom;text-align:right;padding:0 0 2px"><span style="font-family:${FONT};font-size:11px;font-weight:bold;color:#8A8699">${hint}</span></td>`
    : '';
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:${topMargin}px 0 14px"><tr>
    <td style="vertical-align:bottom">
      <span style="display:inline-block;width:14px;height:3px;border-radius:99px;background:#E6E9AF;vertical-align:middle;margin-right:8px"></span>
      <span style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase;color:#22177A;vertical-align:middle">${txt}</span>
    </td>${hintHtml}
  </tr></table>`;
}

// Tuile KPI (grille 3 colonnes). tone → palette du design ; barre seulement si cible réelle.
type Tone = 'navy' | 'lime' | 'blue' | 'green' | 'violet';
const TONES: Record<Tone, { bg: string; bd: string; fg: string; sub: string; bar: string }> = {
  navy: { bg: '#ffffff', bd: 'rgba(34,23,122,.09)', fg: '#22177A', sub: '#8A8699', bar: '#22177A' },
  lime: { bg: '#FAFBEC', bd: 'rgba(201,162,39,.20)', fg: '#7A5E1E', sub: '#A08A55', bar: '#C9A227' },
  blue: { bg: '#F2F6FC', bd: 'rgba(42,107,216,.16)', fg: '#2A4A8A', sub: '#7E90B4', bar: '#2A6BD8' },
  green: { bg: '#F1F8F3', bd: 'rgba(59,154,84,.18)', fg: '#2C6B3F', sub: '#7BA88C', bar: '#3B9A54' },
  violet: { bg: '#F5F3FC', bd: 'rgba(91,75,158,.16)', fg: '#5B4B9E', sub: '#9A90BE', bar: '#8E7CC3' },
};
function kpiTile(n: string, goal: string, label: string, tone: Tone, pct?: number): string {
  const t = TONES[tone];
  const bar = pct != null
    ? `<div style="height:5px;border-radius:99px;background:rgba(34,23,122,.07);margin-top:11px;font-size:0;line-height:0"><div style="height:5px;width:${Math.max(3, Math.min(100, pct))}%;border-radius:99px;background:${t.bar};font-size:0;line-height:0">&nbsp;</div></div>`
    : '';
  return `<td width="33.33%" style="background:${t.bg};border:1px solid ${t.bd};border-radius:15px;padding:15px 16px;vertical-align:top">
    <span style="font-family:${FONT};font-size:29px;font-weight:bold;letter-spacing:-1px;line-height:1;color:${t.fg}">${n}</span>${goal ? `<span style="font-family:${FONT};font-size:11px;font-weight:bold;color:${t.sub};margin-left:5px">${goal}</span>` : ''}
    <div style="font-family:${FONT};font-size:9.5px;font-weight:bold;letter-spacing:.9px;text-transform:uppercase;color:${t.sub};margin-top:10px;line-height:1.35">${label}</div>
    ${bar}
  </td>`;
}
const gridOpen = `<table cellpadding="0" cellspacing="8" border="0" width="100%" style="border-collapse:separate">`;

// Bandeau « takeaway » : une phrase lisible qui résume la veille, juste sous l'en-tête.
function heroStrip(rows: any[]): string {
  const sales = rows.filter((r) => r.role === 'SALES' || r.role === 'LES_DEUX');
  const sumS = (fn: (r: any) => number) => sales.reduce((a, r) => a + (fn(r) || 0), 0);
  const calls = sumS((r) => r.metrics.calls?.value);
  const conn = sumS((r) => r.metrics.calls_connectes?.value);
  const push = sumS((r) => r.metrics.push?.value);
  const rdv = sumS((r) => r.metrics.rdv_nouveaux?.value);
  const prez = sumS((r) => r.metrics.presentations?.value);
  const piece = (n: number, w1: string, w2: string) => `<span style="color:#22177A;font-weight:bold">${n}</span> ${n > 1 ? w2 : w1}`;
  const parts = [
    piece(calls, 'call', 'calls') + (conn ? ` <span style="color:#8A8699">(${conn} connecté${conn > 1 ? 's' : ''})</span>` : ''),
    piece(push, 'push', 'pushs'),
    piece(rdv, 'RDV pris', 'RDV pris'),
    piece(prez, 'présentation cette semaine', 'présentations cette semaine'),
  ];
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2F3D8"><tr>
    <td style="padding:13px 26px">
      <span style="font-family:${FONT};font-size:9.5px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#8A6A2E">Hier en bref</span>
      <div style="font-family:${FONT};font-size:13.5px;line-height:1.7;color:#4A4568;margin-top:5px">${parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>
    </td>
  </tr></table>`;
}

// Section « Business — à l'instant t » (l'état, sans barres de progression).
function overviewHtml(o: any): string {
  const dorm = o.mandats_dormants ? ` <span style="font-size:12px;font-weight:bold;color:#8A8699">· ${o.mandats_dormants} dorm.</span>` : '';
  return sectionLabel("Business — à l'instant t", '', 4) + gridOpen + `<tr>
    ${kpiTile(`${o.mandats_actifs ?? 0}${dorm}`, '', 'Mandats actifs', 'navy')}
    ${kpiTile(String(o.candidats_en_process ?? 0), '', 'Candidats en process', 'violet')}
    ${kpiTile(String(o.offres_en_cours ?? 0), '', 'Offres en cours', 'lime')}
  </tr><tr>
    ${kpiTile(String(o.presentations_semaine ?? 0), 'sem.', 'Présentations', 'blue')}
    ${kpiTile(String(o.placements_mois ?? 0), 'mois', 'Placements', 'green')}
    ${kpiTile(kEuro(o.ca_mois ?? 0), 'mois', 'CA facturé', 'navy')}
  </tr></table>`;
}

// Section « Hier, en chiffres » : sommes équipe des activités J-1 (métriques réelles).
function teamActivityHtml(rows: any[]): string {
  const sales = rows.filter((r) => r.role === 'SALES' || r.role === 'LES_DEUX');
  const sum = (fn: (r: any) => number) => rows.reduce((a, r) => a + (fn(r) || 0), 0);
  const sumS = (fn: (r: any) => number) => sales.reduce((a, r) => a + (fn(r) || 0), 0);
  const calls = sumS((r) => r.metrics.calls?.value), tCalls = sumS((r) => r.metrics.calls?.target);
  const conn = sumS((r) => r.metrics.calls_connectes?.value);
  const push = sumS((r) => r.metrics.push?.value), tPush = sumS((r) => r.metrics.push?.target);
  const rdv = sumS((r) => r.metrics.rdv_nouveaux?.value), tRdv = sumS((r) => r.metrics.rdv_nouveaux?.target);
  const prez = sumS((r) => r.metrics.presentations?.value), tPrez = sumS((r) => r.metrics.presentations?.target);
  const mvt = sum((r) => r.mouvements_pipeline);
  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
  return sectionLabel('Hier, en chiffres') + gridOpen + `<tr>
    ${kpiTile(String(calls), '/ ' + tCalls, 'Calls passés', 'navy', pct(calls, tCalls))}
    ${kpiTile(String(conn), '', 'Calls connectés', 'green')}
    ${kpiTile(String(push), '/ ' + tPush, 'Pushs envoyés', 'violet', pct(push, tPush))}
  </tr><tr>
    ${kpiTile(String(rdv), '/ ' + tRdv, 'RDV pris', 'lime', pct(rdv, tRdv))}
    ${kpiTile(String(prez), '/ ' + tPrez + ' sem.', 'Présentations tenues', 'blue', pct(prez, tPrez))}
    ${kpiTile(String(mvt), '', 'Mouvements pipeline', 'navy')}
  </tr></table>`;
}

function eventsHtml(events: any[], esc: (s: unknown) => string): string {
  const nOffre = events.filter((e) => e.type === 'offre').length;
  const nPrez = events.length - nOffre;
  const hint = events.length ? `${nOffre} offre${nOffre > 1 ? 's' : ''} · ${nPrez} présentation${nPrez > 1 ? 's' : ''}` : '';
  const header = sectionLabel("Événements d'hier", hint);
  if (!events.length) {
    return header + `<div style="border:1.5px dashed rgba(34,23,122,.18);border-radius:15px;padding:20px;text-align:center;background:#F9F9F0">
      <div style="font-family:${FONT};font-size:13px;font-weight:bold;color:#4A4568">Aucun événement hier</div>
      <div style="font-family:${FONT};font-size:11.5px;color:#8A8699;margin-top:4px">Aucune offre ni présentation client enregistrée.</div>
    </div>`;
  }
  const rows = events.map((ev) => {
    const isOffre = ev.type === 'offre';
    const badge = isOffre ? '#C9A227' : '#2A6BD8';
    const bg = isOffre ? '#F5F3D6' : '#EAF0FB';
    const fg = isOffre ? '#8A6A2E' : '#2A4A8A';
    return `<div style="background:#fff;border:1px solid rgba(34,23,122,.08);border-left:4px solid ${badge};border-radius:0 14px 14px 0;padding:13px 16px;margin:0 0 8px">
      <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="vertical-align:middle">
          <span style="font-family:${FONT};font-size:9px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${fg};background:${bg};border-radius:6px;padding:3px 8px;vertical-align:middle">${EV_LABEL[ev.type]}</span>
          <span style="font-family:${FONT};font-size:14px;font-weight:bold;color:#1A1533;margin-left:10px;vertical-align:middle">${esc(ev.candidat)}</span>
        </td>
        <td style="vertical-align:middle;text-align:right;white-space:nowrap"><span style="font-family:${FONT};font-size:11px;font-weight:bold;color:#8A8699">${esc(ev.recruteur)}</span></td>
      </tr></table>
      <div style="font-family:${FONT};font-size:12px;line-height:1.5;color:#4A4568;margin-top:6px">${esc(ev.mandat)}${ev.interlocuteur ? ` &nbsp;·&nbsp; interlocuteur : <span style="color:#312C4A">${esc(ev.interlocuteur)}</span>` : ''}</div>
    </div>`;
  }).join('');
  return header + rows;
}

function textReport(rep: any): string {
  const o = rep.overview || {};
  const out = [`STANDUP — ${frDate(rep.date)}`, ''];
  // Vue business à l'instant t
  out.push('📊 BUSINESS');
  out.push(`   Mandats actifs : ${o.mandats_actifs}${o.mandats_dormants ? ` (dormants ${o.mandats_dormants})` : ''}   ·   Candidats en process : ${o.candidats_en_process}   ·   Offres en cours : ${o.offres_en_cours}`);
  out.push(`   Présentations (semaine) : ${o.presentations_semaine}   ·   Placements (mois) : ${o.placements_mois}   ·   CA (mois) : ${kEuro(o.ca_mois)}`);
  out.push('');
  // Événements clés d'hier
  out.push('⚡ ÉVÉNEMENTS D\'HIER');
  if (!rep.events?.length) out.push('   Aucun hier.');
  else for (const ev of rep.events) {
    out.push(`   ${EV_DOT[ev.type]} ${EV_LABEL[ev.type]} — ${ev.candidat} · ${ev.mandat} · par ${ev.recruteur}${ev.interlocuteur ? ` (interlocuteur : ${ev.interlocuteur})` : ''}`);
  }
  out.push('');
  out.push('👥 ACTIVITÉ PAR PERSONNE');
  out.push('');
  for (const r of rep.rows) {
    const lines = r.role === 'LES_DEUX'
      ? [...salesLines(r.metrics), ...recruteurLines(r.metrics)]
      : r.role === 'SALES' ? salesLines(r.metrics) : recruteurLines(r.metrics);
    out.push(`${DOT[r.status]} ${r.name.toUpperCase()} · ${roleLabel(r.role)}`);
    for (const l of lines) out.push(`   ${l}`);
    const dorm = r.mandats_dormants ? ` · dormants : ${r.mandats_dormants}` : '';
    out.push(`   Mouvements pipeline : ${r.mouvements_pipeline}   ·   Mandats actifs : ${r.mandats_actifs}${dorm}`);
    // détail présentations de la semaine
    const pl = r.metrics?.presentations?.list || [];
    for (const p of pl) out.push(`     → ${p.candidat} · ${p.date} · ${p.mandat}${p.interlocuteur ? ' · ' + p.interlocuteur : ''}`);
    out.push('');
  }
  return out.join('\n');
}

// Statut → libellé + pastille (dérivé, jamais codé en dur côté données).
const STATUS_LABEL: Record<string, string> = { GREEN: 'Au rythme', ORANGE: 'À surveiller', RED: 'En retard' };
const STATUS_PILL: Record<string, { bg: string; fg: string; dot: string; rail: string }> = {
  GREEN: { bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54', rail: '#3B9A54' },
  ORANGE: { bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B', rail: '#E08A2B' },
  RED: { bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E', rail: '#B3261E' },
};
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || '?';

// Une cellule de stat dans une carte personne. Un 0 sur métrique à cible passe en rouge (règle §6).
function statCell(n: number, target: number | null, label: string, first: boolean): string {
  let fg = '#1A1533';
  if (target != null) fg = n >= target ? '#2C6B3F' : n <= 0 ? '#B3261E' : '#1A1533';
  const of = target != null ? `<span style="font-family:${FONT};font-size:10px;font-weight:bold;color:#4A4568;margin-left:2px">/ ${target}</span>` : '';
  return `<td style="padding:0 14px;vertical-align:top;border-left:${first ? 'none' : '1px solid rgba(34,23,122,.07)'}">
    <span style="font-family:${FONT};font-size:19px;font-weight:bold;letter-spacing:-.4px;color:${fg}">${n}</span>${of}
    <div style="font-family:${FONT};font-size:9px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8699;margin-top:6px;white-space:nowrap">${label}</div>
  </td>`;
}

// Groupe de stats (une ligne de cellules), avec caption optionnel pour la double casquette.
function statGroup(cells: string, caption?: string): string {
  const cap = caption
    ? `<div style="font-family:${FONT};font-size:8px;font-weight:bold;letter-spacing:1.3px;text-transform:uppercase;color:#B4B0C4;margin-bottom:8px">${caption}</div>`
    : '';
  return `<div style="margin-top:14px;border-top:1px solid rgba(34,23,122,.06);padding-top:13px">${cap}
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${cells}</tr></table>
  </div>`;
}
const cellsFrom = (specs: Array<{ n: number; t: number | null; l: string }>) =>
  specs.map((s, i) => statCell(s.n, s.t, s.l, i === 0)).join('');

function personCard(r: any, esc: (s: unknown) => string): string {
  const P = STATUS_PILL[r.status] || STATUS_PILL.ORANGE;
  const m = r.metrics;
  const isSales = r.role === 'SALES' || r.role === 'LES_DEUX';
  const isRecruteur = r.role === 'RECRUTEUR' || r.role === 'LES_DEUX';
  const dual = r.role === 'LES_DEUX';

  const salesCells = cellsFrom([
    { n: m.calls?.value ?? 0, t: m.calls?.target ?? null, l: 'Calls' },
    { n: m.calls_connectes?.value ?? 0, t: null, l: 'Connectés' },
    { n: m.push?.value ?? 0, t: m.push?.target ?? null, l: 'Pushs' },
    { n: m.rdv_nouveaux?.value ?? 0, t: m.rdv_nouveaux?.target ?? null, l: 'RDV pris' },
    { n: m.presentations?.value ?? 0, t: m.presentations?.target ?? null, l: 'Prés. sem.' },
  ]);
  // En double casquette, le groupe recrutement ne répète pas calls/connectés (déjà dans le groupe sales).
  const recCells = cellsFrom(dual
    ? [
        { n: m.screenings?.value ?? 0, t: m.screenings?.target ?? null, l: 'Screenings' },
        { n: m.nouvelles_personnes?.value ?? 0, t: m.nouvelles_personnes?.target ?? null, l: 'Nouvelles' },
        { n: r.mouvements_pipeline, t: null, l: 'Mouvements' },
      ]
    : [
        { n: m.calls?.value ?? 0, t: m.calls?.target ?? null, l: 'Calls' },
        { n: m.calls_connectes?.value ?? 0, t: null, l: 'Connectés' },
        { n: m.screenings?.value ?? 0, t: m.screenings?.target ?? null, l: 'Screenings' },
        { n: m.nouvelles_personnes?.value ?? 0, t: m.nouvelles_personnes?.target ?? null, l: 'Nouvelles' },
        { n: r.mouvements_pipeline, t: null, l: 'Mouvements' },
      ]);

  const statsHtml = dual
    ? statGroup(salesCells, 'Sales') + statGroup(recCells, 'Recrutement')
    : statGroup(isSales ? salesCells : recCells);

  const dorm = r.mandats_dormants ? ` · ${r.mandats_dormants} dorm.` : '';
  const mandatsLbl = `${r.mandats_actifs} mandat${r.mandats_actifs > 1 ? 's' : ''} actif${r.mandats_actifs > 1 ? 's' : ''}${dorm}`;

  // Présentations de la semaine dépliées en dur (pas de JS possible en email).
  const pl = (isSales && m.presentations?.list) || [];
  let prez = '';
  if (pl.length) {
    const items = pl.map((p: any, i: number) => `<tr>
        <td style="padding:9px 12px;border-bottom:${i === pl.length - 1 ? 'none' : '1px solid rgba(34,23,122,.06)'};vertical-align:top">
          <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#2A6BD8;vertical-align:middle;margin-right:8px"></span>
          <span style="font-family:${FONT};font-size:12px;font-weight:bold;color:#1A1533">${esc(p.candidat)}</span>
          ${p.interlocuteur ? `<span style="font-family:${FONT};font-size:10.5px;color:#4A4568"> · ${esc(p.interlocuteur)}</span>` : ''}
        </td>
        <td style="padding:9px 12px;border-bottom:${i === pl.length - 1 ? 'none' : '1px solid rgba(34,23,122,.06)'};text-align:right;vertical-align:top;white-space:nowrap">
          <span style="font-family:${FONT};font-size:10.5px;font-weight:bold;color:#22177A">${esc(p.mandat)}</span>
          <span style="font-family:${FONT};font-size:9.5px;color:#8A8699"> · ${esc(p.date)}</span>
        </td>
      </tr>`).join('');
    prez = `<div style="margin-top:14px;padding-top:13px;border-top:1px solid rgba(34,23,122,.07)">
      <div style="font-family:${FONT};font-size:8.5px;font-weight:bold;letter-spacing:1.3px;text-transform:uppercase;color:#2A4A8A;margin-bottom:9px">Présentations tenues · ${pl.length}</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F9FD;border:1px solid rgba(42,107,216,.12);border-radius:12px">${items}</table>
    </div>`;
  }

  return `<div style="background:#fff;border:1px solid rgba(34,23,122,.08);border-left:4px solid ${P.rail};border-radius:16px;padding:16px 18px;margin:0 0 11px;box-shadow:0 1px 2px rgba(34,23,122,.03)">
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td width="42" style="vertical-align:middle"><div style="width:36px;height:36px;border-radius:50%;background:#22177A;color:#E6E9AF;text-align:center;line-height:36px;font-family:${FONT};font-weight:bold;font-size:12px">${initialsOf(r.name)}</div></td>
      <td style="vertical-align:middle;padding-left:12px">
        <div style="font-family:${FONT};font-size:15px;font-weight:bold;letter-spacing:-.2px;color:#1A1533">${esc(r.name)}</div>
        <div style="font-family:${FONT};font-size:11.5px;color:#8A8699;margin-top:2px">${roleLabel(r.role)} &nbsp;·&nbsp; ${mandatsLbl}</div>
      </td>
      <td style="vertical-align:middle;text-align:right;white-space:nowrap">
        <span style="font-family:${FONT};font-size:10.5px;font-weight:bold;border-radius:99px;padding:5px 12px;background:${P.bg};color:${P.fg}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${P.dot};vertical-align:middle;margin-right:6px"></span>${STATUS_LABEL[r.status]}</span>
      </td>
    </tr></table>
    ${statsHtml}
    ${prez}
  </div>`;
}

function htmlReport(rep: any): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]));
  const blocks = rep.rows.map((r: any) => personCard(r, esc)).join('');
  const nPeople = rep.rows.length;
  return `<div style="background:#EBEBE3;padding:30px 14px;font-family:${FONT}">
    <div style="max-width:660px;margin:0 auto;background:#FCFCF5;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px -44px rgba(20,16,58,.55)">

      <!-- en-tête navy -->
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#22177A"><tr>
        <td style="padding:24px 28px 22px">
          <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td style="vertical-align:middle">
              <span style="display:inline-block;width:28px;height:28px;background:#E6E9AF;border-radius:8px;text-align:center;line-height:28px;font-family:${FONT};font-weight:bold;font-size:16px;color:#22177A;vertical-align:middle">H</span>
              <span style="display:inline-block;vertical-align:middle;margin-left:11px">
                <span style="font-family:${FONT};font-size:15px;font-weight:bold;letter-spacing:.5px;color:#E6E9AF">HUMANUP</span>
                <span style="display:block;font-family:${FONT};font-size:7px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:rgba(230,233,175,.5);margin-top:3px">Recruitment Agency</span>
              </span>
            </td>
            <td style="vertical-align:middle;text-align:right">
              <div style="font-family:${FONT};font-size:9px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:rgba(230,233,175,.55)">Rapport d'activité</div>
              <div style="font-family:${FONT};font-size:14px;font-weight:bold;color:#fff;margin-top:5px">${cap(frDate(rep.date))}</div>
            </td>
          </tr></table>
        </td>
      </tr></table>
      <div style="height:3px;background:#E6E9AF;font-size:0;line-height:0">&nbsp;</div>
      ${heroStrip(rep.rows || [])}
      <div style="height:1px;background:rgba(34,23,122,.06);font-size:0;line-height:0">&nbsp;</div>

      <!-- corps -->
      <div style="padding:12px 28px 10px">
        ${overviewHtml(rep.overview || {})}
        ${teamActivityHtml(rep.rows || [])}
        ${eventsHtml(rep.events || [], esc)}
        ${sectionLabel('Activité par personne', `${nPeople} personne${nPeople > 1 ? 's' : ''}`)}
        ${blocks || `<div style="font-family:${FONT};font-size:13px;color:#8A8699;padding:6px 2px">Aucune personne active.</div>`}
      </div>

      <!-- pied navy -->
      <div style="height:3px;background:#E6E9AF;margin-top:18px;font-size:0;line-height:0">&nbsp;</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#22177A"><tr>
        <td style="padding:20px 28px;text-align:center">
          <div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase;color:#E6E9AF">humanup.io</div>
          <div style="font-family:${FONT};font-size:11px;line-height:1.6;color:#b9bb96;margin-top:8px;max-width:420px;margin-left:auto;margin-right:auto">Les objectifs sont quotidiens, sauf les présentations, comptées sur la semaine. Chaque chiffre est consultable dans l'ATS.</div>
        </td>
      </tr></table>
    </div>
  </div>`;
}

export async function runStandupReport(dateOverride?: string, recipientsOverride?: string[]): Promise<{ recipients: number; date: string; rows: number }> {
  const rep = await getTeamDailyReport(dateOverride);
  const recipients = (recipientsOverride && recipientsOverride.length
    ? recipientsOverride
    : (process.env.STANDUP_RECIPIENTS || 'meroe@humanup.io').split(',').map((s) => s.trim()).filter(Boolean));
  if (!recipients.length) return { recipients: 0, date: rep.date, rows: rep.rows.length };
  const subject = `Standup — ${frDate(rep.date)}`;
  await sendEmail(recipients.join(','), subject, htmlReport(rep), textReport(rep));
  return { recipients: recipients.length, date: rep.date, rows: rep.rows.length };
}
