/**
 * Job Board service — logique métier complète pour le job board public.
 *
 * Gère :
 * - CRUD des offres (JobPosting)
 * - Publication / Dépublication / Archivage
 * - Traitement des candidatures (dedup, création candidat, pipeline, CV parsing)
 * - Candidature spontanée
 * - Shortlist / Reject avec envoi d'emails
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../../lib/db.js';
import { parseCv } from '../ai/cv-parsing.service.js';
import * as notificationService from '../notifications/notification.service.js';
import { paginationToSkipTake, paginatedResult, type PaginationParams } from '../../lib/pagination.js';
import { Prisma, type JobPostingStatus } from '@prisma/client';

// ─── HELPERS ────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

async function generateUniqueSlug(title: string): Promise<string> {
  let slug = slugify(title);
  const existing = await prisma.jobPosting.findUnique({ where: { slug } });
  if (existing) {
    slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
  }
  return slug;
}

async function saveCvFile(buffer: Buffer, filename: string): Promise<string> {
  const uuid = crypto.randomUUID();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dir = path.join(process.cwd(), 'uploads', 'cv-applications');
  await fs.mkdir(dir, { recursive: true });
  const filePath = `${uuid}-${safeName}`;
  await fs.writeFile(path.join(dir, filePath), buffer);
  return `/uploads/cv-applications/${filePath}`;
}

/**
 * Find or create a default "Candidatures Job Board" mandat.
 * This ensures all job board applications land in a pipeline even if
 * the job posting isn't linked to a specific mandat.
 */
async function getOrCreateDefaultJobBoardMandat(userId?: string | null): Promise<string | null> {
  const DEFAULT_MANDAT_TITLE = 'Candidatures Job Board';
  const DEFAULT_ENTREPRISE_NAME = 'HumanUp (Interne)';

  try {
    // Check if default mandat already exists
    const existing = await prisma.mandat.findFirst({
      where: { titrePoste: DEFAULT_MANDAT_TITLE, statut: 'OUVERT' },
      select: { id: true },
    });

    if (existing) return existing.id;

    // Find or create default enterprise
    let entreprise = await prisma.entreprise.findFirst({
      where: { nom: DEFAULT_ENTREPRISE_NAME },
      select: { id: true },
    });

    if (!entreprise) {
      entreprise = await prisma.entreprise.create({
        data: {
          nom: DEFAULT_ENTREPRISE_NAME,
          secteur: 'Recrutement',
          createdById: userId || undefined,
        },
      });
    }

    // Find or create default client
    let client = await prisma.client.findFirst({
      where: { entrepriseId: entreprise.id },
      select: { id: true },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          nom: 'Job Board',
          prenom: 'HumanUp',
          entrepriseId: entreprise.id,
          poste: 'Recrutement interne',
          createdById: userId || undefined,
        },
      });
    }

    // Create the default mandat
    const mandat = await prisma.mandat.create({
      data: {
        titrePoste: DEFAULT_MANDAT_TITLE,
        entrepriseId: entreprise.id,
        clientId: client.id,
        description: 'Mandat par defaut pour regrouper toutes les candidatures du Job Board sans mandat specifique.',
        slug: 'candidatures-job-board',
        createdById: userId || undefined,
        assignedToId: userId || undefined,
      },
    });

    return mandat.id;
  } catch (err: any) {
    console.error('[JobBoard] Failed to create default mandat:', err.message);
    return null;
  }
}

// ─── CREATE / UPDATE ────────────────────────────────

export async function create(
  data: {
    title: string;
    mandatId?: string;
    companyDescription?: string;
    location?: string;
    salaryRange?: string;
    description?: string;
    tags?: string[];
    jobType?: string;
    sector?: string;
    visibility?: 'PUBLIC' | 'PRIVATE_LINK';
    isUrgent?: boolean;
    assignedToId?: string;
  },
  createdById: string,
) {
  let prefilled: Partial<typeof data> = {};

  // If linked to a mandat, pre-fill from mandat data (anonymized)
  if (data.mandatId) {
    const mandat = await prisma.mandat.findUnique({
      where: { id: data.mandatId },
      include: { entreprise: true },
    });

    if (mandat) {
      const entreprise = mandat.entreprise;
      const tailleTxt = entreprise.taille
        ? { STARTUP: 'Startup', PME: 'PME', ETI: 'ETI', GRAND_GROUPE: 'Grand Groupe' }[entreprise.taille]
        : '';
      const secteurTxt = entreprise.secteur || '';

      prefilled = {
        title: data.title || mandat.titrePoste,
        location: data.location || mandat.localisation || undefined,
        salaryRange: data.salaryRange || mandat.salaryRange || (mandat.salaireMin && mandat.salaireMax ? `${mandat.salaireMin / 1000}-${mandat.salaireMax / 1000}k€` : undefined),
        companyDescription: data.companyDescription || [tailleTxt, secteurTxt].filter(Boolean).join(' · ') || undefined,
        assignedToId: data.assignedToId || mandat.assignedToId || undefined,
      };
    }
  }

  const slug = await generateUniqueSlug(data.title || prefilled.title || 'offre');

  return prisma.jobPosting.create({
    data: {
      title: data.title || prefilled.title || 'Nouvelle offre',
      slug,
      mandatId: data.mandatId || undefined,
      companyDescription: data.companyDescription ?? prefilled.companyDescription ?? undefined,
      location: data.location ?? prefilled.location ?? undefined,
      salaryRange: data.salaryRange ?? prefilled.salaryRange ?? undefined,
      description: data.description || undefined,
      tags: data.tags || [],
      jobType: data.jobType || undefined,
      sector: data.sector || undefined,
      visibility: data.visibility || 'PUBLIC',
      isUrgent: data.isUrgent || false,
      assignedToId: data.assignedToId ?? prefilled.assignedToId ?? createdById,
      createdById,
    },
  });
}

export async function update(
  id: string,
  data: {
    title?: string;
    companyDescription?: string;
    location?: string;
    salaryRange?: string;
    description?: string;
    tags?: string[];
    jobType?: string;
    sector?: string;
    visibility?: 'PUBLIC' | 'PRIVATE_LINK';
    isUrgent?: boolean;
    assignedToId?: string;
  },
) {
  // Regenerate slug if title changes
  const updateData: Prisma.JobPostingUpdateInput = { ...data };

  if (data.title) {
    const current = await prisma.jobPosting.findUnique({ where: { id } });
    if (current && current.title !== data.title) {
      updateData.slug = await generateUniqueSlug(data.title);
    }
  }

  return prisma.jobPosting.update({
    where: { id },
    data: updateData,
  });
}

// ─── PUBLISH / UNPUBLISH / ARCHIVE ──────────────────

export async function publish(id: string) {
  return prisma.jobPosting.update({
    where: { id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
}

export async function unpublish(id: string) {
  return prisma.jobPosting.update({
    where: { id },
    data: { status: 'DRAFT' },
  });
}

export async function archive(id: string) {
  return prisma.jobPosting.update({
    where: { id },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
}

// ─── LIST / GET ─────────────────────────────────────

export async function listAll(
  filters: { status?: JobPostingStatus; search?: string },
  pagination: PaginationParams,
) {
  const where: Prisma.JobPostingWhereInput = {};

  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { companyDescription: { contains: filters.search, mode: 'insensitive' } },
      { location: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = paginationToSkipTake(pagination);
  const [data, total] = await Promise.all([
    prisma.jobPosting.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        mandat: { select: { id: true, titrePoste: true, client: { select: { nom: true } }, entreprise: { select: { nom: true } } } },
        _count: { select: { applications: true } },
      },
    }),
    prisma.jobPosting.count({ where }),
  ]);

  return paginatedResult(data, total, pagination);
}

export async function listPublished(
  filters: { search?: string; sector?: string; location?: string; jobType?: string; salaryMin?: number },
  pagination: PaginationParams,
) {
  const where: Prisma.JobPostingWhereInput = {
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
  };

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { companyDescription: { contains: filters.search, mode: 'insensitive' } },
      { location: { contains: filters.search, mode: 'insensitive' } },
      { tags: { hasSome: [filters.search] } },
    ];
  }
  if (filters.sector) where.sector = filters.sector;
  if (filters.location) where.location = { contains: filters.location, mode: 'insensitive' };
  if (filters.jobType) where.jobType = filters.jobType;

  const { skip, take } = paginationToSkipTake(pagination);
  const [data, total] = await Promise.all([
    prisma.jobPosting.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        companyDescription: true,
        location: true,
        salaryRange: true,
        tags: true,
        jobType: true,
        sector: true,
        isUrgent: true,
        publishedAt: true,
        applicationCount: true,
      },
    }),
    prisma.jobPosting.count({ where }),
  ]);

  return paginatedResult(data, total, pagination);
}

export async function getBySlug(slug: string) {
  const job = await prisma.jobPosting.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      companyDescription: true,
      location: true,
      salaryRange: true,
      description: true,
      tags: true,
      jobType: true,
      sector: true,
      isUrgent: true,
      publishedAt: true,
      applicationCount: true,
    },
  });

  if (!job || (await prisma.jobPosting.findUnique({ where: { slug } }))?.status !== 'PUBLISHED') {
    return null;
  }

  // Get similar jobs (same sector or location, max 3)
  const similar = await prisma.jobPosting.findMany({
    where: {
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      id: { not: job.id },
      OR: [
        job.sector ? { sector: job.sector } : {},
        job.location ? { location: { contains: job.location.split(',')[0]?.trim() || '', mode: 'insensitive' as Prisma.QueryMode } } : {},
      ].filter((o) => Object.keys(o).length > 0),
    },
    take: 3,
    orderBy: { publishedAt: 'desc' },
    select: {
      slug: true,
      title: true,
      companyDescription: true,
      location: true,
      salaryRange: true,
      isUrgent: true,
      publishedAt: true,
    },
  });

  return { ...job, similarJobs: similar };
}

export async function getById(id: string) {
  return prisma.jobPosting.findUnique({
    where: { id },
    include: {
      mandat: {
        select: {
          id: true,
          titrePoste: true,
          description: true,
          localisation: true,
          salaireMin: true,
          salaireMax: true,
          salaryRange: true,
          pitchPoints: true,
          entreprise: { select: { nom: true, secteur: true, taille: true } },
          client: { select: { nom: true } },
        },
      },
      assignedTo: { select: { id: true, nom: true, prenom: true } },
      _count: { select: { applications: true } },
    },
  });
}

export async function incrementViewCount(id: string) {
  await prisma.jobPosting.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  });
}

// ─── SECTORS LIST (for filters) ─────────────────────

export async function listSectors() {
  const jobs = await prisma.jobPosting.findMany({
    where: { status: 'PUBLISHED', visibility: 'PUBLIC', sector: { not: null } },
    select: { sector: true },
  });

  const countMap: Record<string, number> = {};
  for (const j of jobs) {
    if (j.sector) countMap[j.sector] = (countMap[j.sector] || 0) + 1;
  }

  return Object.entries(countMap)
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count);
}

// ─── APPLICATION PROCESSING ─────────────────────────

export async function processApplication(
  slug: string,
  fields: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    linkedinUrl?: string;
    salaryCurrent?: string;
    currentCompany?: string;
    availability?: string;
  },
  cvBuffer?: Buffer | null,
  cvFilename?: string,
) {
  const jobPosting = await prisma.jobPosting.findUnique({
    where: { slug },
    include: { mandat: true },
  });

  if (!jobPosting || jobPosting.status !== 'PUBLISHED') {
    throw new Error('Offre introuvable ou non publiee');
  }

  const assignedToId = jobPosting.assignedToId || jobPosting.createdById;
  const email = fields.email.toLowerCase().trim();

  // 1. Save CV file
  let cvFileUrl: string | undefined;
  if (cvBuffer && cvFilename) {
    cvFileUrl = await saveCvFile(cvBuffer, cvFilename);
  }

  // 2. Dedup candidat by email
  const existingCandidat = await prisma.candidat.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  let candidatId: string;

  if (existingCandidat) {
    candidatId = existingCandidat.id;
    // Update fields if not set
    await prisma.candidat.update({
      where: { id: existingCandidat.id },
      data: {
        telephone: existingCandidat.telephone || fields.phone || undefined,
        entrepriseActuelle: existingCandidat.entrepriseActuelle || fields.currentCompany || undefined,
        linkedinUrl: fields.linkedinUrl || existingCandidat.linkedinUrl || undefined,
        cvUrl: cvFileUrl || existingCandidat.cvUrl || undefined,
      },
    });
  } else {
    const newCandidat = await prisma.candidat.create({
      data: {
        nom: fields.lastName,
        prenom: fields.firstName,
        email,
        telephone: fields.phone || undefined,
        linkedinUrl: fields.linkedinUrl || undefined,
        entrepriseActuelle: fields.currentCompany || undefined,
        salaireActuel: fields.salaryCurrent ? parseInt(fields.salaryCurrent.replace(/\D/g, ''), 10) || undefined : undefined,
        disponibilite: fields.availability || undefined,
        cvUrl: cvFileUrl || undefined,
        source: 'JOB_BOARD',
        createdById: assignedToId || undefined,
      },
    });
    candidatId = newCandidat.id;
  }

  // 3. Create candidature — use linked mandat or find/create default "Candidatures Job Board"
  let targetMandatId = jobPosting.mandatId;

  if (!targetMandatId) {
    // Find or create default mandat for job board applications
    targetMandatId = await getOrCreateDefaultJobBoardMandat(assignedToId);
  }

  if (targetMandatId) {
    const existingCandidature = await prisma.candidature.findUnique({
      where: { mandatId_candidatId: { mandatId: targetMandatId, candidatId } },
    });

    if (!existingCandidature) {
      const candidature = await prisma.candidature.create({
        data: {
          mandatId: targetMandatId,
          candidatId,
          stage: 'SOURCING',
          createdById: assignedToId || undefined,
        },
      });

      await prisma.stageHistory.create({
        data: {
          candidatureId: candidature.id,
          fromStage: null,
          toStage: 'SOURCING',
          changedById: assignedToId || undefined,
        },
      });
    }
  }

  // 4. CV parsing async (non-blocking)
  if (cvBuffer && cvFilename && assignedToId) {
    parseCv(cvBuffer, cvFilename, assignedToId)
      .then(async (parsed: any) => {
        if (parsed?.candidate) {
          const c = parsed.candidate;
          await prisma.candidat.update({
            where: { id: candidatId },
            data: {
              posteActuel: c.current_title || undefined,
              entrepriseActuelle: c.current_company || undefined,
              localisation: c.city || undefined,
              linkedinUrl: c.linkedin_url || undefined,
              aiPitchShort: parsed.pitchShort || undefined,
              aiPitchLong: parsed.pitchLong || undefined,
              aiSellingPoints: parsed.sellingPoints || undefined,
              aiIdealFor: parsed.idealFor || undefined,
              aiAnonymizedProfile: parsed.anonymizedProfile || undefined,
              aiParsedAt: new Date(),
            },
          });
        }
      })
      .catch((err: Error) => {
        console.error(`[JobBoard] CV parsing failed for candidat ${candidatId}:`, err.message);
      });
  }

  // 5. Create JobApplication record
  const application = await prisma.jobApplication.create({
    data: {
      jobPostingId: jobPosting.id,
      candidatId,
      firstName: fields.firstName,
      lastName: fields.lastName,
      email,
      phone: fields.phone || undefined,
      salaryCurrent: fields.salaryCurrent || undefined,
      currentCompany: fields.currentCompany || undefined,
      availability: fields.availability || undefined,
      cvFileUrl,
      source: 'job_board',
    },
  });

  // 6. Increment application count
  await prisma.jobPosting.update({
    where: { id: jobPosting.id },
    data: { applicationCount: { increment: 1 } },
  });

  // 7. Notification to assigned recruiter
  if (assignedToId) {
    await notificationService.create({
      userId: assignedToId,
      type: 'JOB_APPLICATION_NEW',
      titre: `📩 Nouvelle candidature — ${jobPosting.title}`,
      contenu: `${fields.firstName} ${fields.lastName} a postulé sur l'offre "${jobPosting.title}"`,
      entiteType: 'CANDIDAT',
      entiteId: candidatId,
    });
  }

  return { applicationId: application.id, candidatId };
}

// ─── SPONTANEOUS APPLICATION ────────────────────────

export async function processSpontaneous(
  fields: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    linkedinUrl?: string;
    salaryCurrent?: string;
    currentCompany?: string;
    availability?: string;
    jobTypeSought?: string;
  },
  cvBuffer?: Buffer | null,
  cvFilename?: string,
) {
  const email = fields.email.toLowerCase().trim();

  // Save CV
  let cvFileUrl: string | undefined;
  if (cvBuffer && cvFilename) {
    cvFileUrl = await saveCvFile(cvBuffer, cvFilename);
  }

  // Dedup
  const existingCandidat = await prisma.candidat.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  let candidatId: string;
  // Get first admin/recruiter for assignment
  const defaultUser = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const assignedToId = defaultUser?.id;

  if (existingCandidat) {
    candidatId = existingCandidat.id;
    await prisma.candidat.update({
      where: { id: existingCandidat.id },
      data: {
        telephone: existingCandidat.telephone || fields.phone || undefined,
        entrepriseActuelle: existingCandidat.entrepriseActuelle || fields.currentCompany || undefined,
        linkedinUrl: fields.linkedinUrl || existingCandidat.linkedinUrl || undefined,
        cvUrl: cvFileUrl || existingCandidat.cvUrl || undefined,
      },
    });
  } else {
    const newCandidat = await prisma.candidat.create({
      data: {
        nom: fields.lastName,
        prenom: fields.firstName,
        email,
        telephone: fields.phone || undefined,
        linkedinUrl: fields.linkedinUrl || undefined,
        entrepriseActuelle: fields.currentCompany || undefined,
        salaireActuel: fields.salaryCurrent ? parseInt(fields.salaryCurrent.replace(/\D/g, ''), 10) || undefined : undefined,
        disponibilite: fields.availability || undefined,
        cvUrl: cvFileUrl || undefined,
        source: 'SPONTANEOUS',
        createdById: assignedToId || undefined,
      },
    });
    candidatId = newCandidat.id;
  }

  // Create candidature in default job board mandat
  const defaultMandatId = await getOrCreateDefaultJobBoardMandat(assignedToId);
  if (defaultMandatId) {
    const existingCandidature = await prisma.candidature.findUnique({
      where: { mandatId_candidatId: { mandatId: defaultMandatId, candidatId } },
    });
    if (!existingCandidature) {
      const candidature = await prisma.candidature.create({
        data: {
          mandatId: defaultMandatId,
          candidatId,
          stage: 'SOURCING',
          createdById: assignedToId || undefined,
        },
      });
      await prisma.stageHistory.create({
        data: {
          candidatureId: candidature.id,
          fromStage: null,
          toStage: 'SOURCING',
          changedById: assignedToId || undefined,
        },
      });
    }
  }

  // CV parsing async
  if (cvBuffer && cvFilename && assignedToId) {
    parseCv(cvBuffer, cvFilename, assignedToId)
      .then(async (parsed: any) => {
        if (parsed?.candidate) {
          const c = parsed.candidate;
          await prisma.candidat.update({
            where: { id: candidatId },
            data: {
              posteActuel: c.current_title || undefined,
              entrepriseActuelle: c.current_company || undefined,
              localisation: c.city || undefined,
              linkedinUrl: c.linkedin_url || undefined,
              aiPitchShort: parsed.pitchShort || undefined,
              aiPitchLong: parsed.pitchLong || undefined,
              aiSellingPoints: parsed.sellingPoints || undefined,
              aiIdealFor: parsed.idealFor || undefined,
              aiAnonymizedProfile: parsed.anonymizedProfile || undefined,
              aiParsedAt: new Date(),
            },
          });
        }
      })
      .catch((err: Error) => {
        console.error(`[JobBoard] CV parsing failed for spontaneous candidat ${candidatId}:`, err.message);
      });
  }

  // Create application
  const application = await prisma.jobApplication.create({
    data: {
      candidatId,
      firstName: fields.firstName,
      lastName: fields.lastName,
      email,
      phone: fields.phone || undefined,
      salaryCurrent: fields.salaryCurrent || undefined,
      currentCompany: fields.currentCompany || undefined,
      availability: fields.availability || undefined,
      cvFileUrl,
      source: 'spontaneous',
      isSpontaneous: true,
      jobTypeSought: fields.jobTypeSought || undefined,
    },
  });

  // Notify all admins
  if (assignedToId) {
    await notificationService.create({
      userId: assignedToId,
      type: 'JOB_APPLICATION_NEW',
      titre: '📩 Candidature spontanée reçue',
      contenu: `${fields.firstName} ${fields.lastName} a envoyé une candidature spontanée`,
      entiteType: 'CANDIDAT',
      entiteId: candidatId,
    });
  }

  return { applicationId: application.id, candidatId };
}

// ─── APPLICATIONS MANAGEMENT ────────────────────────

export async function listApplications(
  jobPostingId: string,
  filters: { status?: string },
  pagination: PaginationParams,
) {
  const where: Prisma.JobApplicationWhereInput = { jobPostingId };
  if (filters.status) where.status = filters.status as any;

  const { skip, take } = paginationToSkipTake(pagination);
  const [data, total] = await Promise.all([
    prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        candidat: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            posteActuel: true,
            entrepriseActuelle: true,
            aiPitchShort: true,
            cvUrl: true,
          },
        },
      },
    }),
    prisma.jobApplication.count({ where }),
  ]);

  return paginatedResult(data, total, pagination);
}

export async function listAllApplications(
  filters: { status?: string; isSpontaneous?: boolean },
  pagination: PaginationParams,
) {
  const where: Prisma.JobApplicationWhereInput = {};
  if (filters.status) where.status = filters.status as any;
  if (filters.isSpontaneous !== undefined) where.isSpontaneous = filters.isSpontaneous;

  const { skip, take } = paginationToSkipTake(pagination);
  const [data, total] = await Promise.all([
    prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        jobPosting: { select: { id: true, title: true, slug: true } },
        candidat: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            posteActuel: true,
            aiPitchShort: true,
          },
        },
      },
    }),
    prisma.jobApplication.count({ where }),
  ]);

  return paginatedResult(data, total, pagination);
}

export async function updateApplicationStatus(
  applicationId: string,
  status: 'REVIEWED' | 'SHORTLISTED' | 'REJECTED',
  reviewedById: string,
) {
  return prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      status,
      reviewedAt: new Date(),
      reviewedById,
    },
  });
}

export async function shortlistApplication(applicationId: string, userId: string) {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    include: {
      jobPosting: { include: { mandat: true } },
      candidat: true,
    },
  });

  if (!application) throw new Error('Candidature introuvable');

  // Update status
  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: { status: 'SHORTLISTED', reviewedAt: new Date(), reviewedById: userId },
  });

  // If mandat-linked, advance candidature to CONTACTE
  if (application.jobPosting?.mandatId && application.candidatId) {
    const candidature = await prisma.candidature.findUnique({
      where: {
        mandatId_candidatId: {
          mandatId: application.jobPosting.mandatId,
          candidatId: application.candidatId,
        },
      },
    });

    if (candidature && candidature.stage === 'SOURCING') {
      await prisma.candidature.update({
        where: { id: candidature.id },
        data: { stage: 'CONTACTE' },
      });

      await prisma.stageHistory.create({
        data: {
          candidatureId: candidature.id,
          fromStage: 'SOURCING',
          toStage: 'CONTACTE',
          changedById: userId,
        },
      });
    }
  }

  // TODO: Send booking link email to candidate
  // This will be implemented in Phase 5

  return application;
}

export async function rejectApplication(applicationId: string, userId: string) {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
  });

  if (!application) throw new Error('Candidature introuvable');

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: userId },
  });

  // TODO: Send rejection email (optional, configurable)
  // This will be implemented in Phase 5

  return application;
}

// ─── STATS ──────────────────────────────────────────

export async function getStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalPublished, totalDraft, totalArchived, applicationsThisMonth, totalApplications] = await Promise.all([
    prisma.jobPosting.count({ where: { status: 'PUBLISHED' } }),
    prisma.jobPosting.count({ where: { status: 'DRAFT' } }),
    prisma.jobPosting.count({ where: { status: 'ARCHIVED' } }),
    prisma.jobApplication.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.jobApplication.count(),
  ]);

  return {
    totalPublished,
    totalDraft,
    totalArchived,
    applicationsThisMonth,
    totalApplications,
  };
}
