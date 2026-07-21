/**
 * Portail client — page de login publique.
 *
 * URL : /portail/login?m=<mandatId>
 * Le mandatId vient du lien envoye au client depuis la fiche mandat
 * ("Accès portail" > URL portail).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';

interface LoginResponse {
  token: string;
  access: { id: string; mandatId: string; email: string };
}

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mandatId = params.get('m') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Portail client — HumanUp';
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandatId, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Identifiants invalides');
      }
      const data = (await res.json()) as LoginResponse;
      // Persist portal session token in sessionStorage (scope = tab)
      sessionStorage.setItem('portal_token', data.token);
      sessionStorage.setItem('portal_mandat_id', data.access.mandatId);
      sessionStorage.setItem('portal_email', data.access.email);
      navigate(`/portail/mandat/${data.access.mandatId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: '#FCFCF5' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-3xl border border-neutral-100 bg-white p-8 shadow-2xl"
        style={{ boxShadow: '0 30px 80px -30px rgba(34, 23, 122, 0.35)' }}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/brand/logo-mark-navy.png"
            alt="HumanUp"
            className="h-14 w-auto"
          />
          <h1
            className="mt-4 text-2xl"
            style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em', color: '#22177A' }}
          >
            HUMANUP
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-neutral-500">
            Portail client
          </p>
        </div>

        {!mandatId && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Ce lien est incomplet — demande à ton contact HumanUp de te renvoyer l'URL exacte.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#22177A] focus:shadow-[0_0_0_3px_rgba(34,23,122,0.1)]"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#22177A] focus:shadow-[0_0_0_3px_rgba(34,23,122,0.1)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !mandatId}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#22177A', boxShadow: '0 8px 20px -8px rgba(34,23,122,0.5)' }}
          >
            {loading ? 'Connexion…' : 'Accéder au portail'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-neutral-400">
          Session sécurisée · Valable 4h · HumanUp Recruitment Agency
        </p>
      </motion.div>
    </div>
  );
}
