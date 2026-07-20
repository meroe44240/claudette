import { Link } from 'react-router';
import { BarChart3, Award, TrendingUp, Users, AlertTriangle, FileText, Briefcase } from 'lucide-react';

/**
 * Admin-only analytics hub.
 *
 * Groups all the analytics pages that used to be scattered in the sidebar
 * (leaderboard, placements, revenue forecast, pipeline intelligence, alerts,
 * reports, clients pipeline) into a single card grid. Each card links to
 * the existing standalone page — those still work, they're just no longer
 * cluttering the main nav.
 */

interface AnalyticsCard {
  to: string;
  label: string;
  description: string;
  icon: typeof BarChart3;
}

const CARDS: AnalyticsCard[] = [
  {
    to: '/leaderboard',
    label: 'Leaderboard équipe',
    description: 'Classement des recruteurs sur la période courante — activité, placements, CA.',
    icon: Award,
  },
  {
    to: '/placements',
    label: 'Placements & suivi',
    description: 'Suivi post-embauche : check-in 7j / 1m / 3m / 6m après le closing.',
    icon: Users,
  },
  {
    to: '/revenue-forecast',
    label: 'Forecast revenus',
    description: 'Projection du CA sur 6 mois basée sur les mandats actifs et leur maturité.',
    icon: TrendingUp,
  },
  {
    to: '/pipeline-intelligence',
    label: 'Pipeline intelligence',
    description: 'Health score des mandats (GREEN / AMBER / RED) + signaux à traiter.',
    icon: BarChart3,
  },
  {
    to: '/alerts',
    label: 'Alertes automatisées',
    description: 'Mandats dormants, deals qui stagnent, deadlines proches.',
    icon: AlertTriangle,
  },
  {
    to: '/reports',
    label: 'Rapports client / mandat',
    description: 'Génération de rapports HTML partageables — client ou mandat spécifique.',
    icon: FileText,
  },
  {
    to: '/clients/pipeline',
    label: 'Pipeline commercial clients',
    description: 'Kanban des clients par statut : LEAD → PREMIER_CONTACT → BESOIN_QUALIFIÉ → PROPOSITION → MANDAT_SIGNÉ → RÉCURRENT.',
    icon: Briefcase,
  },
];

export default function AdminAnalyticsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary">Analytics</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Vues d'analyse regroupées pour l'admin. La plupart des KPIs quotidiens
          restent accessibles depuis le dashboard principal ou via Claude (MCP).
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="group flex flex-col rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm transition-all duration-200 hover:border-primary-200 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600 transition-colors group-hover:bg-primary-100">
              <card.icon size={22} strokeWidth={1.75} />
            </div>
            <h2 className="mb-2 text-base font-semibold text-text-primary">{card.label}</h2>
            <p className="text-sm text-text-secondary">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
