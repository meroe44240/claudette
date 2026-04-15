/**
 * Batch Enrichment Job
 *
 * Runs weekly (Sunday 02:00 UTC) to fill in missing data:
 *  1. Entreprises without Pappers data  → enrichEntreprise()
 *  2. Candidats with CV but no AI pitch → re-parse CV
 */

import prisma from '../lib/db.js';
import { logActivity } from '../lib/activity-logger.js';

// ─── CONFIG ────────────────────────────────────────

/** Maximum enterprises to enrich per run (avoid blowing Pappers quota). */
const MAX_ENTREPRISE_BATCH = 20;

/** Maximum candidates to re-parse per run (avoid long-running jobs). */
const MAX_CANDIDAT_BATCH = 10;

// ─── 1. ENTREPRISES SANS PAPPERS ────────────────────

async function enrichEntreprisesBatch(): Promise<{ enriched: number; failed: number }> {
  let enriched = 0;
  let failed = 0;

  try {
    // Find companies with no SIREN and never enriched
    const companies = await prisma.entreprise.findMany({
      where: {
        siren: null,
        pappersEnrichedAt: null,
      },
      select: { id: true, nom: true, createdById: true },
      take: MAX_ENTREPRISE_BATCH,
      orderBy: { createdAt: 'asc' },
    });

    if (companies.length === 0) {
      console.log('[enrich-batch] No unenriched entreprises found');
      return { enriched: 0, failed: 0 };
    }

    console.log(`[enrich-batch] Found ${companies.length} entreprises to enrich via Pappers`);

    const { enrichEntreprise } = await import(
      '../modules/integrations/pappers.service.js'
    );

    for (const company of companies) {
      try {
        const result = await enrichEntreprise(company.id);

        if (result.success && result.fieldsUpdated.length > 0) {
          enriched++;

          // Log activity on the enriched company
          if (company.createdById) {
            logActivity({
              type: 'NOTE',
              entiteType: 'ENTREPRISE',
              entiteId: company.id,
              userId: company.createdById,
              titre: `Données Pappers mises à jour (batch)`,
              contenu: `Champs enrichis : ${result.fieldsUpdated.join(', ')}`,
              source: 'SYSTEME',
              metadata: {
                batchEnrich: true,
                fieldsUpdated: result.fieldsUpdated,
              },
            }).catch(() => {});
          }
        }
      } catch (err: any) {
        failed++;
        console.warn(`[enrich-batch] Pappers enrichment failed for "${company.nom}":`, err.message);
      }
    }
  } catch (error) {
    console.error('[enrich-batch] Error in entreprise batch enrichment:', error);
  }

  return { enriched, failed };
}

// ─── 2. CANDIDATS SANS CV PARSÉ ────────────────────

async function reparseCandidatCvs(): Promise<{ parsed: number; failed: number }> {
  let parsed = 0;
  let failed = 0;

  try {
    // Candidates that have a CV uploaded but no AI pitch
    const candidates = await prisma.candidat.findMany({
      where: {
        aiPitchShort: null,
        cvUrl: { not: null },
      },
      select: { id: true, nom: true, prenom: true, cvUrl: true, createdById: true },
      take: MAX_CANDIDAT_BATCH,
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      console.log('[enrich-batch] No candidates with unparsed CVs found');
      return { parsed: 0, failed: 0 };
    }

    console.log(`[enrich-batch] Found ${candidates.length} candidats with CVs to re-parse`);

    const { updateCandidatFromCv } = await import(
      '../modules/ai/cv-parsing.service.js'
    );

    for (const candidat of candidates) {
      if (!candidat.cvUrl) continue;

      try {
        // Download the CV file
        const response = await fetch(candidat.cvUrl);
        if (!response.ok) {
          console.warn(`[enrich-batch] Could not download CV for ${candidat.prenom} ${candidat.nom}: HTTP ${response.status}`);
          failed++;
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const filename = candidat.cvUrl.split('/').pop() || 'cv.pdf';
        const userId = candidat.createdById || '';

        if (!userId) {
          console.warn(`[enrich-batch] No createdById for candidat ${candidat.id}, skipping`);
          failed++;
          continue;
        }

        await updateCandidatFromCv(buffer, filename, userId, candidat.id);
        parsed++;

        // Log activity
        logActivity({
          type: 'NOTE',
          entiteType: 'CANDIDAT',
          entiteId: candidat.id,
          userId,
          titre: 'CV re-parsé automatiquement (batch)',
          source: 'SYSTEME',
          metadata: { batchCvReparse: true },
        }).catch(() => {});
      } catch (err: any) {
        failed++;
        console.warn(`[enrich-batch] CV re-parse failed for ${candidat.prenom} ${candidat.nom}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[enrich-batch] Error in candidat CV re-parse:', error);
  }

  return { parsed, failed };
}

// ─── PUBLIC ENTRY POINT ────────────────────────────

export async function runBatchEnrichment(): Promise<void> {
  console.log('[enrich-batch] Starting weekly batch enrichment...');
  const start = Date.now();

  const entrepriseResult = await enrichEntreprisesBatch();
  const candidatResult = await reparseCandidatCvs();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(
    `[enrich-batch] Completed in ${elapsed}s — ` +
    `Entreprises: ${entrepriseResult.enriched} enriched / ${entrepriseResult.failed} failed — ` +
    `Candidats: ${candidatResult.parsed} parsed / ${candidatResult.failed} failed`,
  );
}
