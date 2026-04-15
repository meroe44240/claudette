/**
 * Centralized Activity Logger
 *
 * Provides fire-and-forget helpers to create Activite records
 * across the codebase. Never throws — errors are caught and logged.
 */

import prisma from './db.js';
import type { TypeActivite, Direction, EntiteType, SourceActivite, Prisma } from '@prisma/client';

// ─── TYPES ──────────────────────────────────────────

export interface LogActivityParams {
  type: TypeActivite;
  entiteType: EntiteType;
  entiteId: string;
  userId: string;
  titre: string;
  contenu?: string;
  source?: SourceActivite;
  direction?: Direction;
  metadata?: Prisma.InputJsonValue;
}

export interface LogActivityMultiParams {
  type: TypeActivite;
  entities: Array<{ entiteType: EntiteType; entiteId: string }>;
  userId: string;
  titre: string;
  contenu?: string;
  source?: SourceActivite;
  direction?: Direction;
  metadata?: Prisma.InputJsonValue;
}

// ─── SINGLE ENTITY ─────────────────────────────────

/**
 * Create a single Activite record. Never throws.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activite.create({
      data: {
        type: params.type,
        entiteType: params.entiteType,
        entiteId: params.entiteId,
        userId: params.userId,
        titre: params.titre,
        contenu: params.contenu ?? null,
        source: params.source ?? 'SYSTEME',
        direction: params.direction ?? null,
        metadata: params.metadata ?? {},
      },
    });
  } catch (error) {
    console.error('[activity-logger] Failed to log activity:', error);
  }
}

// ─── MULTIPLE ENTITIES ─────────────────────────────

/**
 * Create one Activite record per entity. Never throws.
 * Useful when a single event affects multiple entities
 * (e.g. a push affects candidat + client + entreprise).
 */
export async function logActivityMulti(params: LogActivityMultiParams): Promise<void> {
  try {
    const records = params.entities.map((entity) => ({
      type: params.type,
      entiteType: entity.entiteType,
      entiteId: entity.entiteId,
      userId: params.userId,
      titre: params.titre,
      contenu: params.contenu ?? null,
      source: params.source ?? 'SYSTEME',
      direction: params.direction ?? null,
      metadata: params.metadata ?? {},
    }));

    await prisma.activite.createMany({ data: records });
  } catch (error) {
    console.error('[activity-logger] Failed to log multi-entity activity:', error);
  }
}
