import { NavLink } from 'react-router';
import { t, LOCALE } from '../../lib/i18n';

export const eur = (n: number) => `${Math.round(n).toLocaleString(LOCALE)} €`;
export const signedEur = (n: number) => `${n > 0 ? '+' : ''}${eur(n)}`;
export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
export const dayLabel = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString(LOCALE, { timeZone: 'UTC' }) : '');

export const ENTITY_LABEL: Record<string, string> = {
  COURTSIDE_CAPITAL_HK: 'Courtside Capital (HK)',
  HUMANUP_LONDON: 'Humanup Executive Search Ltd (Londres)',
  HUMANUP_VIET: 'Humanup Viet',
};
export const STATUS_LABEL: Record<string, string> = {
  A_FACTURER: 'À facturer',
  EMISE: 'Émise',
  PAYEE_PARTIEL: 'Payée en partie',
  PAYEE: 'Payée',
  ANNULEE: 'Annulée',
};
export const STATUS_STYLE: Record<string, string> = {
  A_FACTURER: 'bg-neutral-100 text-neutral-700',
  EMISE: 'bg-blue-50 text-blue-700',
  PAYEE_PARTIEL: 'bg-amber-50 text-amber-800',
  PAYEE: 'bg-emerald-50 text-emerald-700',
  ANNULEE: 'bg-neutral-100 text-neutral-400 line-through',
};

const TABS: Array<[string, string]> = [
  ['/admin/forecast', 'Pipe partagé'],
  ['/admin/forecast/tresorerie', 'Trésorerie'],
  ['/admin/forecast/factures', 'Factures'],
  ['/admin/forecast/reglages', 'Réglages'],
];

/** Navigation entre les pages du forecast (admin). */
export default function ForecastTabs() {
  return (
    <nav className="flex gap-1 rounded-lg border border-neutral-200 bg-white p-0.5 text-[13px]">
      {TABS.map(([to, label]) => (
        <NavLink key={to} to={to} end
          className={({ isActive }) => `rounded-md px-3 py-1 ${isActive ? 'bg-[#22177A] font-semibold text-[#E6E9AF]' : 'text-neutral-600 hover:bg-neutral-50'}`}>
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );
}
