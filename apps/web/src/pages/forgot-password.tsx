import { useState } from 'react';
import { api } from '../lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500 text-white font-bold text-lg">
            H
          </div>
          <h1 className="text-[22px] font-bold text-neutral-900">Réinitialisation</h1>
          <p className="mt-1 text-[13px] text-neutral-500">Réinitialisez votre mot de passe</p>
        </div>

        {sent ? (
          <div className="text-center">
            <p className="text-sm text-neutral-900">Si cet email existe dans notre système, un lien de réinitialisation a été envoyé.</p>
            <a href="/login" className="mt-4 inline-block text-sm font-medium text-primary-500 hover:text-primary-700">Retour à la connexion</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-4 py-3 text-sm outline-none transition-all placeholder:text-neutral-300 focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
                placeholder="vous@humanup.io"
                required
              />
            </div>
            <button type="submit" disabled={isLoading} className="w-full rounded-xl gradient-btn px-4 py-3 text-sm font-semibold text-white shadow-md shadow-primary-500/25 transition-all hover:shadow-lg hover:shadow-primary-500/30 disabled:opacity-50">
              {isLoading ? 'Envoi...' : 'Envoyer le lien'}
            </button>
            <div className="text-center">
              <a href="/login" className="text-sm font-medium text-primary-500 hover:text-primary-700">Retour à la connexion</a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
