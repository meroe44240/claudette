import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../lib/api-client';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      navigate('/login');
    } catch (err: any) {
      setError(err.data?.message || 'Erreur lors de la réinitialisation');
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
          <h1 className="text-[22px] font-bold text-neutral-900">Nouveau mot de passe</h1>
          <p className="mt-1 text-[13px] text-neutral-500">Choisissez votre nouveau mot de passe</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl bg-error-100 border border-error/20 p-4 text-sm text-error">{error}</div>}
          <div>
            <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Nouveau mot de passe</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-4 py-3 text-sm outline-none transition-all placeholder:text-neutral-300 focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
              placeholder="Min 8 caractères, 1 majuscule, 1 chiffre"
              required
              minLength={8}
            />
          </div>
          <button type="submit" disabled={isLoading} className="w-full rounded-xl gradient-btn px-4 py-3 text-sm font-semibold text-white shadow-md shadow-primary-500/25 transition-all hover:shadow-lg hover:shadow-primary-500/30 disabled:opacity-50">
            {isLoading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
          </button>
        </form>
      </div>
    </div>
  );
}
