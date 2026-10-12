import { t, LOCALE } from './i18n';

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
      if (futureDays === 0) return t("aujourd'hui");
      if (futureDays === 1) return t('demain');
      if (futureDays <= 7) return t('dans {n}j', { n: futureDays });
      return formatAbsolute(date);
    }

    // Past dates
    if (diffMin < 1) return t("à l'instant");
    if (diffMin < 60) return t('il y a {n}min', { n: diffMin });
    if (diffHours < 24) return t('il y a {n}h', { n: diffHours });
    if (diffDays === 0) return t("aujourd'hui");
    if (diffDays === 1) return t('hier');
    if (diffDays <= 7) return t('il y a {n}j', { n: diffDays });
    if (diffDays <= 30) return t('il y a {n}sem', { n: Math.floor(diffDays / 7) });
    return formatAbsolute(date);
  } catch {
    return '—';
  }
}

function formatAbsolute(date: Date): string {
  return date.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format as relative for dashboard tasks (shows urgency).
 * "En retard de 3j" / "Aujourd'hui" / "Dans 2j"
 */
export function formatTaskDue(dateStr: string | null | undefined): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!dateStr) return { text: t('Pas de date'), isOverdue: false, isToday: false };
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

    if (diffDays < 0) return { text: t('En retard {n}j', { n: Math.abs(diffDays) }), isOverdue: true, isToday: false };
    if (diffDays === 0) return { text: t("Aujourd'hui"), isOverdue: false, isToday: true };
    if (diffDays === 1) return { text: t('Demain'), isOverdue: false, isToday: false };
    if (diffDays <= 7) return { text: t('Dans {n}j', { n: diffDays }), isOverdue: false, isToday: false };
    return { text: formatAbsolute(date), isOverdue: false, isToday: false };
  } catch {
    return { text: '—', isOverdue: false, isToday: false };
  }
}
