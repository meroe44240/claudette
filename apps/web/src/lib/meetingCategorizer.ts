// ─── TYPES ──────────────────────────────────────────

export type MeetingType = 'presentation' | 'entretien' | 'commercial' | 'weekly_client' | 'nouveau_client' | 'other';

export interface AttendeeDetail {
  email: string;
  role: 'internal' | 'candidat' | 'client' | 'external';
  name?: string;
  entityId?: string;
}

export interface AttendeeAnalysis {
  details: AttendeeDetail[];
  hasCandidats: boolean;
  hasClients: boolean;
  hasExternals: boolean;
  allInternal: boolean;
}

export interface EnrichedCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  participants?: string[];
  location?: string;
  description?: string;
  status?: string;
  attendeeAnalysis?: AttendeeAnalysis | null;
}

export interface CategorizedEvent extends EnrichedCalendarEvent {
  meetingType: MeetingType;
  meetingTypeLabel: string;
  isOverridden: boolean;
  isCancelled: boolean;
}

// ─── COLORS & LABELS ────────────────────────────────

export const MEETING_COLORS = {
  presentation: { border: '#8B5CF6', bg: 'rgba(139,92,246,0.06)', text: '#8B5CF6', pill: '#F3EDFF' },
  entretien: { border: '#3B82F6', bg: 'rgba(59,130,246,0.06)', text: '#3B82F6', pill: '#EFF6FF' },
  commercial: { border: '#14B8A6', bg: 'rgba(20,184,166,0.06)', text: '#14B8A6', pill: '#ECFDF5' },
  weekly_client: { border: '#F59E0B', bg: 'rgba(245,158,11,0.06)', text: '#D97706', pill: '#FFF7ED' },
  nouveau_client: { border: '#EC4899', bg: 'rgba(236,72,153,0.06)', text: '#DB2777', pill: '#FDF2F8' },
  other: { border: '#6B7194', bg: 'rgba(107,113,148,0.06)', text: '#6B7194', pill: '#F1F2F6' },
} as const;

export const MEETING_LABELS: Record<MeetingType, string> = {
  presentation: 'Prés. candidat',
  entretien: 'Entretien',
  commercial: 'RDV commercial',
  weekly_client: 'Weekly client',
  nouveau_client: 'Nouveau client',
  other: 'Autre',
};

// ─── MANUAL OVERRIDES (localStorage) ────────────────

const OVERRIDE_KEY = 'humanup:meeting-overrides';

export function getManualOverride(eventId: string): MeetingType | null {
  try {
    const stored = localStorage.getItem(OVERRIDE_KEY);
    if (!stored) return null;
    const overrides: Record<string, MeetingType> = JSON.parse(stored);
    return overrides[eventId] ?? null;
  } catch {
    return null;
  }
}

export function setManualOverride(eventId: string, type: MeetingType): void {
  try {
    const stored = localStorage.getItem(OVERRIDE_KEY);
    const overrides: Record<string, MeetingType> = stored ? JSON.parse(stored) : {};
    overrides[eventId] = type;
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    /* silently fail */
  }
}

export function clearManualOverride(eventId: string): void {
  try {
    const stored = localStorage.getItem(OVERRIDE_KEY);
    if (!stored) return;
    const overrides: Record<string, MeetingType> = JSON.parse(stored);
    delete overrides[eventId];
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    /* silently fail */
  }
}

// ─── SIGNAL: DESCRIPTION TAGS ───────────────────────

function detectDescriptionTag(description?: string | null): MeetingType | null {
  if (!description) return null;
  const upper = description.toUpperCase();
  if (upper.includes('[PRES]')) return 'presentation';
  if (upper.includes('[ENTRETIEN]')) return 'entretien';
  if (upper.includes('[WEEKLY_CLIENT]') || upper.includes('[WEEKLY CLIENT]')) return 'weekly_client';
  if (upper.includes('[NOUVEAU_CLIENT]') || upper.includes('[NOUVEAU CLIENT]') || upper.includes('[R1]')) return 'nouveau_client';
  if (upper.includes('[COMMERCIAL]')) return 'commercial';
  if (upper.includes('[INTERNE]')) return 'other';
  return null;
}

// ─── SIGNAL: TITLE KEYWORDS ────────────────────────

const PRESENTATION_PATTERNS = [
  /pr[ée]s(?:entation)?\.?\s/i,
  /shortlist/i,
  /pr[ée]s(?:entation)?\s*candidat/i,
];

const ENTRETIEN_PATTERNS = [
  /entretien(?!\s+interne)/i,
  /interview/i,
  /screening/i,
  /debrief\s*candidat/i,
  /qualification\s*(?:candidat|profil)/i,
  /candidat/i,
  /discovery/i,
];

const WEEKLY_CLIENT_PATTERNS = [
  /weekly\s*(?:client|compte|account)/i,
  /hebdo\s*client/i,
  /point\s*hebdo\s*client/i,
  /suivi\s*hebdo/i,
  /weekly\s*(?:review|sync|call|meeting)?\s*[-—]\s*/i, // "Weekly - ClientName"
];

const NOUVEAU_CLIENT_PATTERNS = [
  /\bR1\b/i,
  /premier\s*(?:rdv|rendez[- ]?vous|meeting|contact|[ée]change)/i,
  /first\s*(?:meeting|call)/i,
  /nouveau\s*client/i,
  /d[ée]couverte\s*(?:client|entreprise|soci[ée]t[ée])/i,
  /intro(?:duction)?\s*(?:call|meeting|rdv)?/i,
  /prise\s*de\s*contact/i,
  /qualification\s*(?:client|besoin|entreprise)/i,
];

const COMMERCIAL_PATTERNS = [
  /commercial/i,
  /prospection/i,
  /business\s*(?:dev|development|review)?/i,
  /bizdev/i,
  /proposition\s*commerciale/i,
  /proposal/i,
  /n[ée]go(?:ciation)?/i,
  /closing/i,
  /onboarding\s*client/i,
  /kick[- ]?off/i,
  /brief\s*(?:client|poste|mission)/i,
  /besoin/i,
  /suivi\s*(?:client|mandat|mission)/i,
  /r[ée]union\s*client/i,
];

const OTHER_PATTERNS = [
  /standup/i,
  /stand[- ]up/i,
  /daily/i,
  /sync\b/i,
  /1[:\-.]1/i,
  /1on1/i,
  /one[- ]?on[- ]?one/i,
  /retro/i,
  /all[- ]?hands/i,
  /team\s*meeting/i,
  /internal/i,
  /interne/i,
  /check\b/i,
  /debrief\s*interne/i,
  /point\s*(?:hebdo|[ée]quipe)/i,
  /weekly(?!\s*(?:client|compte|account))/i, // "weekly" sans "client" → autre (interne)
];

// Pattern "Prénom X Entreprise" (séparateur X pour les présentations)
const CANDIDATE_SEPARATOR = /\s+[xX]\s+/;

function detectTitleKeyword(title: string): MeetingType | null {
  // "Prénom X Entreprise" format = presenting candidate to client
  if (CANDIDATE_SEPARATOR.test(title)) return 'presentation';
  for (const pattern of PRESENTATION_PATTERNS) {
    if (pattern.test(title)) return 'presentation';
  }
  for (const pattern of ENTRETIEN_PATTERNS) {
    if (pattern.test(title)) return 'entretien';
  }
  // Weekly client BEFORE commercial (more specific)
  for (const pattern of WEEKLY_CLIENT_PATTERNS) {
    if (pattern.test(title)) return 'weekly_client';
  }
  // Nouveau client / R1 BEFORE commercial
  for (const pattern of NOUVEAU_CLIENT_PATTERNS) {
    if (pattern.test(title)) return 'nouveau_client';
  }
  for (const pattern of COMMERCIAL_PATTERNS) {
    if (pattern.test(title)) return 'commercial';
  }
  for (const pattern of OTHER_PATTERNS) {
    if (pattern.test(title)) return 'other';
  }
  return null;
}

// ─── SIGNAL: ATTENDEE ANALYSIS ─────────────────────

function detectFromAttendees(analysis?: AttendeeAnalysis | null): MeetingType | null {
  if (!analysis) return null;
  // Candidat + client = presenting the candidate to the client
  if (analysis.hasCandidats && analysis.hasClients) return 'presentation';
  // Candidat only (no client) = recruiter interviewing the candidate
  if (analysis.hasCandidats) return 'entretien';
  if (analysis.hasClients) return 'commercial';
  if (analysis.allInternal) return 'other';
  return null;
}

// ─── PERSONAL EMAIL DETECTION ──────────────────────

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.fr', 'hotmail.com', 'hotmail.fr',
  'outlook.com', 'outlook.fr', 'live.com', 'live.fr', 'icloud.com',
  'me.com', 'protonmail.com', 'free.fr', 'orange.fr', 'sfr.fr',
  'laposte.net', 'wanadoo.fr',
]);

function hasPersonalEmail(analysis?: AttendeeAnalysis | null): boolean {
  if (!analysis) return false;
  return analysis.details.some(
    (d) => d.role === 'external' && PERSONAL_DOMAINS.has(d.email.split('@')[1]?.toLowerCase() ?? ''),
  );
}

// ─── COMBINED SIGNALS ──────────────────────────────

function combinedSignal(
  titleResult: MeetingType | null,
  attendeeResult: MeetingType | null,
  analysis?: AttendeeAnalysis | null,
): MeetingType | null {
  // "weekly" (internal pattern) with an external client attendee → WEEKLY_CLIENT
  if (titleResult === 'other' && attendeeResult === 'commercial') {
    // If the title looks like a "weekly" or "point hebdo", it's a recurring client meeting
    return 'weekly_client';
  }
  // "weekly" / internal title but has candidat + client → PRESENTATION
  if (titleResult === 'other' && attendeeResult === 'presentation') {
    return 'presentation';
  }
  // "weekly" / internal title but has candidat (no client) → ENTRETIEN
  if (titleResult === 'other' && attendeeResult === 'entretien') {
    return 'entretien';
  }
  // Generic title (no match) but personal email in attendees → likely candidat → ENTRETIEN
  if (!titleResult && hasPersonalEmail(analysis) && !analysis?.hasClients) {
    return 'entretien';
  }
  // Generic title, personal email + client → PRESENTATION (candidat presented to client)
  if (!titleResult && hasPersonalEmail(analysis) && analysis?.hasClients) {
    return 'presentation';
  }
  // Generic title but has external non-personal emails (unknown company) → COMMERCIAL
  if (!titleResult && analysis?.hasExternals && !analysis.allInternal && !hasPersonalEmail(analysis)) {
    return 'commercial';
  }
  return null;
}

// ─── MAIN CATEGORIZATION ───────────────────────────

export function categorizeEvent(event: EnrichedCalendarEvent): CategorizedEvent {
  const isCancelled =
    event.status === 'cancelled' ||
    (event.title?.toLowerCase().startsWith('canceled') ?? false);

  // Priority 1: Manual override
  const override = getManualOverride(event.id);
  if (override) {
    return {
      ...event,
      meetingType: override,
      meetingTypeLabel: MEETING_LABELS[override],
      isOverridden: true,
      isCancelled,
    };
  }

  // Priority 2: Description tags ([PRES], [COMMERCIAL], [INTERNE])
  const descTag = detectDescriptionTag(event.description);
  if (descTag) {
    return { ...event, meetingType: descTag, meetingTypeLabel: MEETING_LABELS[descTag], isOverridden: false, isCancelled };
  }

  // Priority 3: Title keywords
  const titleResult = detectTitleKeyword(event.title);

  // Priority 4: Attendee analysis
  const attendeeResult = detectFromAttendees(event.attendeeAnalysis);

  // Priority 5: Combined signals
  const combined = combinedSignal(titleResult, attendeeResult, event.attendeeAnalysis);

  // Resolution: combined > title > attendee > 'other'
  const finalType = combined ?? titleResult ?? attendeeResult ?? 'other';

  return {
    ...event,
    meetingType: finalType,
    meetingTypeLabel: MEETING_LABELS[finalType],
    isOverridden: false,
    isCancelled,
  };
}

// ─── BATCH & KPI HELPERS ───────────────────────────

export function categorizeEvents(events: EnrichedCalendarEvent[]): CategorizedEvent[] {
  return events.map(categorizeEvent);
}

export function countByType(events: CategorizedEvent[]): Record<MeetingType, number> {
  const active = events.filter((e) => !e.isCancelled);
  return {
    presentation: active.filter((e) => e.meetingType === 'presentation').length,
    entretien: active.filter((e) => e.meetingType === 'entretien').length,
    commercial: active.filter((e) => e.meetingType === 'commercial').length,
    weekly_client: active.filter((e) => e.meetingType === 'weekly_client').length,
    nouveau_client: active.filter((e) => e.meetingType === 'nouveau_client').length,
    other: active.filter((e) => e.meetingType === 'other').length,
  };
}
