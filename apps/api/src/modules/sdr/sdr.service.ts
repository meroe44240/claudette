import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { parseCSV } from '../import/import.service.js';
import { pushContactToAllo } from '../integrations/allo.service.js';

// ─── TYPES ──────────────────────────────────────────

interface ParsedContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  notes?: string;
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
    newCompaniesCreated: number;
    newClientsCreated: number;
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
  'most probable phone number': 'phone',  // Evaboot / PhantomBuster
  'valid phone numbers': 'phone',
  'all phone numbers': 'phone',
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
  // LinkedIn (Jarvi / Evaboot)
  'lien du profil linkedin': 'linkedinUrl',
  'linkedin': 'linkedinUrl',
  'linkedin url': 'linkedinUrl',
  'linkedin profile url': 'linkedinUrl',  // Evaboot / PhantomBuster
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

  // Identify which column indices are mapped (known fields)
  const mappedIndices = new Set(Object.keys(columnMap).map(Number));

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
        // linkedinUrl is not a ParsedContact field — skip it (kept in rawData)
        if (field === 'linkedinUrl') continue;
        // Don't overwrite if already set (first column with value wins)
        if ((contact as any)[field]) continue;
        (contact as any)[field] = value;
      }
    }

    // Collect unmapped columns into notes (Localisation, Projets, Origine, etc.)
    const extraParts: string[] = [];
    headers.forEach((h, i) => {
      if (!mappedIndices.has(i)) {
        const val = row[i]?.trim();
        if (val) {
          extraParts.push(`${h}: ${val}`);
        }
      }
    });
    if (extraParts.length > 0) {
      contact.notes = extraParts.join(' | ');
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

  // Helper: truncate string to max length to avoid DB VarChar overflow
  const trunc = (val: string | undefined | null, max: number): string | null => {
    if (!val) return null;
    return val.length > max ? val.substring(0, max) : val;
  };

  // Helper: sanitize strings for PostgreSQL JSONB
  // 1. Remove control characters
  // 2. Remove lone surrogates (chars outside BMP like mathematical bold cause \ud835 in JSON which Prisma can't handle)
  // 3. Remove backslashes
  const sanitize = (val: string): string => {
    return val
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')    // control chars
      .replace(/[^\x20-\x7E\xA0-\uFFFF]/gu, '')         // strip everything outside BMP (incl. math bold, emojis, etc.)
      .replace(/\\/g, '');                                // backslashes
  };

  const sanitizeRawData = (raw: Record<string, string>): Record<string, string> => {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      clean[sanitize(k)] = sanitize(v);
    }
    return clean;
  };

  // Build contact data
  const contactData = parsed.map((c, i) => ({
    firstName: trunc(c.firstName ? sanitize(c.firstName) : undefined, 255),
    lastName: trunc(c.lastName ? sanitize(c.lastName) : undefined, 255),
    email: trunc(c.email ? sanitize(c.email) : undefined, 255),
    phone: trunc(c.phone ? sanitize(c.phone) : undefined, 100),
    company: trunc(c.company ? sanitize(c.company) : undefined, 255),
    jobTitle: trunc(c.jobTitle ? sanitize(c.jobTitle) : undefined, 255),
    notes: c.notes ? sanitize(c.notes) : null,
    rawData: c.rawData ? sanitizeRawData(c.rawData) : undefined,
    candidatId: c.email ? emailToCandidat.get(c.email.toLowerCase()) || null : null,
    companyId: c.company ? companyToId.get(c.company.toLowerCase()) || null : null,
    callResult: 'pending' as const,
    orderInList: i + 1,
  }));

  // Create list + contacts in a transaction to avoid orphan lists
  const list = await prisma.$transaction(async (tx) => {
    const newList = await tx.sdrList.create({
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

    // Insert contacts in batches using createMany
    // Surrogate pairs and control chars are already stripped by sanitize()
    const BATCH_SIZE = 50;
    for (let i = 0; i < contactData.length; i += BATCH_SIZE) {
      const batch = contactData.slice(i, i + BATCH_SIZE);
      await tx.sdrContact.createMany({
        data: batch.map((c) => ({ ...c, sdrListId: newList.id })),
      });
    }

    return newList;
  });

  const existingCandidatCount = parsed.filter((c) => c.email && emailToCandidat.has(c.email.toLowerCase())).length;

  // ─── Auto-create Entreprise + Client at upload time ───
  let newCompaniesCreated = 0;
  let newClientsCreated = 0;

  // Helper to get value from rawData by partial key match
  const getRaw = (raw: Record<string, string> | undefined, keys: string[]): string | null => {
    if (!raw) return null;
    for (const key of keys) {
      const match = Object.entries(raw).find(([k]) => k.toLowerCase().includes(key.toLowerCase()));
      if (match?.[1]) return sanitize(match[1]);
    }
    return null;
  };

  // Map headcount range to TailleEntreprise enum
  const mapTaille = (range: string | null): 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE' | null => {
    if (!range) return null;
    const lower = range.toLowerCase();
    if (lower.includes('1-10') || lower.includes('11-50')) return 'STARTUP';
    if (lower.includes('51-200') || lower.includes('201-500')) return 'PME';
    if (lower.includes('501-1000') || lower.includes('1001-5000')) return 'ETI';
    if (lower.includes('5001') || lower.includes('10001') || lower.includes('10000')) return 'GRAND_GROUPE';
    return null;
  };

  // Group contacts by company to avoid duplicate creation
  const companiesProcessed = new Map<string, string>(); // companyName.lower → entrepriseId

  for (const c of parsed) {
    if (!c.company) continue;
    const companyKey = c.company.toLowerCase();

    // Skip if we already processed this company in this import
    let entrepriseId = companiesProcessed.get(companyKey) || companyToId.get(companyKey) || null;

    if (!entrepriseId) {
      // Create new Entreprise with enriched data from rawData
      const raw = c.rawData;
      const headcountRange = getRaw(raw, ['Company headcount range', 'headcount range']);
      const newCompany = await prisma.entreprise.create({
        data: {
          nom: trunc(sanitize(c.company), 255)!,
          secteur: trunc(getRaw(raw, ['Company industry', 'industry']), 100),
          siteWeb: trunc(getRaw(raw, ['Company Domain', 'domain']), 500),
          linkedinUrl: trunc(getRaw(raw, ['Company Linkedin URL', 'Company LinkedIn']), 500),
          localisation: trunc(getRaw(raw, ['Company headquarters', 'headquarters location']), 255),
          effectif: trunc(headcountRange || getRaw(raw, ['Company headcount', 'headcount']), 50),
          notes: getRaw(raw, ['Company Description', 'description']) || null,
          taille: mapTaille(headcountRange),
          createdById: userId,
        },
      });
      entrepriseId = newCompany.id;
      newCompaniesCreated++;
      companiesProcessed.set(companyKey, entrepriseId);

      // Update sdr_contact with companyId
      await prisma.sdrContact.updateMany({
        where: { sdrListId: list.id, company: { equals: c.company, mode: 'insensitive' } },
        data: { companyId: entrepriseId },
      });
    } else {
      companiesProcessed.set(companyKey, entrepriseId);
    }

    // Create Client if not already existing for this entreprise
    if (entrepriseId && (c.firstName || c.lastName)) {
      const clientNom = sanitize(c.lastName || c.firstName || 'Inconnu');
      const clientPrenom = c.firstName ? sanitize(c.firstName) : null;

      // Check duplicate by nom+prenom in same entreprise
      const existingClient = await prisma.client.findFirst({
        where: {
          nom: { equals: clientNom, mode: 'insensitive' },
          ...(clientPrenom ? { prenom: { equals: clientPrenom, mode: 'insensitive' } } : {}),
          entrepriseId,
        },
      });

      if (!existingClient) {
        // Extract LinkedIn URL from rawData (personal, not company)
        const raw = c.rawData;
        const linkedinUrl = raw
          ? (Object.entries(raw).find(([k]) => {
              const kl = k.toLowerCase();
              return kl.includes('linkedin') && !kl.includes('company');
            })?.[1] || null)
          : null;

        await prisma.client.create({
          data: {
            nom: trunc(clientNom, 255)!,
            prenom: trunc(clientPrenom, 255),
            telephone: trunc(c.phone ? sanitize(c.phone) : null, 50),
            poste: trunc(c.jobTitle ? sanitize(c.jobTitle) : null, 255),
            linkedinUrl: trunc(linkedinUrl ? sanitize(linkedinUrl) : null, 500),
            entrepriseId,
            statutClient: 'LEAD',
            typeClient: 'OUTBOUND',
            createdById: userId,
          },
        });
        newClientsCreated++;

        // Push contact to Allo for caller-ID
        if (c.phone) {
          pushContactToAllo(sanitize(c.phone), {
            name: clientPrenom || undefined,
            lastName: clientNom,
            jobTitle: c.jobTitle ? sanitize(c.jobTitle) : undefined,
            email: c.email ? sanitize(c.email) : undefined,
          }).catch(() => {}); // fire-and-forget, don't block import
        }
      }
    }
  }

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
      newCompaniesCreated,
      newClientsCreated,
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
  let newClientsCreated = 0;
  let newCompaniesCreated = 0;
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

    // Create company if needed + enrich with CSV data
    let entrepriseId: string | null = null;
    if (!contact.companyId && contact.company) {
      const existing = await prisma.entreprise.findFirst({
        where: { nom: { equals: contact.company, mode: 'insensitive' } },
      });
      if (existing) {
        entrepriseId = existing.id;
        await prisma.sdrContact.update({
          where: { id: contact.id },
          data: { companyId: existing.id },
        });
      } else {
        // Extract enriched company data from rawData
        const raw = contact.rawData as Record<string, string> | null;
        const getRaw = (keys: string[]) => {
          if (!raw) return null;
          for (const key of keys) {
            const match = Object.entries(raw).find(([k]) => k.toLowerCase().includes(key.toLowerCase()));
            if (match?.[1]) return match[1];
          }
          return null;
        };

        // Map headcount range to TailleEntreprise enum
        const headcountRange = getRaw(['headcount range', 'Company headcount range']);
        let taille: 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE' | undefined;
        if (headcountRange) {
          const lower = headcountRange.toLowerCase();
          if (lower.includes('1-10') || lower.includes('11-50')) taille = 'STARTUP';
          else if (lower.includes('51-200') || lower.includes('201-500')) taille = 'PME';
          else if (lower.includes('501-1000') || lower.includes('1001-5000')) taille = 'ETI';
          else if (lower.includes('5001') || lower.includes('10001') || lower.includes('10000')) taille = 'GRAND_GROUPE';
        }

        const newCompany = await prisma.entreprise.create({
          data: {
            nom: contact.company,
            secteur: getRaw(['Company industry', 'industry']) || null,
            siteWeb: getRaw(['Company Domain', 'domain']) || null,
            linkedinUrl: getRaw(['Company Linkedin URL', 'Company LinkedIn']) || null,
            localisation: getRaw(['Company headquarters', 'headquarters location']) || null,
            effectif: getRaw(['Company headcount range', 'headcount range']) || getRaw(['Company headcount', 'headcount']) || null,
            notes: getRaw(['Company Description', 'description']) || null,
            taille: taille || null,
            createdById: assignedToId,
          },
        });
        entrepriseId = newCompany.id;
        newCompaniesCreated++;
        await prisma.sdrContact.update({
          where: { id: contact.id },
          data: { companyId: newCompany.id },
        });
      }
    } else if (contact.companyId) {
      entrepriseId = contact.companyId;
    }

    // Auto-create Client if we have an entreprise
    if (entrepriseId && (contact.email || contact.firstName || contact.lastName)) {
      // Check if client already exists (by email or nom+prenom in same entreprise)
      let existingClient = null;
      if (contact.email) {
        existingClient = await prisma.client.findFirst({
          where: { email: { equals: contact.email, mode: 'insensitive' }, entrepriseId },
        });
      }
      if (!existingClient && contact.lastName) {
        existingClient = await prisma.client.findFirst({
          where: {
            nom: { equals: contact.lastName, mode: 'insensitive' },
            ...(contact.firstName ? { prenom: { equals: contact.firstName, mode: 'insensitive' } } : {}),
            entrepriseId,
          },
        });
      }

      if (!existingClient) {
        const raw = contact.rawData as Record<string, string> | null;
        const linkedinUrl = raw
          ? (Object.entries(raw).find(([k]) => k.toLowerCase().includes('linkedin') && !k.toLowerCase().includes('company'))?.[1] || null)
          : null;

        await prisma.client.create({
          data: {
            nom: contact.lastName || 'Inconnu',
            prenom: contact.firstName || null,
            email: contact.email || null,
            telephone: contact.phone || null,
            poste: contact.jobTitle || null,
            linkedinUrl: linkedinUrl || null,
            entrepriseId,
            statutClient: 'LEAD',
            typeClient: 'OUTBOUND',
            createdById: assignedToId,
            assignedToId,
          },
        });
        newClientsCreated++;
      }
    }
  }

  return {
    attributed: contacts.length,
    newCandidatsCreated: newCandidats.length,
    newCompaniesCreated,
    newClientsCreated,
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
