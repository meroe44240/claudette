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
const roleLabel = (r: string) => (r === 'SALES' ? 'Sales' : 'Recruteur');
const chk = (v: number, t: number) => (v >= t ? ' ✓' : '');

function salesLines(m: any): string[] {
  return [
    `Calls ${m.calls.value}/${m.calls.target} (moy. 5j : ${m.calls.avg_5d})   ·   RDV ${m.rdv_nouveaux.value}/${m.rdv_nouveaux.target}${chk(m.rdv_nouveaux.value, m.rdv_nouveaux.target)}   ·   Push ${m.push.value}/${m.push.target}${chk(m.push.value, m.push.target)}`,
    `Présentations ${m.presentations.value}/${m.presentations.target}${chk(m.presentations.value, m.presentations.target)} · ${m.presentations.days_left}j restants`,
  ];
}
function recruteurLines(m: any): string[] {
  return [
    `Screenings ${m.screenings.value}/${m.screenings.target}${chk(m.screenings.value, m.screenings.target)} (moy. 5j : ${m.screenings.avg_5d})   ·   Nouvelles ${m.nouvelles_personnes.value}/${m.nouvelles_personnes.target}${chk(m.nouvelles_personnes.value, m.nouvelles_personnes.target)}`,
  ];
}

const kEuro = (n: number) => `${Math.round((n || 0) / 1000)} k€`;
const EV_DOT: Record<string, string> = { offre: '🟡', presentation: '🔵' };
const EV_LABEL: Record<string, string> = { offre: 'Offre', presentation: 'Présentation' };

function overviewHtml(o: any): string {
  const tile = (label: string, value: string, accent = false) =>
    `<td style="background:${accent ? '#22177A' : '#fff'};border-radius:10px;padding:12px 14px;vertical-align:top">
      <div style="font-family:Arial,sans-serif;font-size:9.5px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${accent ? '#b9bb96' : '#8A8699'}">${label}</div>
      <div style="font-family:Arial,sans-serif;font-size:19px;font-weight:bold;color:${accent ? '#E6E9AF' : '#1A1533'};margin-top:3px">${value}</div>
    </td>`;
  return `<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#8A8699;margin:2px 0 10px">Business — à l'instant t</div>
  <table cellpadding="0" cellspacing="6" border="0" style="width:100%;border-collapse:separate"><tr>
    ${tile('Mandats actifs', `${o.mandats_actifs ?? 0}${o.mandats_dormants ? ` <span style="font-size:12px;color:#9A96AE">· ${o.mandats_dormants} dorm.</span>` : ''}`)}
    ${tile('En process', String(o.candidats_en_process ?? 0))}
    ${tile('Offres en cours', String(o.offres_en_cours ?? 0))}
  </tr><tr>
    ${tile('Présentations (sem.)', String(o.presentations_semaine ?? 0))}
    ${tile('Placements (mois)', String(o.placements_mois ?? 0))}
    ${tile('CA (mois)', kEuro(o.ca_mois ?? 0), true)}
  </tr></table>`;
}

function eventsHtml(events: any[], esc: (s: unknown) => string): string {
  const header = `<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#8A8699;margin:18px 0 8px">Événements d'hier — offres &amp; présentations</div>`;
  if (!events.length) return header + `<div style="font-family:Arial,sans-serif;font-size:13px;color:#9A96AE;padding:6px 2px">Aucun hier.</div>`;
  const rows = events.map((ev) => {
    const isOffre = ev.type === 'offre';
    const badge = isOffre ? '#C9A227' : '#2A6BD8';
    return `<div style="background:#fff;border-left:4px solid ${badge};border-radius:0 8px 8px 0;padding:9px 13px;margin:0 0 6px">
      <span style="font-family:Arial,sans-serif;font-size:9.5px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase;color:${badge}">${EV_LABEL[ev.type]}</span>
      <span style="font-family:Arial,sans-serif;font-size:13.5px;font-weight:bold;color:#1A1533;margin-left:8px">${esc(ev.candidat)}</span>
      <div style="font-family:Arial,sans-serif;font-size:12px;color:#4A4568;margin-top:2px">${esc(ev.mandat)} · par ${esc(ev.recruteur)}${ev.interlocuteur ? ` · interlocuteur : ${esc(ev.interlocuteur)}` : ''}</div>
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
    const lines = r.role === 'SALES' ? salesLines(r.metrics) : recruteurLines(r.metrics);
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

function htmlReport(rep: any): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]));
  const blocks = rep.rows.map((r: any) => {
    const lines = r.role === 'SALES' ? salesLines(r.metrics) : recruteurLines(r.metrics);
    const dorm = r.mandats_dormants ? ` · dormants : ${r.mandats_dormants}` : '';
    const pl = r.metrics?.presentations?.list || [];
    const prez = pl.length
      ? `<div style="margin-top:6px;font-size:12px;color:#4A4568">${pl.map((p: any) => `→ ${esc(p.candidat)} · ${esc(p.date)} · ${esc(p.mandat)}${p.interlocuteur ? ' · ' + esc(p.interlocuteur) : ''}`).join('<br>')}</div>`
      : '';
    return `<div style="border-left:4px solid ${HEX[r.status]};background:#fff;border-radius:0 10px 10px 0;padding:12px 16px;margin:0 0 10px">
      <div style="font-family:Arial,sans-serif;font-weight:bold;font-size:14px;color:#1A1533">${DOT[r.status]} ${esc(r.name)} <span style="color:#8A8699;font-weight:normal">· ${roleLabel(r.role)}</span></div>
      ${lines.map((l) => `<div style="font-family:Arial,sans-serif;font-size:13px;color:#312C4A;margin-top:4px">${esc(l)}</div>`).join('')}
      <div style="font-family:Arial,sans-serif;font-size:12.5px;color:#6E6A85;margin-top:5px">Mouvements pipeline : ${r.mouvements_pipeline} · Mandats actifs : ${r.mandats_actifs}${dorm}</div>
      ${prez}
    </div>`;
  }).join('');
  return `<div style="background:#EDEDF2;padding:22px 10px;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto">
      <div style="background:#22177A;border-radius:12px 12px 0 0;padding:18px 22px;border-bottom:3px solid #E6E9AF">
        <span style="font-family:Arial,sans-serif;font-weight:bold;font-size:16px;color:#E6E9AF;letter-spacing:.5px">STANDUP</span>
        <span style="font-family:Arial,sans-serif;font-size:13px;color:#b9bb96;margin-left:10px;text-transform:capitalize">${frDate(rep.date)}</span>
      </div>
      <div style="background:#F4F4EA;border-radius:0 0 12px 12px;padding:16px">
        ${overviewHtml(rep.overview || {})}
        ${eventsHtml(rep.events || [], esc)}
        <div style="font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#8A8699;margin:18px 0 10px">Activité par personne</div>
        ${blocks}
      </div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#9A96AE;text-align:center;padding:12px 0">Rapport d'activité J-1 · HumanUp — les seuils sont volontairement bas au démarrage, l'objectif est de suivre l'écart, pas de juger.</div>
    </div></div>`;
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
