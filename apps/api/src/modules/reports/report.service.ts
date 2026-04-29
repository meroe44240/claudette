import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';

// ─── TYPES ──────────────────────────────────────────

interface ClientReportData {
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    poste: string | null;
    statutClient: string;
    entreprise: { nom: string; secteur: string | null; localisation: string | null };
  };
  mandats: Array<{
    id: string;
    titrePoste: string;
    statut: string;
    priorite: string;
    feeMontantEstime: number | null;
    dateOuverture: string;
    dateCloture: string | null;
    candidaturesCount: number;
    candidaturesParStage: Record<string, number>;
  }>;
  activites: Array<{
    type: string;
    titre: string | null;
    contenu: string | null;
    createdAt: string;
  }>;
  stats: {
    mandatsTotal: number;
    mandatsActifs: number;
    candidaturesTotal: number;
    placementsTotal: number;
    feeTotal: number;
  };
}

interface MandatReportData {
  mandat: {
    id: string;
    titrePoste: string;
    description: string | null;
    statut: string;
    priorite: string;
    localisation: string | null;
    salaireMin: number | null;
    salaireMax: number | null;
    feePourcentage: number;
    feeMontantEstime: number | null;
    feeMontantFacture: number | null;
    feeStatut: string;
    dateOuverture: string;
    dateCloture: string | null;
    entreprise: { nom: string };
    client: { nom: string; prenom: string | null; email: string | null };
  };
  pipelineSummary: Record<string, number>;
  candidats: Array<{
    id: string;
    nom: string;
    prenom: string | null;
    stage: string;
    lastActivity: string | null;
    notes: string | null;
    joursEnProcess: number;
  }>;
  activites: Array<{
    type: string;
    titre: string | null;
    contenu: string | null;
    createdAt: string;
  }>;
  kpis: {
    joursOuvert: number;
    candidatsSources: number;
    tauxEntretien: number;
    tauxOffre: number;
  };
}

// ─── CLIENT REPORT ──────────────────────────────────

export async function getClientReport(clientId: string): Promise<ClientReportData> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      entreprise: {
        select: { nom: true, secteur: true, localisation: true },
      },
    },
  });

  if (!client) throw new NotFoundError('Client', clientId);

  // Get mandats for this client
  const mandats = await prisma.mandat.findMany({
    where: { clientId },
    include: {
      candidatures: {
        select: { id: true, stage: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const mandatData = mandats.map((m) => {
    const candidaturesParStage: Record<string, number> = {};
    for (const c of m.candidatures) {
      candidaturesParStage[c.stage] = (candidaturesParStage[c.stage] ?? 0) + 1;
    }

    return {
      id: m.id,
      titrePoste: m.titrePoste,
      statut: m.statut,
      priorite: m.priorite,
      feeMontantEstime: m.feeMontantEstime,
      dateOuverture: m.dateOuverture.toISOString(),
      dateCloture: m.dateCloture ? m.dateCloture.toISOString() : null,
      candidaturesCount: m.candidatures.length,
      candidaturesParStage,
    };
  });

  // Last 10 activities
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'CLIENT', entiteId: clientId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      type: true,
      titre: true,
      contenu: true,
      createdAt: true,
    },
  });

  // Stats
  const mandatsActifs = mandats.filter((m) =>
    ['OUVERT', 'EN_COURS'].includes(m.statut),
  ).length;

  const allCandidatureIds = mandats.flatMap((m) =>
    m.candidatures.map((c) => c.id),
  );
  const placementsTotal =
    allCandidatureIds.length > 0
      ? await prisma.stageHistory.count({
          where: {
            candidatureId: { in: allCandidatureIds },
            toStage: 'PLACE',
          },
        })
      : 0;

  const feeTotal = mandats.reduce(
    (sum, m) => sum + (m.feeMontantFacture ?? m.feeMontantEstime ?? 0),
    0,
  );

  return {
    client: {
      id: client.id,
      nom: client.nom,
      prenom: client.prenom,
      email: client.email,
      telephone: client.telephone,
      poste: client.poste,
      statutClient: client.statutClient,
      entreprise: client.entreprise,
    },
    mandats: mandatData,
    activites: activites.map((a) => ({
      type: a.type,
      titre: a.titre,
      contenu: a.contenu,
      createdAt: a.createdAt.toISOString(),
    })),
    stats: {
      mandatsTotal: mandats.length,
      mandatsActifs,
      candidaturesTotal: allCandidatureIds.length,
      placementsTotal,
      feeTotal,
    },
  };
}

// ─── MANDAT REPORT ──────────────────────────────────

export async function getMandatReport(mandatId: string): Promise<MandatReportData> {
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    include: {
      entreprise: { select: { nom: true } },
      client: { select: { nom: true, prenom: true, email: true } },
      candidatures: {
        include: {
          candidat: {
            select: { id: true, nom: true, prenom: true },
          },
          stageHistory: {
            orderBy: { changedAt: 'desc' },
            take: 1,
            select: { changedAt: true },
          },
        },
      },
    },
  });

  if (!mandat) throw new NotFoundError('Mandat', mandatId);

  // Pipeline summary
  const pipelineSummary: Record<string, number> = {};
  for (const c of mandat.candidatures) {
    pipelineSummary[c.stage] = (pipelineSummary[c.stage] ?? 0) + 1;
  }

  // Candidat list
  const now = Date.now();
  const candidats = mandat.candidatures.map((c) => {
    const joursEnProcess = Math.floor(
      (now - c.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const lastChange =
      c.stageHistory.length > 0 ? c.stageHistory[0].changedAt : null;

    return {
      id: c.candidat.id,
      nom: c.candidat.nom,
      prenom: c.candidat.prenom,
      stage: c.stage,
      lastActivity: lastChange ? lastChange.toISOString() : null,
      notes: c.notes,
      joursEnProcess,
    };
  });

  // Activities (for the mandat)
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'MANDAT', entiteId: mandatId },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      type: true,
      titre: true,
      contenu: true,
      createdAt: true,
    },
  });

  // KPIs
  const joursOuvert = Math.floor(
    (now - mandat.dateOuverture.getTime()) / (1000 * 60 * 60 * 24),
  );
  const candidatsSources = mandat.candidatures.length;
  const entretiens = mandat.candidatures.filter((c) =>
    ['ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'].includes(c.stage),
  ).length;
  const offres = mandat.candidatures.filter((c) =>
    ['OFFRE', 'PLACE'].includes(c.stage),
  ).length;

  const tauxEntretien =
    candidatsSources > 0 ? Math.round((entretiens / candidatsSources) * 100) : 0;
  const tauxOffre =
    candidatsSources > 0 ? Math.round((offres / candidatsSources) * 100) : 0;

  return {
    mandat: {
      id: mandat.id,
      titrePoste: mandat.titrePoste,
      description: mandat.description,
      statut: mandat.statut,
      priorite: mandat.priorite,
      localisation: mandat.localisation,
      salaireMin: mandat.salaireMin,
      salaireMax: mandat.salaireMax,
      feePourcentage: Number(mandat.feePourcentage),
      feeMontantEstime: mandat.feeMontantEstime,
      feeMontantFacture: mandat.feeMontantFacture,
      feeStatut: mandat.feeStatut,
      dateOuverture: mandat.dateOuverture.toISOString(),
      dateCloture: mandat.dateCloture ? mandat.dateCloture.toISOString() : null,
      entreprise: mandat.entreprise,
      client: mandat.client,
    },
    pipelineSummary,
    candidats,
    activites: activites.map((a) => ({
      type: a.type,
      titre: a.titre,
      contenu: a.contenu,
      createdAt: a.createdAt.toISOString(),
    })),
    kpis: {
      joursOuvert,
      candidatsSources,
      tauxEntretien,
      tauxOffre,
    },
  };
}

// ─── HTML REPORT GENERATION ─────────────────────────

const STAGE_LABELS: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacte',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Place',
  REFUSE: 'Refuse',
};

const STATUT_LABELS: Record<string, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagne',
  PERDU: 'Perdu',
  ANNULE: 'Annule',
  CLOTURE: 'Cloture',
};

const TYPE_LABELS: Record<string, string> = {
  APPEL: 'Appel',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  NOTE: 'Note',
  TACHE: 'Tache',
  TRANSCRIPT: 'Transcript',
};

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(n: number): string {
  return n.toLocaleString('fr-FR') + ' \u20AC';
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── CSS STYLES (shared between reports) ────────────

const REPORT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a2e; line-height: 1.5; }
  @page { size: A4; margin: 20mm 15mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  .report { max-width: 800px; margin: 0 auto; padding: 32px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7C5CFC; padding-bottom: 16px; margin-bottom: 24px; }
  .header-logo { font-size: 24px; font-weight: 800; color: #7C5CFC; }
  .header-logo span { color: #1a1a2e; }
  .header-meta { text-align: right; font-size: 12px; color: #666; }
  .header-title { font-size: 14px; font-weight: 600; color: #1a1a2e; margin-top: 4px; }

  .section { margin-bottom: 28px; }
  .section-title { font-size: 16px; font-weight: 700; color: #1a1a2e; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 12px; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
  .info-label { color: #888; font-weight: 500; }
  .info-value { color: #1a1a2e; font-weight: 600; }

  .kpi-row { display: flex; gap: 16px; margin-bottom: 20px; }
  .kpi-card { flex: 1; background: #f8f8fc; border-radius: 8px; padding: 14px; text-align: center; }
  .kpi-value { font-size: 24px; font-weight: 800; color: #7C5CFC; }
  .kpi-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th { background: #f4f4f8; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; color: #666; border-bottom: 2px solid #e0e0e8; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; }
  tr:hover { background: #f9f9fc; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-blue { background: #EFF6FF; color: #2563EB; }
  .badge-green { background: #ECFDF5; color: #059669; }
  .badge-orange { background: #FFF7ED; color: #D97706; }
  .badge-red { background: #FEF2F2; color: #DC2626; }
  .badge-purple { background: #F5F3FF; color: #7C3AED; }
  .badge-gray { background: #F3F4F6; color: #6B7280; }

  .pipeline-bar { display: flex; gap: 4px; margin: 8px 0; }
  .pipeline-segment { height: 8px; border-radius: 4px; min-width: 4px; }

  .timeline { border-left: 2px solid #e0e0e8; padding-left: 16px; }
  .timeline-item { position: relative; margin-bottom: 14px; font-size: 13px; }
  .timeline-item::before { content: ''; position: absolute; left: -21px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: #7C5CFC; }
  .timeline-date { color: #888; font-size: 11px; }
  .timeline-content { color: #1a1a2e; margin-top: 2px; }

  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; font-size: 11px; color: #aaa; text-align: center; }

  .print-hint { text-align: center; padding: 12px; background: #FFF7ED; border-radius: 8px; font-size: 13px; color: #D97706; margin-bottom: 20px; }
  @media print { .print-hint { display: none; } }
`;

// ─── CLIENT HTML REPORT ─────────────────────────────

export function generateClientReportHtml(data: ClientReportData): string {
  const { client, mandats, activites, stats } = data;
  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const mandatsHtml = mandats
    .map(
      (m) => `
    <tr>
      <td><strong>${escapeHtml(m.titrePoste)}</strong></td>
      <td><span class="badge ${m.statut === 'OUVERT' || m.statut === 'EN_COURS' ? 'badge-green' : m.statut === 'GAGNE' ? 'badge-purple' : 'badge-gray'}">${STATUT_LABELS[m.statut] ?? m.statut}</span></td>
      <td>${m.candidaturesCount}</td>
      <td>${m.feeMontantEstime ? formatCurrency(m.feeMontantEstime) : '-'}</td>
      <td>${formatDate(m.dateOuverture)}</td>
    </tr>`,
    )
    .join('');

  const pipelineHtml = mandats
    .filter((m) => ['OUVERT', 'EN_COURS'].includes(m.statut))
    .map((m) => {
      const stages = Object.entries(m.candidaturesParStage)
        .map(
          ([stage, count]) =>
            `<span class="badge badge-blue" style="margin-right:4px">${STAGE_LABELS[stage] ?? stage}: ${count}</span>`,
        )
        .join('');
      return `<div style="margin-bottom:8px"><strong>${escapeHtml(m.titrePoste)}</strong><br/>${stages || '<span class="badge badge-gray">Aucun candidat</span>'}</div>`;
    })
    .join('');

  const timelineHtml = activites
    .map(
      (a) => `
    <div class="timeline-item">
      <span class="timeline-date">${formatDate(a.createdAt)} &middot; ${TYPE_LABELS[a.type] ?? a.type}</span>
      <div class="timeline-content">${escapeHtml(a.titre) || escapeHtml(a.contenu) || '-'}</div>
    </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport Client - ${escapeHtml(client.prenom)} ${escapeHtml(client.nom)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="report">
    <div class="print-hint">Appuyez sur Ctrl+P (ou Cmd+P sur Mac) pour imprimer ou sauvegarder en PDF</div>

    <div class="header">
      <div>
        <div class="header-logo">Human<span>Up</span></div>
      </div>
      <div class="header-meta">
        <div>${today}</div>
        <div class="header-title">Rapport d'avancement Client</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Informations client</h2>
      <div class="info-grid">
        <div><span class="info-label">Nom</span></div>
        <div><span class="info-value">${escapeHtml(client.prenom)} ${escapeHtml(client.nom)}</span></div>
        <div><span class="info-label">Entreprise</span></div>
        <div><span class="info-value">${escapeHtml(client.entreprise.nom)}</span></div>
        <div><span class="info-label">Poste</span></div>
        <div><span class="info-value">${escapeHtml(client.poste) || '-'}</span></div>
        <div><span class="info-label">Email</span></div>
        <div><span class="info-value">${escapeHtml(client.email) || '-'}</span></div>
        <div><span class="info-label">Telephone</span></div>
        <div><span class="info-value">${escapeHtml(client.telephone) || '-'}</span></div>
        <div><span class="info-label">Statut</span></div>
        <div><span class="badge badge-purple">${escapeHtml(client.statutClient)}</span></div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Statistiques</h2>
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-value">${stats.mandatsTotal}</div>
          <div class="kpi-label">Mandats total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${stats.mandatsActifs}</div>
          <div class="kpi-label">Mandats actifs</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${stats.candidaturesTotal}</div>
          <div class="kpi-label">Candidatures</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${stats.placementsTotal}</div>
          <div class="kpi-label">Placements</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${formatCurrency(stats.feeTotal)}</div>
          <div class="kpi-label">Fees total</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Mandats</h2>
      <table>
        <thead>
          <tr>
            <th>Poste</th>
            <th>Statut</th>
            <th>Candidatures</th>
            <th>Fee estime</th>
            <th>Date ouverture</th>
          </tr>
        </thead>
        <tbody>
          ${mandatsHtml || '<tr><td colspan="5" style="text-align:center;color:#888">Aucun mandat</td></tr>'}
        </tbody>
      </table>
    </div>

    ${pipelineHtml ? `
    <div class="section">
      <h2 class="section-title">Pipeline des mandats actifs</h2>
      ${pipelineHtml}
    </div>
    ` : ''}

    <div class="section">
      <h2 class="section-title">Activite recente</h2>
      <div class="timeline">
        ${timelineHtml || '<p style="color:#888">Aucune activite</p>'}
      </div>
    </div>

    <div class="footer">
      Rapport genere par HumanUp ATS &middot; ${today}
    </div>
  </div>
</body>
</html>`;
}

// ─── MANDAT HTML REPORT ─────────────────────────────

export function generateMandatReportHtml(data: MandatReportData): string {
  const { mandat, pipelineSummary, candidats, activites, kpis } = data;
  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const stageOrder = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE'];
  const stageColors: Record<string, string> = {
    SOURCING: '#93C5FD',
    CONTACTE: '#6EE7B7',
    ENTRETIEN_1: '#FCD34D',
    ENTRETIEN_CLIENT: '#FDBA74',
    OFFRE: '#C4B5FD',
    PLACE: '#34D399',
    REFUSE: '#FCA5A5',
  };

  const totalCandidats = Object.values(pipelineSummary).reduce((a, b) => a + b, 0);

  const pipelineBarHtml = stageOrder
    .filter((s) => pipelineSummary[s])
    .map((s) => {
      const pct = totalCandidats > 0 ? (pipelineSummary[s] / totalCandidats) * 100 : 0;
      return `<div class="pipeline-segment" style="width:${Math.max(pct, 3)}%;background:${stageColors[s] ?? '#ccc'}" title="${STAGE_LABELS[s] ?? s}: ${pipelineSummary[s]}"></div>`;
    })
    .join('');

  const pipelineLegendHtml = stageOrder
    .filter((s) => pipelineSummary[s])
    .map(
      (s) =>
        `<span class="badge" style="background:${stageColors[s] ?? '#eee'};color:#333;margin-right:6px">${STAGE_LABELS[s] ?? s}: ${pipelineSummary[s]}</span>`,
    )
    .join('');

  const candidatsHtml = candidats
    .map(
      (c) => `
    <tr>
      <td>${escapeHtml(c.prenom)} ${escapeHtml(c.nom)}</td>
      <td><span class="badge badge-blue">${STAGE_LABELS[c.stage] ?? c.stage}</span></td>
      <td>${c.lastActivity ? formatDate(c.lastActivity) : '-'}</td>
      <td>${c.joursEnProcess}j</td>
      <td>${escapeHtml(c.notes)?.substring(0, 60) || '-'}</td>
    </tr>`,
    )
    .join('');

  const timelineHtml = activites
    .map(
      (a) => `
    <div class="timeline-item">
      <span class="timeline-date">${formatDate(a.createdAt)} &middot; ${TYPE_LABELS[a.type] ?? a.type}</span>
      <div class="timeline-content">${escapeHtml(a.titre) || escapeHtml(a.contenu) || '-'}</div>
    </div>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rapport Mandat - ${escapeHtml(mandat.titrePoste)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="report">
    <div class="print-hint">Appuyez sur Ctrl+P (ou Cmd+P sur Mac) pour imprimer ou sauvegarder en PDF</div>

    <div class="header">
      <div>
        <div class="header-logo">Human<span>Up</span></div>
      </div>
      <div class="header-meta">
        <div>${today}</div>
        <div class="header-title">Rapport de Mandat</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Informations mandat</h2>
      <div class="info-grid">
        <div><span class="info-label">Poste</span></div>
        <div><span class="info-value">${escapeHtml(mandat.titrePoste)}</span></div>
        <div><span class="info-label">Entreprise</span></div>
        <div><span class="info-value">${escapeHtml(mandat.entreprise.nom)}</span></div>
        <div><span class="info-label">Client</span></div>
        <div><span class="info-value">${escapeHtml(mandat.client.prenom)} ${escapeHtml(mandat.client.nom)}</span></div>
        <div><span class="info-label">Statut</span></div>
        <div><span class="badge ${mandat.statut === 'OUVERT' || mandat.statut === 'EN_COURS' ? 'badge-green' : 'badge-gray'}">${STATUT_LABELS[mandat.statut] ?? mandat.statut}</span></div>
        <div><span class="info-label">Priorite</span></div>
        <div><span class="info-value">${escapeHtml(mandat.priorite)}</span></div>
        <div><span class="info-label">Localisation</span></div>
        <div><span class="info-value">${escapeHtml(mandat.localisation) || '-'}</span></div>
        <div><span class="info-label">Salaire</span></div>
        <div><span class="info-value">${mandat.salaireMin ? formatCurrency(mandat.salaireMin) : '-'} - ${mandat.salaireMax ? formatCurrency(mandat.salaireMax) : '-'}</span></div>
        <div><span class="info-label">Fee</span></div>
        <div><span class="info-value">${mandat.feePourcentage}% ${mandat.feeMontantEstime ? '(' + formatCurrency(mandat.feeMontantEstime) + ' estime)' : ''}</span></div>
        <div><span class="info-label">Date ouverture</span></div>
        <div><span class="info-value">${formatDate(mandat.dateOuverture)}</span></div>
        ${mandat.dateCloture ? `
        <div><span class="info-label">Date cloture</span></div>
        <div><span class="info-value">${formatDate(mandat.dateCloture)}</span></div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">KPIs</h2>
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-value">${kpis.joursOuvert}</div>
          <div class="kpi-label">Jours ouvert</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${kpis.candidatsSources}</div>
          <div class="kpi-label">Candidats sources</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${kpis.tauxEntretien}%</div>
          <div class="kpi-label">Taux entretien</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">${kpis.tauxOffre}%</div>
          <div class="kpi-label">Taux offre</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Pipeline candidats</h2>
      <div class="pipeline-bar">${pipelineBarHtml}</div>
      <div style="margin-top:8px">${pipelineLegendHtml || '<span class="badge badge-gray">Aucun candidat</span>'}</div>
    </div>

    <div class="section">
      <h2 class="section-title">Candidats (${candidats.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Candidat</th>
            <th>Stage</th>
            <th>Derniere activite</th>
            <th>Jours en process</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${candidatsHtml || '<tr><td colspan="5" style="text-align:center;color:#888">Aucun candidat</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2 class="section-title">Activite recente</h2>
      <div class="timeline">
        ${timelineHtml || '<p style="color:#888">Aucune activite</p>'}
      </div>
    </div>

    <div class="footer">
      Rapport genere par HumanUp ATS &middot; ${today}
    </div>
  </div>
</body>
</html>`;
}
