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
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
              <span className="text-sm font-bold text-white">H</span>
            </div>
            <span className="text-sm font-semibold text-neutral-900">HumanUp</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">
            Candidature envoyée !
          </h1>
          <p className="text-neutral-600 mb-2">
            Merci{name ? ` ${name}` : ''}, nous avons bien reçu votre candidature
            {title ? ` pour le poste de ${title}` : ''}.
          </p>
          <p className="text-sm text-neutral-500 mb-8">
            Notre équipe analyse votre profil et reviendra vers vous dans les 48h
            si votre candidature est retenue.
          </p>

          <Link
            to="/jobs"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-6 py-3 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            Voir d'autres offres <ArrowRight size={14} />
          </Link>
        </div>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 text-center">
          <p className="text-xs text-neutral-400">
            HumanUp · Cabinet de recrutement international · contact@humanup.io
          </p>
        </div>
      </footer>
    </div>
  );
}
