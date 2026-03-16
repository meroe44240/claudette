/**
 * Format a date as a relative string for recent dates, absolute for older ones.
 * "il y a 2h" / "il y a 3j" / "aujourd'hui" / "demain" / "hier" / "12 mar. 2026"
 */
export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Future dates
    if (diffMs < 0) {
      const futureDays = Math.ceil(-diffMs / 86400000);
      if (futureDays === 0) return "aujourd'hui";
      if (futureDays === 1) return 'demain';
      if (futureDays <= 7) return `dans ${futureDays}j`;
      return formatAbsolute(date);
    }

    // Past dates
    if (diffMin < 1) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin}min`;
    if (diffHours < 24) return `il y a ${diffHours}h`;
    if (diffDays === 0) return "aujourd'hui";
    if (diffDays === 1) return 'hier';
    if (diffDays <= 7) return `il y a ${diffDays}j`;
    if (diffDays <= 30) return `il y a ${Math.floor(diffDays / 7)}sem`;
    return formatAbsolute(date);
  } catch {
    return '—';
  }
}

function formatAbsolute(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format as relative for dashboard tasks (shows urgency).
 * "En retard de 3j" / "Aujourd'hui" / "Dans 2j"
 */
export function formatTaskDue(dateStr: string | null | undefined): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!dateStr) return { text: 'Pas de date', isOverdue: false, isToday: false };
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) return { text: `En retard ${Math.abs(diffDays)}j`, isOverdue: true, isToday: false };
    if (diffDays === 0) return { text: "Aujourd'hui", isOverdue: false, isToday: true };
    if (diffDays === 1) return { text: 'Demain', isOverdue: false, isToday: false };
    if (diffDays <= 7) return { text: `Dans ${diffDays}j`, isOverdue: false, isToday: false };
    return { text: formatAbsolute(date), isOverdue: false, isToday: false };
  } catch {
    return { text: '—', isOverdue: false, isToday: false };
  }
}
