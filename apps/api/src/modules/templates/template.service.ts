import prisma from '../../lib/db.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { CreateTemplateInput, UpdateTemplateInput } from './template.schema.js';

export async function list(userId: string, params: PaginationParams & { type?: string }) {
  const where: any = {
    OR: [
      { createdById: userId },
      { isGlobal: true },
    ],
  };
  // Filter by type if provided (e.g. EMAIL_PRESENTATION_CLIENT)
  if (params.type) {
    where.type = params.type;
  }
  const { skip, take } = paginationToSkipTake(params);
  const [data, total] = await Promise.all([
    prisma.template.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.template.count({ where }),
  ]);
  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new NotFoundError('Template', id);
  return template;
}

export async function create(data: CreateTemplateInput, createdById: string, role: string) {
  if (data.isGlobal && role !== 'ADMIN') {
    throw new ForbiddenError('Seuls les administrateurs peuvent creer des templates globaux');
  }

  return prisma.template.create({
    data: {
      nom: data.nom,
      type: data.type,
      sujet: data.sujet,
      contenu: data.contenu ?? '',
      variables: data.variables ?? [],
      isGlobal: data.isGlobal ?? false,
      createdById,
    },
  });
}

export async function update(id: string, data: UpdateTemplateInput) {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Template', id);

  return prisma.template.update({
    where: { id },
    data,
  });
}

export async function remove(id: string) {
  const existing = await prisma.template.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Template', id);

  return prisma.template.delete({ where: { id } });
}

function replaceVariables(text: string, variables: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

export async function render(
  id: string,
  context: { candidatId?: string; clientId?: string; mandatId?: string; userId: string },
) {
  const template = await getById(id);

  const variables: Record<string, string> = {};

  // Fetch user data
  const user = await prisma.user.findUnique({
    where: { id: context.userId },
    select: { nom: true, prenom: true },
  });
  if (user) {
    variables['user.prenom'] = user.prenom || '';
    variables['user.nom'] = user.nom;
  }

  // Fetch candidat data
  if (context.candidatId) {
    const candidat = await prisma.candidat.findUnique({
      where: { id: context.candidatId },
      select: { nom: true, prenom: true, posteActuel: true },
    });
    if (candidat) {
      variables['candidat.prenom'] = candidat.prenom || '';
      variables['candidat.nom'] = candidat.nom;
      variables['candidat.poste_actuel'] = candidat.posteActuel || '';
    }
  }

  // Fetch client data
  if (context.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: context.clientId },
      select: { nom: true, prenom: true, entreprise: { select: { nom: true } } },
    });
    if (client) {
      variables['client.prenom'] = client.prenom || '';
      variables['client.nom'] = client.nom;
      variables['client.entreprise'] = client.entreprise?.nom || '';
    }
  }

  // Fetch mandat data
  if (context.mandatId) {
    const mandat = await prisma.mandat.findUnique({
      where: { id: context.mandatId },
      select: {
        titrePoste: true,
        localisation: true,
        salaireMin: true,
        salaireMax: true,
        entreprise: { select: { nom: true } },
      },
    });
    if (mandat) {
      variables['mandat.titre_poste'] = mandat.titrePoste;
      variables['mandat.entreprise'] = mandat.entreprise?.nom || '';
      variables['mandat.localisation'] = mandat.localisation || '';
      variables['mandat.salaire_min'] = mandat.salaireMin?.toString() || '';
      variables['mandat.salaire_max'] = mandat.salaireMax?.toString() || '';
    }
  }

  const contenu = replaceVariables(template.contenu, variables);
  const sujet = template.sujet ? replaceVariables(template.sujet, variables) : template.sujet;

  return { sujet, contenu };
}
