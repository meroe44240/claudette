import { getTeamDailyReport } from './team-daily-report.service.js';
import { sendEmail } from '../../lib/mailer.js';

/**
 * Email standup 7h30 (gabarit §8 de la spec get_team_daily_report).
 * Destinataires : STANDUP_RECIPIENTS (csv) — défaut meroe@humanup.io le temps
 * de la vérification (§9). Élargir à toute l'équipe une fois les chiffres validés.
 */

const DOT: Record<string, string> = { RED: '🔴', ORANGE: '🟠', GREEN: '🟢' };
const HEX: Record<string, string> = { RED: '#B3261E', ORANGE: '#C9A227', GREEN: '#3B9A54' };

function enDate(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(d);
}
const roleLabel = (r: string) => (r === 'SALES' ? 'Sales' : r === 'LES_DEUX' ? 'Sales + Recruiter' : 'Recruiter');
const chk = (v: number, t: number) => (v >= t ? ' ✓' : '');

function salesLines(m: any): string[] {
  return [
    `Calls ${m.calls.value}/${m.calls.target} (5-day avg: ${m.calls.avg_5d})   ·   Meetings ${m.rdv_nouveaux.value}/${m.rdv_nouveaux.target}${chk(m.rdv_nouveaux.value, m.rdv_nouveaux.target)}   ·   Push ${m.push.value}/${m.push.target}${chk(m.push.value, m.push.target)}`,
    `Presentations ${m.presentations.value}/${m.presentations.target}${chk(m.presentations.value, m.presentations.target)} · ${m.presentations.days_left} days left`,
  ];
}
function recruteurLines(m: any): string[] {
  const callsPart = m.calls ? `   ·   Calls ${m.calls.value}${m.calls.target ? '/' + m.calls.target : ''}` : '';
  const progPart = m.entretiens_programmes ? `   ·   Interviews scheduled ${m.entretiens_programmes.value}` : '';
  return [
    `Screenings ${m.screenings.value}/${m.screenings.target}${chk(m.screenings.value, m.screenings.target)} (5-day avg: ${m.screenings.avg_5d})   ·   New people ${m.nouvelles_personnes.value}/${m.nouvelles_personnes.target}${chk(m.nouvelles_personnes.value, m.nouvelles_personnes.target)}${progPart}${callsPart}`,
  ];
}

const kEuro = (n: number) => `${Math.round((n || 0) / 1000)} k€`;
const EV_DOT: Record<string, string> = { offre: '🟡', presentation: '🔵' };
const EV_LABEL: Record<string, string> = { offre: 'Offer', presentation: 'Presentation' };

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
    piece(calls, 'call', 'calls') + (conn ? ` <span style="color:#8A8699">(${conn} connected)</span>` : ''),
    piece(push, 'push', 'pushes'),
    piece(rdv, 'meeting booked', 'meetings booked'),
    piece(prez, 'presentation this week', 'presentations this week'),
  ];
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F2F3D8"><tr>
    <td style="padding:13px 26px">
      <span style="font-family:${FONT};font-size:9.5px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#8A6A2E">Yesterday at a glance</span>
      <div style="font-family:${FONT};font-size:13.5px;line-height:1.7;color:#4A4568;margin-top:5px">${parts.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</div>
    </td>
  </tr></table>`;
}

// Section « Business — à l'instant t » (l'état, sans barres de progression).
function overviewHtml(o: any): string {
  const dorm = o.mandats_dormants ? ` <span style="font-size:12px;font-weight:bold;color:#8A8699">· ${o.mandats_dormants} dormant</span>` : '';
  return sectionLabel('Business right now', '', 4) + gridOpen + `<tr>
    ${kpiTile(`${o.mandats_actifs ?? 0}${dorm}`, '', 'Active jobs', 'navy')}
    ${kpiTile(String(o.candidats_en_process ?? 0), '', 'Candidates in process', 'violet')}
    ${kpiTile(String(o.offres_en_cours ?? 0), '', 'Open offers', 'lime')}
  </tr><tr>
    ${kpiTile(String(o.presentations_semaine ?? 0), 'week', 'Presentations', 'blue')}
    ${kpiTile(String(o.placements_mois ?? 0), 'month', 'Placements', 'green')}
    ${kpiTile(kEuro(o.ca_mois ?? 0), 'month', 'Revenue billed', 'navy')}
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
  return sectionLabel('Yesterday in numbers') + gridOpen + `<tr>
    ${kpiTile(String(calls), '/ ' + tCalls, 'Calls made', 'navy', pct(calls, tCalls))}
    ${kpiTile(String(conn), '', 'Calls connected', 'green')}
    ${kpiTile(String(push), '/ ' + tPush, 'Pushes sent', 'violet', pct(push, tPush))}
  </tr><tr>
    ${kpiTile(String(rdv), '/ ' + tRdv, 'Meetings booked', 'lime', pct(rdv, tRdv))}
    ${kpiTile(String(prez), '/ ' + tPrez + ' week', 'Presentations held', 'blue', pct(prez, tPrez))}
    ${kpiTile(String(mvt), '', 'Pipeline moves', 'navy')}
  </tr></table>`;
}

function eventsHtml(events: any[], esc: (s: unknown) => string): string {
  const nOffre = events.filter((e) => e.type === 'offre').length;
  const nPrez = events.length - nOffre;
  const hint = events.length ? `${nOffre} offer${nOffre > 1 ? 's' : ''} · ${nPrez} presentation${nPrez > 1 ? 's' : ''}` : '';
  const header = sectionLabel("Yesterday's events", hint);
  if (!events.length) {
    return header + `<div style="border:1.5px dashed rgba(34,23,122,.18);border-radius:15px;padding:20px;text-align:center;background:#F9F9F0">
      <div style="font-family:${FONT};font-size:13px;font-weight:bold;color:#4A4568">No events yesterday</div>
      <div style="font-family:${FONT};font-size:11.5px;color:#8A8699;margin-top:4px">No offers or client presentations recorded.</div>
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
      <div style="font-family:${FONT};font-size:12px;line-height:1.5;color:#4A4568;margin-top:6px">${esc(ev.mandat)}${ev.interlocuteur ? ` &nbsp;·&nbsp; contact: <span style="color:#312C4A">${esc(ev.interlocuteur)}</span>` : ''}</div>
    </div>`;
  }).join('');
  return header + rows;
}

function textReport(rep: any): string {
  const o = rep.overview || {};
  const out = [`Standup · ${enDate(rep.date)}`, ''];
  // Vue business à l'instant t
  out.push('📊 Business');
  out.push(`   Active jobs: ${o.mandats_actifs}${o.mandats_dormants ? ` (dormant ${o.mandats_dormants})` : ''}   ·   Candidates in process: ${o.candidats_en_process}   ·   Open offers: ${o.offres_en_cours}`);
  out.push(`   Presentations (week): ${o.presentations_semaine}   ·   Placements (month): ${o.placements_mois}   ·   Revenue (month): ${kEuro(o.ca_mois)}`);
  out.push('');
  // Événements clés d'hier
  out.push("⚡ Yesterday's events");
  if (!rep.events?.length) out.push('   None yesterday.');
  else for (const ev of rep.events) {
    out.push(`   ${EV_DOT[ev.type]} ${EV_LABEL[ev.type]}: ${ev.candidat} · ${ev.mandat} · by ${ev.recruteur}${ev.interlocuteur ? ` (contact: ${ev.interlocuteur})` : ''}`);
  }
  out.push('');
  out.push('👥 Activity by person');
  out.push('');
  for (const r of rep.rows) {
    const lines = r.role === 'LES_DEUX'
      ? [...salesLines(r.metrics), ...recruteurLines(r.metrics)]
      : r.role === 'SALES' ? salesLines(r.metrics) : recruteurLines(r.metrics);
    out.push(`${DOT[r.status]} ${r.name.toUpperCase()} · ${roleLabel(r.role)}`);
    for (const l of lines) out.push(`   ${l}`);
    const dorm = r.mandats_dormants ? ` · dormant: ${r.mandats_dormants}` : '';
    out.push(`   Pipeline moves: ${r.mouvements_pipeline}   ·   Active jobs: ${r.mandats_actifs}${dorm}`);
    // détail présentations de la semaine
    const pl = r.metrics?.presentations?.list || [];
    for (const p of pl) out.push(`     → ${p.candidat} · ${p.date} · ${p.mandat}${p.interlocuteur ? ' · ' + p.interlocuteur : ''}`);
    out.push('');
  }
  return out.join('\n');
}

// Statut → libellé + pastille (dérivé, jamais codé en dur côté données).
const STATUS_LABEL: Record<string, string> = { GREEN: 'On track', ORANGE: 'Watch', RED: 'Behind' };
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
    { n: m.calls_connectes?.value ?? 0, t: null, l: 'Connected' },
    { n: m.push?.value ?? 0, t: m.push?.target ?? null, l: 'Pushes' },
    { n: m.rdv_nouveaux?.value ?? 0, t: m.rdv_nouveaux?.target ?? null, l: 'Meetings' },
    { n: m.presentations?.value ?? 0, t: m.presentations?.target ?? null, l: 'Pres. week' },
  ]);
  // En double casquette, le groupe recrutement ne répète pas calls/connectés (déjà dans le groupe sales).
  const recCells = cellsFrom(dual
    ? [
        { n: m.screenings?.value ?? 0, t: m.screenings?.target ?? null, l: 'Screenings' },
        { n: m.entretiens_programmes?.value ?? 0, t: null, l: 'Scheduled' },
        { n: m.nouvelles_personnes?.value ?? 0, t: m.nouvelles_personnes?.target ?? null, l: 'New people' },
        { n: r.mouvements_pipeline, t: null, l: 'Moves' },
      ]
    : [
        { n: m.calls?.value ?? 0, t: m.calls?.target ?? null, l: 'Calls' },
        { n: m.screenings?.value ?? 0, t: m.screenings?.target ?? null, l: 'Screenings' },
        { n: m.entretiens_programmes?.value ?? 0, t: null, l: 'Scheduled' },
        { n: m.nouvelles_personnes?.value ?? 0, t: m.nouvelles_personnes?.target ?? null, l: 'New people' },
        { n: r.mouvements_pipeline, t: null, l: 'Moves' },
      ]);

  const statsHtml = dual
    ? statGroup(salesCells, 'Sales') + statGroup(recCells, 'Recruitment')
    : statGroup(isSales ? salesCells : recCells);

  const dorm = r.mandats_dormants ? ` · ${r.mandats_dormants} dormant` : '';
  const mandatsLbl = `${r.mandats_actifs} active job${r.mandats_actifs > 1 ? 's' : ''}${dorm}`;

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
      <div style="font-family:${FONT};font-size:8.5px;font-weight:bold;letter-spacing:1.3px;text-transform:uppercase;color:#2A4A8A;margin-bottom:9px">Presentations held · ${pl.length}</div>
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
              <img src="https://ats.propium.co/brand/logo-mark-cream.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0" />
              <span style="display:inline-block;vertical-align:middle;margin-left:11px">
                <span style="font-family:${FONT};font-size:15px;font-weight:bold;letter-spacing:.5px;color:#E6E9AF">HUMANUP</span>
                <span style="display:block;font-family:${FONT};font-size:7px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:rgba(230,233,175,.5);margin-top:3px">Recruitment Agency</span>
              </span>
            </td>
            <td style="vertical-align:middle;text-align:right">
              <div style="font-family:${FONT};font-size:9px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:rgba(230,233,175,.55)">Activity report</div>
              <div style="font-family:${FONT};font-size:14px;font-weight:bold;color:#fff;margin-top:5px">${cap(enDate(rep.date))}</div>
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
        ${sectionLabel('Activity by person', `${nPeople} ${nPeople > 1 ? 'people' : 'person'}`)}
        ${blocks || `<div style="font-family:${FONT};font-size:13px;color:#8A8699;padding:6px 2px">No active people.</div>`}
      </div>

      <!-- pied navy -->
      <div style="height:3px;background:#E6E9AF;margin-top:18px;font-size:0;line-height:0">&nbsp;</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#22177A"><tr>
        <td style="padding:20px 28px;text-align:center">
          <div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.8px;text-transform:uppercase;color:#E6E9AF">humanup.io</div>
          <div style="font-family:${FONT};font-size:11px;line-height:1.6;color:#b9bb96;margin-top:8px;max-width:420px;margin-left:auto;margin-right:auto">Targets are daily, except presentations, which are counted over the week. Every number can be checked in the ATS.</div>
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
  const subject = `Standup · ${enDate(rep.date)}`;
  await sendEmail(recipients.join(','), subject, htmlReport(rep), textReport(rep));
  return { recipients: recipients.length, date: rep.date, rows: rep.rows.length };
}
