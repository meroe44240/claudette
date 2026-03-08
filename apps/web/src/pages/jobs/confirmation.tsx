/**
 * Application Confirmation Page.
 * URL: /jobs/confirmation?name=X&title=Y
 */

import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function JobConfirmationPage() {
  const [searchParams] = useSearchParams();
  const name = searchParams.get('name') || '';
  const title = searchParams.get('title') || '';

  return (
    <div className="min-h-screen app-bg flex flex-col">
      {/* Header */}
      <header className="glass border-b border-white/30">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="HumanUp" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>HumanUp</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a2e] mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
            Candidature envoyee !
          </h1>
          <p className="text-neutral-600 mb-2">
            Merci{name ? ` ${name}` : ''}, nous avons bien recu votre candidature
            {title ? ` pour le poste de ${title}` : ''}.
          </p>
          <p className="text-sm text-neutral-500 mb-8">
            Notre equipe analyse votre profil et reviendra vers vous dans les 48h
            si votre candidature est retenue.
          </p>

          <Link
            to="/jobs"
            className="inline-flex items-center gap-2 gradient-btn rounded-full px-6 py-3 text-sm font-medium text-white shadow-md hover:shadow-lg transition-all"
          >
            Voir d'autres offres <ArrowRight size={14} />
          </Link>
        </div>
      </main>

      <footer className="glass border-t border-white/30">
        <div className="mx-auto max-w-3xl px-6 py-4 text-center">
          <p className="text-xs text-neutral-400">
            <span className="gradient-text font-semibold">HumanUp</span> · Cabinet de recrutement international · contact@humanup.io
          </p>
        </div>
      </footer>
    </div>
  );
}
