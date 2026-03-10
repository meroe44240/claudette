import prisma from '../../lib/db.js';

interface ForecastEntry {
  month: string; // "2026-03"
  confirmed: number; // revenue from PLACE candidatures
  projected: number; // revenue from OFFRE/ENTRETIEN_CLIENT
  pipeline: number; // potential from earlier stages
}

export async function getRevenueForecast(months = 6): Promise<{ forecast: ForecastEntry[]; summary: { totalConfirmed: number; totalProjected: number; totalPipeline: number } }> {
  const now = new Date();
  const entries: ForecastEntry[] = [];

  // Get all active mandats with their candidatures and salary info
  const mandats = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: {
      id: true,
      salaireMin: true,
      salaireMax: true,
      feePourcentage: true,
      candidatures: {
        select: { stage: true, updatedAt: true },
      },
    },
  });

  // Get completed placements for past months
  const placedCandidatures = await prisma.candidature.findMany({
    where: {
      stage: 'PLACE',
      updatedAt: { gte: new Date(now.getFullYear(), now.getMonth() - 3, 1) },
    },
    select: {
      updatedAt: true,
      mandat: { select: { salaireMin: true, salaireMax: true, feePourcentage: true } },
    },
  });

  const avgFee = 15000; // Default average fee per placement in EUR
  const stageWeights: Record<string, number> = {
    OFFRE: 0.8,
    ENTRETIEN_CLIENT: 0.5,
    ENTRETIEN_1: 0.15,
    CONTACTE: 0.05,
    SOURCING: 0.02,
  };

  // Build month-by-month forecast
  for (let i = 0; i < months; i++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

    let confirmed = 0;
    let projected = 0;
    let pipeline = 0;

    // Count placed in this month (confirmed revenue)
    for (const p of placedCandidatures) {
      const pMonth = `${p.updatedAt.getFullYear()}-${String(p.updatedAt.getMonth() + 1).padStart(2, '0')}`;
      if (pMonth === monthStr) {
        const salary = p.mandat.salaireMax || p.mandat.salaireMin || 0;
        const feeRate = p.mandat.feePourcentage ? Number(p.mandat.feePourcentage) / 100 : 0.2;
        confirmed += salary ? salary * feeRate : avgFee;
      }
    }

    // For future months, calculate projected from current pipeline
    if (i > 0 || now.getDate() < 15) {
      for (const mandat of mandats) {
        const salary = mandat.salaireMax || mandat.salaireMin || 0;
        const feeRate = mandat.feePourcentage ? Number(mandat.feePourcentage) / 100 : 0.2;
        const fee = salary ? salary * feeRate : avgFee;

        for (const c of mandat.candidatures) {
          const weight = stageWeights[c.stage] || 0;
          if (weight >= 0.5) {
            projected += fee * weight / months; // Spread across forecast period
          } else if (weight > 0) {
            pipeline += fee * weight / months;
          }
        }
      }
    }

    entries.push({ month: monthStr, confirmed, projected: Math.round(projected), pipeline: Math.round(pipeline) });
  }

  const summary = {
    totalConfirmed: entries.reduce((s, e) => s + e.confirmed, 0),
    totalProjected: entries.reduce((s, e) => s + e.projected, 0),
    totalPipeline: entries.reduce((s, e) => s + e.pipeline, 0),
  };

  return { forecast: entries, summary };
}
