/**
 * Rendu du recap : HTML (inline styles, compatible clients mail)
 * + version texte brut (fallback + lecteurs low-tech).
 *
 * Pas de framework de templating pour eviter une dep. Interpolation
 * simple + escape HTML pour tout ce qui vient de la DB.
 */

import type {
  MandatRecap,
  MandatBase,
  PipelineBucket,
  RecapPayload,
  Stage,
  UserRef,
} from './recap.types.js';

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

// ─── Palette (email-safe, gris/rouge/orange/vert sobre) ──

const COLORS = {
  bg: '#f7f7f7',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#111827',
  muted: '#6b7280',
  green: '#059669',
  yellow: '#d97706',
  red: '#dc2626',
  accent: '#111827',
};

// ─── HTML ────────────────────────────────────────────

export function renderRecapHtml(payload: RecapPayload, tz = 'Asia/Ho_Chi_Minh'): string {
  const { blocages, mandats, parPersonne, windowStart, windowEnd } = payload;

  const heading = `Recap — ${formatDay(windowEnd, tz)}`;
  const windowLabel = `Fenetre : ${formatDate(windowStart, tz)} → ${formatDate(windowEnd, tz)}`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:24px;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${COLORS.text};font-size:14px;line-height:1.5;">
  <div style="max-width:720px;margin:0 auto;">
    ${renderHeader(heading, windowLabel)}
    ${renderBlocagesSection(blocages)}
    ${renderMandatsSection(mandats)}
    ${renderParPersonneSection(parPersonne)}
    ${renderFooter(payload.generatedAt, tz)}
  </div>
</body>
</html>`;
}

function renderHeader(title: string, subtitle: string): string {
  return `
  <div style="padding:24px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;margin-bottom:16px;">
    <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:600;color:${COLORS.accent};">
      ${escapeHtml(title)}
    </h1>
    <p style="margin:0;color:${COLORS.muted};font-size:13px;">${escapeHtml(subtitle)}</p>
  </div>`;
}

function renderFooter(generatedAt: Date, tz: string): string {
  return `
  <p style="margin:16px 0 0 0;color:${COLORS.muted};font-size:12px;text-align:center;">
    Genere le ${escapeHtml(formatDate(generatedAt, tz))} — HumanUp ATS
  </p>`;
}

// ── Section 1 — Blocages ─────────────────────────────

function renderBlocagesSection(b: RecapPayload['blocages']): string {
  const total =
    b.mandatsGeles.length +
    b.clientsSilencieux.length +
    b.mandatsSansRecruteur.length +
    b.mandatsPipelineVide.length +
    b.tachesEnRetard.length;

  const inner = total === 0
    ? `<p style="margin:0;color:${COLORS.muted};">Aucun blocage detecte cette semaine.</p>`
    : `
      ${renderBlocageBlock(
        `Mandats geles (> 7j sans activite)`,
        b.mandatsGeles.map((m) => `<li>${escapeHtml(mandatTitle(m))} — <span style="color:${COLORS.red};">${m.joursSansActivite}j</span> — ${escapeHtml(userLabel(m.recruteur))}</li>`),
      )}
      ${renderBlocageBlock(
        `Clients silencieux (> 5j en entretien client)`,
        b.clientsSilencieux.map((s) => `<li>${escapeHtml(s.candidatLabel)} sur ${escapeHtml(mandatTitle(s))} — <span style="color:${COLORS.yellow};">${s.joursDepuisEntretienClient}j</span></li>`),
      )}
      ${renderBlocageBlock(
        `Mandats sans recruteur`,
        b.mandatsSansRecruteur.map((m) => `<li>${escapeHtml(mandatTitle(m))} — sales : ${escapeHtml(userLabel(m.sales))}</li>`),
      )}
      ${renderBlocageBlock(
        `Mandats pipeline vide`,
        b.mandatsPipelineVide.map((m) => `<li>${escapeHtml(mandatTitle(m))} — recruteur : ${escapeHtml(userLabel(m.recruteur))}</li>`),
      )}
      ${renderBlocageBlock(
        `Taches en retard (> 2j)`,
        b.tachesEnRetard.map((t) => `<li>${escapeHtml(t.titre)} — <span style="color:${COLORS.red};">${t.joursRetard}j</span> — ${escapeHtml(userLabel(t.user))}</li>`),
      )}
    `;

  return renderCard(`Blocages`, `${total} point${total > 1 ? 's' : ''} d'attention`, inner);
}

function renderBlocageBlock(title: string, lis: string[]): string {
  if (lis.length === 0) return '';
  return `
  <div style="margin-bottom:14px;">
    <h4 style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:${COLORS.text};">
      ${escapeHtml(title)}
    </h4>
    <ul style="margin:0;padding-left:20px;color:${COLORS.text};">
      ${lis.join('')}
    </ul>
  </div>`;
}

// ── Section 2 — Etat par mandat ─────────────────────

function renderMandatsSection(mandats: MandatRecap[]): string {
  if (mandats.length === 0) {
    return renderCard(
      `Etat par mandat`,
      `0 mandat actif`,
      `<p style="margin:0;color:${COLORS.muted};">Aucun mandat OUVERT/EN_COURS.</p>`,
    );
  }

  // Trier : RED > YELLOW > GREEN, puis par age decroissant
  const order: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
  const sorted = [...mandats].sort((a, b) => {
    const d = (order[a.healthScore] ?? 3) - (order[b.healthScore] ?? 3);
    if (d !== 0) return d;
    return b.ageJours - a.ageJours;
  });

  const inner = sorted.map(renderMandatCard).join('');
  return renderCard(`Etat par mandat`, `${mandats.length} mandat${mandats.length > 1 ? 's' : ''} actif${mandats.length > 1 ? 's' : ''}`, inner);
}

function renderMandatCard(m: MandatRecap): string {
  const badge = renderHealthBadge(m.healthScore);
  const header = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
      <div>
        <strong style="font-size:15px;">${escapeHtml(mandatTitle(m))}</strong>
        <span style="color:${COLORS.muted};font-size:12px;margin-left:6px;">${m.ageJours}j</span>
      </div>
      ${badge}
    </div>
    <p style="margin:0 0 8px 0;color:${COLORS.muted};font-size:12px;">
      Contact : ${escapeHtml(m.clientLabel ?? '—')} · Sales : ${escapeHtml(userLabel(m.sales))} · Recruteur : ${escapeHtml(userLabel(m.recruteur))}
    </p>`;

  const pipelineHtml = renderPipelineRow(m.pipeline);

  const mouvementsHtml = m.mouvements.length === 0
    ? `<p style="margin:8px 0 0 0;color:${COLORS.muted};font-size:12px;font-style:italic;">Aucun mouvement dans la fenetre.</p>`
    : `
      <p style="margin:12px 0 4px 0;font-size:12px;font-weight:600;color:${COLORS.text};">
        Mouvements (${m.mouvements.length})
      </p>
      <ul style="margin:0;padding-left:18px;font-size:12px;color:${COLORS.text};">
        ${m.mouvements.slice(0, 8).map((mv) => `<li>${escapeHtml(mv.label)} — ${escapeHtml(userLabel(mv.user))} — <span style="color:${COLORS.muted};">${escapeHtml(formatDate(mv.at))}</span></li>`).join('')}
        ${m.mouvements.length > 8 ? `<li style="color:${COLORS.muted};">… et ${m.mouvements.length - 8} autres</li>` : ''}
      </ul>`;

  const prochaineActionHtml = m.prochaineAction
    ? `
      <p style="margin:12px 0 0 0;font-size:12px;">
        <strong>Prochaine action :</strong>
        ${m.prochaineAction.type === 'RDV' ? 'RDV' : 'Tache'} —
        ${escapeHtml(m.prochaineAction.label)} —
        <span style="color:${COLORS.muted};">${escapeHtml(formatDate(m.prochaineAction.at))} · ${escapeHtml(userLabel(m.prochaineAction.user))}</span>
      </p>`
    : `<p style="margin:12px 0 0 0;font-size:12px;color:${COLORS.muted};font-style:italic;">Aucune prochaine action planifiee.</p>`;

  return `
  <div style="border-top:1px solid ${COLORS.border};padding:14px 0;">
    ${header}
    ${pipelineHtml}
    ${mouvementsHtml}
    ${prochaineActionHtml}
  </div>`;
}

function renderHealthBadge(h: MandatRecap['healthScore']): string {
  const map = {
    GREEN: { color: COLORS.green, label: 'OK' },
    YELLOW: { color: COLORS.yellow, label: 'A surveiller' },
    RED: { color: COLORS.red, label: 'Bloque' },
  } as const;
  const c = map[h];
  return `<span style="display:inline-block;padding:2px 8px;font-size:11px;font-weight:600;color:#fff;background:${c.color};border-radius:10px;">${escapeHtml(c.label)}</span>`;
}

function renderPipelineRow(pipeline: PipelineBucket[]): string {
  const cells = pipeline
    .filter((b) => b.count > 0)
    .map((b) => {
      const color = b.alerte ? COLORS.red : COLORS.muted;
      const oldestLabel = b.oldestDays !== null ? ` · ${b.oldestDays}j` : '';
      return `
      <td style="padding:6px 10px;border:1px solid ${COLORS.border};font-size:12px;">
        <div style="color:${COLORS.muted};font-size:11px;">${escapeHtml(STAGE_LABEL[b.stage])}</div>
        <div style="font-weight:600;color:${color};">${b.count}${oldestLabel}</div>
      </td>`;
    })
    .join('');

  if (!cells) {
    return `<p style="margin:0;color:${COLORS.muted};font-size:12px;font-style:italic;">Pipeline vide.</p>`;
  }

  return `
  <table style="border-collapse:collapse;margin:6px 0 0 0;">
    <tr>${cells}</tr>
  </table>`;
}

// ── Section 3 — Activite par personne ───────────────

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
  <div style="padding:20px;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
      <h2 style="margin:0;font-size:16px;font-weight:600;color:${COLORS.accent};">
        ${escapeHtml(title)}
      </h2>
      <span style="color:${COLORS.muted};font-size:12px;">${escapeHtml(subtitle)}</span>
    </div>
    ${inner}
  </div>`;
}

// ─── Rendu texte brut (fallback) ─────────────────────

export function renderRecapText(payload: RecapPayload, tz = 'Asia/Ho_Chi_Minh'): string {
  const { blocages, mandats, parPersonne, windowStart, windowEnd } = payload;
  const lines: string[] = [];

  lines.push(`Recap — ${formatDay(windowEnd, tz)}`);
  lines.push(`Fenetre : ${formatDate(windowStart, tz)} -> ${formatDate(windowEnd, tz)}`);
  lines.push('');

  // Blocages
  lines.push('=== BLOCAGES ===');
  const b = blocages;
  const totalBloc =
    b.mandatsGeles.length +
    b.clientsSilencieux.length +
    b.mandatsSansRecruteur.length +
    b.mandatsPipelineVide.length +
    b.tachesEnRetard.length;
  if (totalBloc === 0) {
    lines.push('Aucun blocage detecte.');
  } else {
    if (b.mandatsGeles.length) {
      lines.push('');
      lines.push(`Mandats geles (> 7j) :`);
      for (const m of b.mandatsGeles) {
        lines.push(`  - ${mandatTitle(m)} — ${m.joursSansActivite}j — ${userLabel(m.recruteur)}`);
      }
    }
    if (b.clientsSilencieux.length) {
      lines.push('');
      lines.push(`Clients silencieux (> 5j entretien client) :`);
      for (const s of b.clientsSilencieux) {
        lines.push(`  - ${s.candidatLabel} sur ${mandatTitle(s)} — ${s.joursDepuisEntretienClient}j`);
      }
    }
    if (b.mandatsSansRecruteur.length) {
      lines.push('');
      lines.push(`Mandats sans recruteur :`);
      for (const m of b.mandatsSansRecruteur) {
        lines.push(`  - ${mandatTitle(m)} — sales : ${userLabel(m.sales)}`);
      }
    }
    if (b.mandatsPipelineVide.length) {
      lines.push('');
      lines.push(`Mandats pipeline vide :`);
      for (const m of b.mandatsPipelineVide) {
        lines.push(`  - ${mandatTitle(m)} — recruteur : ${userLabel(m.recruteur)}`);
      }
    }
    if (b.tachesEnRetard.length) {
      lines.push('');
      lines.push(`Taches en retard (> 2j) :`);
      for (const t of b.tachesEnRetard) {
        lines.push(`  - ${t.titre} — ${t.joursRetard}j — ${userLabel(t.user)}`);
      }
    }
  }
  lines.push('');

  // Mandats
  lines.push('=== ETAT PAR MANDAT ===');
  if (mandats.length === 0) {
    lines.push('Aucun mandat actif.');
  } else {
    for (const m of mandats) {
      lines.push('');
      lines.push(`[${m.healthScore}] ${mandatTitle(m)} (${m.ageJours}j)`);
      lines.push(`  Contact: ${m.clientLabel ?? '—'} | Sales: ${userLabel(m.sales)} | Recruteur: ${userLabel(m.recruteur)}`);
      const buckets = m.pipeline
        .filter((b) => b.count > 0)
        .map((b) => `${STAGE_LABEL[b.stage]} ${b.count}${b.oldestDays !== null ? `/${b.oldestDays}j` : ''}${b.alerte ? '!' : ''}`)
        .join(' · ');
      lines.push(`  Pipeline: ${buckets || 'vide'}`);
      if (m.mouvements.length) {
        lines.push(`  Mouvements (${m.mouvements.length}) :`);
        for (const mv of m.mouvements.slice(0, 8)) {
          lines.push(`    · ${mv.label} — ${userLabel(mv.user)} — ${formatDate(mv.at, tz)}`);
        }
        if (m.mouvements.length > 8) lines.push(`    · … et ${m.mouvements.length - 8} autres`);
      } else {
        lines.push(`  Mouvements: (aucun dans la fenetre)`);
      }
      if (m.prochaineAction) {
        lines.push(`  Prochaine action: ${m.prochaineAction.type} — ${m.prochaineAction.label} — ${formatDate(m.prochaineAction.at, tz)} · ${userLabel(m.prochaineAction.user)}`);
      }
    }
  }
  lines.push('');

  // Par personne
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
  const total =
    payload.blocages.mandatsGeles.length +
    payload.blocages.clientsSilencieux.length +
    payload.blocages.mandatsSansRecruteur.length +
    payload.blocages.mandatsPipelineVide.length +
    payload.blocages.tachesEnRetard.length;
  const flag = total > 0 ? ` — ${total} point${total > 1 ? 's' : ''} d'attention` : '';
  return `Recap ${day} ${date}${flag}`;
}
