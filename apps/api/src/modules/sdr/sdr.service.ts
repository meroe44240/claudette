import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { parseCSV } from '../import/import.service.js';

// ─── TYPES ──────────────────────────────────────────

interface ParsedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  rawData: Record<string, string>;
}

interface UploadResult {
  listId: string;
  listName: string;
  fileName: string;
  totalContacts: number;
  parsed: ParsedContact[];
  stats: {
    withEmail: number;
    withPhone: number;
    withCompany: number;
    existingCandidats: number;
    existingCompanies: number;
    newContacts: number;
  };
}

interface AttributionInput {
  contactIds: string[];
  assignedToId: string;
  sequenceId?: string;
}

interface CallResultInput {
  callResult: 'answered' | 'no_answer' | 'voicemail' | 'wrong_number' | 'not_interested' | 'callback';
  notes?: string;
}

// ─── COLUMN MAPPING ─────────────────────────────────

const COLUMN_ALIASES: Record<string, string> = {
  // First name
  'first name': 'firstName',
  'first_name': 'firstName',
  'firstname': 'firstName',
  'prenom': 'firstName',
  'prénom': 'firstName',
  'given name': 'firstName',
  // Last name
  'last name': 'lastName',
  'last_name': 'lastName',
  'lastname': 'lastName',
  'nom': 'lastName',
  'nom de famille': 'lastName',
  'family name': 'lastName',
  'surname': 'lastName',
  // Email
  'email': 'email',
  'emails': 'email',               // Jarvi
  'email address': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'courriel': 'email',
  // Phone
  'phone': 'phone',
  'telephone': 'phone',
  'telephones': 'phone',           // Jarvi
  'tel': 'phone',
  'téléphone': 'phone',
  'téléphones': 'phone',           // Jarvi
  'mobile': 'phone',
  'phone number': 'phone',
  // Company
  'company': 'company',
  'entreprise': 'company',
  'société': 'company',
  'societe': 'company',
  'organization': 'company',
  'organisation': 'company',
  'company name': 'company',
  // Job title
  'title': 'jobTitle',
  'job title': 'jobTitle',
  'job_title': 'jobTitle',
  'intitulé de poste': 'jobTitle',  // Jarvi
  'intitule de poste': 'jobTitle',  // Jarvi (sans accent)
  'position': 'jobTitle',
  'poste': 'jobTitle',
  'role': 'jobTitle',
  'fonction': 'jobTitle',
  // LinkedIn (Jarvi)
  'lien du profil linkedin': 'linkedinUrl',
  'linkedin': 'linkedinUrl',
  'linkedin url': 'linkedinUrl',
  'profile url': 'linkedinUrl',
  'url': 'linkedinUrl',
};

function mapColumns(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  headers.forEach((h, i) => {
    const normalized = h.trim().toLowerCase();
    if (COLUMN_ALIASES[normalized]) {
      mapping[i] = COLUMN_ALIASES[normalized]!;
    }
  });
  return mapping;
}

// ─── UPLOAD & PARSE ─────────────────────────────────

export async function uploadAndParse(
  buffer: Buffer,
  fileName: string,
  listName: string,
  userId: string,
): Promise<UploadResult> {
  // Parse CSV
  const { headers, rows } = parseCSV(buffer);
  const columnMap = mapColumns(headers);

  if (Object.keys(columnMap).length === 0) {
    throw new ValidationError(
      'Impossible de détecter les colonnes. Assurez-vous que le CSV contient des colonnes comme "First Name", "Last Name", "Email", "Phone", "Company".',
    );
  }

  // Parse contacts from rows
  const parsed: ParsedContact[] = rows.map((row) => {
    const rawData: Record<string, string> = {};
    headers.forEach((h, i) => { rawData[h] = row[i] || ''; });

    const contact: ParsedContact = { rawData };
    for (const [colIdx, field] of Object.entries(columnMap)) {
      let value = row[Number(colIdx)]?.trim();
      if (value) {
        // Jarvi exports multiple emails/phones separated by commas — take the first one
        if ((field === 'email' || field === 'phone') && value.includes(',')) {
          value = value.split(',')[0]!.trim();
        }
        (contact as any)[field] = value;
      }
    }
    return contact;
  });

  // Match existing candidats by email
  const emails = parsed.filter((c) => c.email).map((c) => c.email!.toLowerCase());
  const existingCandidats = emails.length > 0
    ? await prisma.candidat.findMany({
        where: { email: { in: emails, mode: 'insensitive' } },
        select: { id: true, email: true },
      })
    : [];
  const emailToCandidat = new Map(existingCandidats.map((c) => [c.email?.toLowerCase(), c.id]));

  // Match existing companies by name
  const companyNames = [...new Set(parsed.filter((c) => c.company).map((c) => c.company!.toLowerCase()))];
  const existingCompanies = companyNames.length > 0
    ? await prisma.entreprise.findMany({
        where: { nom: { in: companyNames, mode: 'insensitive' } },
        select: { id: true, nom: true },
      })
    : [];
  const companyToId = new Map(existingCompanies.map((c) => [c.nom.toLowerCase(), c.id]));

  // Create the SDR list
  const list = await prisma.sdrList.create({
    data: {
      name: listName,
      fileName,
      totalContacts: parsed.length,
      processedContacts: 0,
      status: 'imported',
      createdById: userId,
      metadata: {
        headers,
        columnMap,
        importedAt: new Date().toISOString(),
      },
    },
  });

  // Helper: truncate string to max length to avoid DB VarChar overflow
  const trunc = (val: string | undefined, max: number): string | null => {
    if (!val) return null;
    return val.length > max ? val.substring(0, max) : val;
  };

  // Create SDR contacts
  await prisma.sdrContact.createMany({
    data: parsed.map((c, i) => ({
      sdrListId: list.id,
      firstName: trunc(c.firstName, 255),
      lastName: trunc(c.lastName, 255),
      email: trunc(c.email, 255),
      phone: trunc(c.phone, 100),
      company: trunc(c.company, 255),
      jobTitle: trunc(c.jobTitle, 255),
      rawData: c.rawData,
      candidatId: c.email ? emailToCandidat.get(c.email.toLowerCase()) || null : null,
      companyId: c.company ? companyToId.get(c.company.toLowerCase()) || null : null,
      callResult: 'pending',
      orderInList: i + 1,
    })),
  });

  const existingCandidatCount = parsed.filter((c) => c.email && emailToCandidat.has(c.email.toLowerCase())).length;

  return {
    listId: list.id,
    listName: list.name,
    fileName,
    totalContacts: parsed.length,
    parsed,
    stats: {
      withEmail: parsed.filter((c) => c.email).length,
      withPhone: parsed.filter((c) => c.phone).length,
      withCompany: parsed.filter((c) => c.company).length,
      existingCandidats: existingCandidatCount,
      existingCompanies: existingCompanies.length,
      newContacts: parsed.length - existingCandidatCount,
    },
  };
}

// ─── LIST MANAGEMENT ────────────────────────────────

export async function getLists() {
  return prisma.sdrList.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contacts: true } },
    },
  });
}

export async function getListById(listId: string) {
  const list = await prisma.sdrList.findUnique({
    where: { id: listId },
    include: {
      contacts: {
        orderBy: { orderInList: 'asc' },
      },
    },
  });
  if (!list) throw new NotFoundError('Liste SDR non trouvée');
  return list;
}

export async function deleteList(listId: string) {
  await prisma.sdrList.delete({ where: { id: listId } });
  return { success: true };
}

// ─── ATTRIBUTION ────────────────────────────────────

export async function attributeContacts(listId: string, input: AttributionInput) {
  const { contactIds, assignedToId, sequenceId } = input;

  // Update the list with assigned recruiter and sequence
  await prisma.sdrList.update({
    where: { id: listId },
    data: {
      assignedToId,
      ...(sequenceId ? { sequenceId } : {}),
    },
  });

  // Verify contacts belong to this list
  const contacts = await prisma.sdrContact.findMany({
    where: { id: { in: contactIds }, sdrListId: listId },
  });

  if (contacts.length === 0) throw new ValidationError('Aucun contact trouvé dans cette liste');

  // For contacts without candidatId, create candidat records
  const newCandidats: string[] = [];
  for (const contact of contacts) {
    if (!contact.candidatId && (contact.email || contact.phone)) {
      // Try to extract linkedinUrl from rawData (Jarvi: "Lien du profil Linkedin")
      const raw = contact.rawData as Record<string, string> | null;
      const linkedinUrl = raw
        ? (Object.entries(raw).find(([k]) => k.toLowerCase().includes('linkedin'))?.[1] || null)
        : null;

      const candidat = await prisma.candidat.create({
        data: {
          nom: contact.lastName || 'Inconnu',
          prenom: contact.firstName || null,
          email: contact.email || null,
          telephone: contact.phone || null,
          entrepriseActuelle: contact.company || null,
          posteActuel: contact.jobTitle || null,
          linkedinUrl: linkedinUrl || null,
          source: 'SDR Import',
          createdById: assignedToId,
        },
      });
      await prisma.sdrContact.update({
        where: { id: contact.id },
        data: { candidatId: candidat.id },
      });
      newCandidats.push(candidat.id);
    }

    // Create company if needed
    if (!contact.companyId && contact.company) {
      const existing = await prisma.entreprise.findFirst({
        where: { nom: { equals: contact.company, mode: 'insensitive' } },
      });
      if (existing) {
        await prisma.sdrContact.update({
          where: { id: contact.id },
          data: { companyId: existing.id },
        });
      } else {
        const newCompany = await prisma.entreprise.create({
          data: {
            nom: contact.company,
            createdById: assignedToId,
          },
        });
        await prisma.sdrContact.update({
          where: { id: contact.id },
          data: { companyId: newCompany.id },
        });
      }
    }
  }

  return {
    attributed: contacts.length,
    newCandidatsCreated: newCandidats.length,
    assignedToId,
    sequenceId: sequenceId || null,
  };
}

// ─── CALL SESSION ───────────────────────────────────

export async function startSession(listId: string) {
  // Update list status
  await prisma.sdrList.update({
    where: { id: listId },
    data: { status: 'in_progress' },
  });

  // Get first pending contact
  const nextContact = await prisma.sdrContact.findFirst({
    where: { sdrListId: listId, callResult: 'pending' },
    orderBy: { orderInList: 'asc' },
  });

  // Get stats
  const stats = await getSessionStats(listId);

  return { nextContact, stats };
}

export async function getNextContact(listId: string) {
  const nextContact = await prisma.sdrContact.findFirst({
    where: { sdrListId: listId, callResult: 'pending' },
    orderBy: { orderInList: 'asc' },
  });

  if (!nextContact) {
    // All contacts processed, mark list as completed
    await prisma.sdrList.update({
      where: { id: listId },
      data: { status: 'completed' },
    });
  }

  const stats = await getSessionStats(listId);
  return { nextContact, stats };
}

export async function recordCallResult(contactId: string, input: CallResultInput) {
  const contact = await prisma.sdrContact.findUnique({
    where: { id: contactId },
    include: { sdrList: true },
  });
  if (!contact) throw new NotFoundError('Contact SDR non trouvé');

  // Update contact
  const updated = await prisma.sdrContact.update({
    where: { id: contactId },
    data: {
      callResult: input.callResult,
      notes: input.notes || contact.notes,
      processedAt: new Date(),
    },
  });

  // Update processed count
  const processedCount = await prisma.sdrContact.count({
    where: { sdrListId: contact.sdrListId, NOT: { callResult: 'pending' } },
  });
  await prisma.sdrList.update({
    where: { id: contact.sdrListId },
    data: { processedContacts: processedCount },
  });

  // If candidate exists, create an activity log for the call
  if (contact.candidatId) {
    await prisma.activite.create({
      data: {
        type: 'APPEL',
        direction: 'SORTANT',
        entiteType: 'CANDIDAT',
        entiteId: contact.candidatId,
        userId: contact.sdrList.assignedToId,
        titre: `Appel SDR — ${input.callResult === 'answered' ? 'Répondu' : input.callResult === 'no_answer' ? 'Pas de réponse' : input.callResult === 'voicemail' ? 'Messagerie' : input.callResult === 'wrong_number' ? 'Mauvais numéro' : input.callResult === 'not_interested' ? 'Pas intéressé' : 'Rappeler'}`,
        contenu: input.notes || null,
        source: 'SYSTEME',
        metadata: {
          sdrListId: contact.sdrListId,
          sdrContactId: contact.id,
          callResult: input.callResult,
        },
      },
    });
  }

  // Get next contact
  const nextContact = await prisma.sdrContact.findFirst({
    where: { sdrListId: contact.sdrListId, callResult: 'pending' },
    orderBy: { orderInList: 'asc' },
  });

  if (!nextContact) {
    await prisma.sdrList.update({
      where: { id: contact.sdrListId },
      data: { status: 'completed' },
    });
  }

  const stats = await getSessionStats(contact.sdrListId);

  return { updated, nextContact, stats };
}

// ─── SESSION STATS ──────────────────────────────────

async function getSessionStats(listId: string) {
  const [total, processed, answered, noAnswer, voicemail, wrongNumber, notInterested, callback] =
    await Promise.all([
      prisma.sdrContact.count({ where: { sdrListId: listId } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, NOT: { callResult: 'pending' } } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, callResult: 'answered' } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, callResult: 'no_answer' } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, callResult: 'voicemail' } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, callResult: 'wrong_number' } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, callResult: 'not_interested' } }),
      prisma.sdrContact.count({ where: { sdrListId: listId, callResult: 'callback' } }),
    ]);

  return {
    total,
    processed,
    remaining: total - processed,
    progressPercent: total > 0 ? Math.round((processed / total) * 100) : 0,
    results: { answered, noAnswer, voicemail, wrongNumber, notInterested, callback },
  };
}

// ─── SDR DASHBOARD / KPIs ───────────────────────────

export async function getDashboard() {
  const lists = await prisma.sdrList.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contacts: true } },
    },
  });

  // Aggregate all results across all lists
  const [totalContacts, totalProcessed, totalAnswered, totalNoAnswer, totalVoicemail, totalWrongNumber, totalNotInterested, totalCallback] =
    await Promise.all([
      prisma.sdrContact.count(),
      prisma.sdrContact.count({ where: { NOT: { callResult: 'pending' } } }),
      prisma.sdrContact.count({ where: { callResult: 'answered' } }),
      prisma.sdrContact.count({ where: { callResult: 'no_answer' } }),
      prisma.sdrContact.count({ where: { callResult: 'voicemail' } }),
      prisma.sdrContact.count({ where: { callResult: 'wrong_number' } }),
      prisma.sdrContact.count({ where: { callResult: 'not_interested' } }),
      prisma.sdrContact.count({ where: { callResult: 'callback' } }),
    ]);

  const contactRate = totalProcessed > 0 ? Math.round((totalAnswered / totalProcessed) * 100) : 0;

  return {
    lists,
    kpis: {
      totalLists: lists.length,
      activeLists: lists.filter((l) => l.status === 'in_progress').length,
      totalContacts,
      totalProcessed,
      totalRemaining: totalContacts - totalProcessed,
      contactRate,
      results: {
        answered: totalAnswered,
        noAnswer: totalNoAnswer,
        voicemail: totalVoicemail,
        wrongNumber: totalWrongNumber,
        notInterested: totalNotInterested,
        callback: totalCallback,
      },
    },
  };
}

// ─── UPDATE CONTACT NOTES ───────────────────────────

export async function updateContactNotes(contactId: string, notes: string) {
  return prisma.sdrContact.update({
    where: { id: contactId },
    data: { notes },
  });
}
