/**
 * Rendu du recap : HTML (inline styles, compatible clients mail)
 * + version texte brut (fallback + lecteurs low-tech).
 */

import type {
  MandatBase,
  MandatRecap,
  PipelineBucket,
  PresentationPrevue,
  RecapPayload,
  Stage,
  UserRef,
} from './recap.types.js';
import { LOGO_MARK_ON_NAVY_DATA_URI } from '../../lib/brand-assets.js';

// ─── Helpers ─────────────────────────────────────────

const STAGE_LABEL: Record<Stage, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contactes',
  ENTRETIEN_1: 'Entr. recruteur',
  ENVOYE_CLIENT: 'Envoyes client',
  ENTRETIEN_CLIENT: 'Entr. client',
  OFFRE: 'Offres',
  PLACE: 'Places',
  REFUSE: 'Refuses',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d: Date, tz = 'Asia/Ho_Chi_Minh'): string {
  return d.toLocaleString('fr-FR', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(d: Date, tz = 'Asia/Ho_Chi_Minh'): string {
  return d.toLocaleString('fr-FR', {
    timeZone: tz,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function userLabel(u: UserRef | null): string {
  return u ? u.label : '—';
}

function mandatTitle(m: MandatBase): string {
  return `${m.entreprise} — ${m.titrePoste}`;
}

// ─── HumanUp brand palette ───────────────────────────

const COLORS = {
  bg: '#FCFCF5',           // warm cream
  card: '#FFFFFF',
  border: '#eceaf2',
  text: '#1A1533',         // dark navy
  muted: '#6e6a85',
  accent: '#22177A',       // brand primary navy
  accentSoft: '#4b3fb0',
  highlight: '#E6E9AF',    // chartreuse
  highlightSoft: '#f0efc4',
};

const FONT_BODY =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const FONT_DISPLAY =
  "'Archivo Black', 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";

// Google Fonts CSS — loads Manrope + Archivo Black on Gmail/Apple Mail/mobile,
// silently falls back on Outlook desktop (which ignores web fonts anyway).
const GOOGLE_FONTS_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Archivo+Black&display=swap" rel="stylesheet">';

// ─── HTML ────────────────────────────────────────────

export function renderRecapHtml(payload: RecapPayload, tz = 'Asia/Ho_Chi_Minh'): string {
  const { mandats, parPersonne, windowStart, windowEnd } = payload;

  const heading = `Recap — ${formatDay(windowEnd, tz)}`;
  const windowLabel = `Fenetre : ${formatDate(windowStart, tz)} → ${formatDate(windowEnd, tz)}`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(heading)}</title>
${GOOGLE_FONTS_LINK}
</head>
<body style="margin:0;padding:24px;background:${COLORS.bg};font-family:${FONT_BODY};color:${COLORS.text};font-size:14px;line-height:1.55;">
  <div style="max-width:720px;margin:0 auto;">
    ${renderBrandHeader(heading, windowLabel)}
    ${renderMandatsSection(mandats, tz)}
    ${renderParPersonneSection(parPersonne)}
    ${renderFooter(payload.generatedAt, tz)}
  </div>
</body>
</html>`;
}

function renderBrandHeader(title: string, subtitle: string): string {
  return `
  <div style="padding:26px 28px;background:${COLORS.accent};border-radius:16px;margin-bottom:16px;color:#fff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="width:74px;vertical-align:middle;">
          <img src="${LOGO_MARK_ON_NAVY_DATA_URI}" alt="HumanUp" width="60" height="62" style="display:block;border:0;outline:none;text-decoration:none;">
        </td>
        <td style="padding-left:18px;vertical-align:middle;">
          <div style="font-family:${FONT_DISPLAY};font-size:22px;letter-spacing:-0.01em;line-height:1.1;">${escapeHtml(title)}</div>
          <div style="margin-top:4px;font-family:${FONT_BODY};font-size:12px;color:${COLORS.highlight};opacity:0.9;">${escapeHtml(subtitle)}</div>
        </td>
      </tr>
    </table>
  </div>`;
}

function renderFooter(generatedAt: Date, tz: string): string {
  return `
  <p style="margin:16px 0 0 0;color:${COLORS.muted};font-size:12px;text-align:center;font-family:${FONT_BODY};">
    Genere le ${escapeHtml(formatDate(generatedAt, tz))} — HumanUp ATS
  </p>`;
}

// ── Etat par mandat ─────────────────────────────────

function renderMandatsSection(mandats: MandatRecap[], tz: string): string {
  if (mandats.length === 0) {
    return renderCard(
      `Etat par mandat`,
      `0 mandat actif`,
      `<p style="margin:0;color:${COLORS.muted};">Aucun mandat OUVERT/EN_COURS.</p>`,
    );
  }

  const totalPrez = mandats.reduce((s, m) => s + m.presentationsPrevues.length, 0);
  const inner = mandats.map((m) => renderMandatCard(m, tz)).join('');
  return renderCard(
    `Etat par mandat`,
    `${mandats.length} mandat${mandats.length > 1 ? 's' : ''} actif${mandats.length > 1 ? 's' : ''} · ${totalPrez} prez prevue${totalPrez > 1 ? 's' : ''}`,
    inner,
  );
}

function renderMandatCard(m: MandatRecap, tz: string): string {
  const header = `
    <div style="margin-bottom:8px;">
      <strong style="font-size:15px;">${escapeHtml(mandatTitle(m))}</strong>
      <span style="color:${COLORS.muted};font-size:12px;margin-left:6px;">${m.ageJours}j</span>
    </div>
    <p style="margin:0 0 8px 0;color:${COLORS.muted};font-size:12px;">
      Contact : ${escapeHtml(m.clientLabel ?? '—')} · Sales : ${escapeHtml(userLabel(m.sales))} · Recruteur : ${escapeHtml(userLabel(m.recruteur))}
    </p>`;

  const pipelineHtml = renderPipelineRow(m.pipeline, m.totalActifs);

  const prezHtml =
    m.presentationsPrevues.length === 0
      ? `<p style="margin:12px 0 0 0;color:${COLORS.muted};font-size:12px;font-style:italic;">Aucune presentation prevue.</p>`
      : `
      <p style="margin:12px 0 4px 0;font-size:12px;font-weight:600;color:${COLORS.highlight};">
        Prez prevues (${m.presentationsPrevues.length})
      </p>
      <ul style="margin:0;padding-left:18px;font-size:12px;color:${COLORS.text};">
        ${m.presentationsPrevues
          .map(
            (p) => `<li>${escapeHtml(p.candidatLabel)} — <span style="color:${COLORS.muted};">${escapeHtml(formatDate(p.at, tz))}</span>${p.source === 'RDV' && p.label ? ` · ${escapeHtml(p.label)}` : ''}</li>`,
          )
          .join('')}
      </ul>`;

  return `
  <div style="border-top:1px solid ${COLORS.border};padding:14px 0;">
    ${header}
    ${pipelineHtml}
    ${prezHtml}
  </div>`;
}

function renderPipelineRow(pipeline: PipelineBucket[], totalActifs: number): string {
  const cells = pipeline
    .filter((b) => b.count > 0)
    .map((b) => {
      const oldestLabel = b.oldestDays !== null ? ` · ${b.oldestDays}j` : '';
      return `
      <td style="padding:6px 10px;border:1px solid ${COLORS.border};font-size:12px;">
        <div style="color:${COLORS.muted};font-size:11px;">${escapeHtml(STAGE_LABEL[b.stage])}</div>
        <div style="font-weight:600;color:${COLORS.text};">${b.count}${oldestLabel}</div>
      </td>`;
    })
    .join('');

  if (!cells) {
    return `<p style="margin:0;color:${COLORS.muted};font-size:12px;font-style:italic;">Pipeline vide.</p>`;
  }

  return `
  <p style="margin:0 0 4px 0;font-size:12px;color:${COLORS.muted};">
    ${totalActifs} candidat${totalActifs > 1 ? 's' : ''} en process
  </p>
  <table style="border-collapse:collapse;margin:0;">
    <tr>${cells}</tr>
  </table>`;
}

// ── Activite par personne ───────────────────────────

function renderParPersonneSection(p: RecapPayload['parPersonne']): string {
  const salesHtml =
    p.sales.length === 0
      ? ''
      : `
      <h4 style="margin:12px 0 6px 0;font-size:13px;font-weight:600;">Sales</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="background:${COLORS.bg};">
          <th style="text-align:left;padding:6px;border:1px solid ${COLORS.border};">Personne</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">RDV</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">Mandats</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">Appels</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">Envoyes client</th>
        </tr>
        ${p.sales
          .map(
            (s) => `
        <tr>
          <td style="padding:6px;border:1px solid ${COLORS.border};">${escapeHtml(s.user.label)}${s.user.excludeFromTeamStats ? ` <span style="color:${COLORS.muted};font-size:10px;">(hors totaux)</span>` : ''}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${s.nouveauxRdv}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${s.nouveauxMandats}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${s.appels}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${s.candidaturesEnvoyeesClient}</td>
        </tr>`,
          )
          .join('')}
      </table>`;

  const recHtml =
    p.recruteurs.length === 0
      ? ''
      : `
      <h4 style="margin:16px 0 6px 0;font-size:13px;font-weight:600;">Recruteurs</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <tr style="background:${COLORS.bg};">
          <th style="text-align:left;padding:6px;border:1px solid ${COLORS.border};">Personne</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">Appels</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">Entr. recruteur</th>
          <th style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">Presentations</th>
        </tr>
        ${p.recruteurs
          .map(
            (r) => `
        <tr>
          <td style="padding:6px;border:1px solid ${COLORS.border};">${escapeHtml(r.user.label)}${r.user.excludeFromTeamStats ? ` <span style="color:${COLORS.muted};font-size:10px;">(hors totaux)</span>` : ''}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${r.appels}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${r.entretiensRecruteur}</td>
          <td style="text-align:right;padding:6px;border:1px solid ${COLORS.border};">${r.presentations}</td>
        </tr>`,
          )
          .join('')}
      </table>`;

  const t = p.totaux;
  const totauxHtml = `
    <p style="margin:16px 0 0 0;font-size:12px;color:${COLORS.text};">
      <strong>Totaux equipe</strong> (hors users exclus) :
      ${t.appelsEquipe} appels · ${t.rdvEquipe} RDV · ${t.entretiensRecruteurEquipe} entretiens recruteur · ${t.presentationsEquipe} presentations · ${t.entretiensClientEquipe} entretiens client · ${t.placementsEquipe} placements · ${t.nouveauxMandatsEquipe} nouveaux mandats.
    </p>
    <p style="margin:4px 0 0 0;font-size:11px;color:${COLORS.muted};">
      Grand total : ${t.appelsGrandTotal} appels · ${t.rdvGrandTotal} RDV.
    </p>`;

  return renderCard(
    `Activite par personne`,
    `${p.sales.length + p.recruteurs.length} personne${p.sales.length + p.recruteurs.length > 1 ? 's' : ''}`,
    `${salesHtml}${recHtml}${totauxHtml}`,
  );
}

// ─── Card wrapper ────────────────────────────────────

function renderCard(title: string, subtitle: string, inner: string): string {
  return `
  <div style="padding:22px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;margin-bottom:16px;box-shadow:0 12px 34px -28px rgba(34,23,122,0.35);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px;">
      <tr>
        <td style="vertical-align:baseline;">
          <h2 style="margin:0;font-family:${FONT_DISPLAY};font-size:17px;letter-spacing:-0.01em;color:${COLORS.accent};">
            ${escapeHtml(title)}
          </h2>
        </td>
        <td style="text-align:right;vertical-align:baseline;">
          <span style="color:${COLORS.muted};font-size:12px;">${escapeHtml(subtitle)}</span>
        </td>
      </tr>
    </table>
    ${inner}
  </div>`;
}

// ─── Rendu texte brut (fallback) ─────────────────────

export function renderRecapText(payload: RecapPayload, tz = 'Asia/Ho_Chi_Minh'): string {
  const { mandats, parPersonne, windowStart, windowEnd } = payload;
  const lines: string[] = [];

  lines.push(`Recap — ${formatDay(windowEnd, tz)}`);
  lines.push(`Fenetre : ${formatDate(windowStart, tz)} -> ${formatDate(windowEnd, tz)}`);
  lines.push('');

  lines.push('=== ETAT PAR MANDAT ===');
  if (mandats.length === 0) {
    lines.push('Aucun mandat actif.');
  } else {
    for (const m of mandats) {
      lines.push('');
      lines.push(`${mandatTitle(m)} (${m.ageJours}j)`);
      lines.push(`  Contact: ${m.clientLabel ?? '—'} | Sales: ${userLabel(m.sales)} | Recruteur: ${userLabel(m.recruteur)}`);
      const buckets = m.pipeline
        .filter((b) => b.count > 0)
        .map((b) => `${STAGE_LABEL[b.stage]} ${b.count}${b.oldestDays !== null ? `/${b.oldestDays}j` : ''}`)
        .join(' · ');
      lines.push(`  ${m.totalActifs} en process — ${buckets || 'pipeline vide'}`);
      if (m.presentationsPrevues.length) {
        lines.push(`  Prez prevues (${m.presentationsPrevues.length}) :`);
        for (const p of m.presentationsPrevues) {
          lines.push(`    · ${p.candidatLabel} — ${formatDate(p.at, tz)}${p.source === 'RDV' && p.label ? ` · ${p.label}` : ''}`);
        }
      } else {
        lines.push(`  Prez prevues: aucune`);
      }
    }
  }
  lines.push('');

  lines.push('=== ACTIVITE PAR PERSONNE ===');
  const p = parPersonne;
  if (p.sales.length) {
    lines.push('');
    lines.push('Sales :');
    for (const s of p.sales) {
      const excl = s.user.excludeFromTeamStats ? ' (hors totaux)' : '';
      lines.push(`  ${s.user.label}${excl} — RDV ${s.nouveauxRdv} · Mandats ${s.nouveauxMandats} · Appels ${s.appels} · Envoyes ${s.candidaturesEnvoyeesClient}`);
    }
  }
  if (p.recruteurs.length) {
    lines.push('');
    lines.push('Recruteurs :');
    for (const r of p.recruteurs) {
      const excl = r.user.excludeFromTeamStats ? ' (hors totaux)' : '';
      lines.push(`  ${r.user.label}${excl} — Appels ${r.appels} · Entr. recruteur ${r.entretiensRecruteur} · Presentations ${r.presentations}`);
    }
  }
  const t = p.totaux;
  lines.push('');
  lines.push(`Totaux equipe : ${t.appelsEquipe} appels · ${t.rdvEquipe} RDV · ${t.entretiensRecruteurEquipe} entr.rec · ${t.presentationsEquipe} pres · ${t.entretiensClientEquipe} entr.cli · ${t.placementsEquipe} placements · ${t.nouveauxMandatsEquipe} mandats`);
  lines.push(`Grand total : ${t.appelsGrandTotal} appels · ${t.rdvGrandTotal} RDV`);
  lines.push('');
  lines.push(`Genere le ${formatDate(payload.generatedAt, tz)} — HumanUp ATS`);

  return lines.join('\n');
}

// ─── Sujet email ─────────────────────────────────────

export function renderRecapSubject(payload: RecapPayload, tz = 'Asia/Ho_Chi_Minh'): string {
  const day = payload.windowEnd.toLocaleString('fr-FR', {
    timeZone: tz,
    weekday: 'long',
  });
  const date = payload.windowEnd.toLocaleString('fr-FR', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
  });
  const totalPrez = payload.mandats.reduce((s, m) => s + m.presentationsPrevues.length, 0);
  const totalActifs = payload.mandats.reduce((s, m) => s + m.totalActifs, 0);
  const suffix = totalActifs > 0
    ? ` — ${totalActifs} en process${totalPrez > 0 ? `, ${totalPrez} prez prevue${totalPrez > 1 ? 's' : ''}` : ''}`
    : '';
  return `Recap ${day} ${date}${suffix}`;
}
