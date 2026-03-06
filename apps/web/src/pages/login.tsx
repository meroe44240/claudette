import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.data?.message || 'Email ou mot de passe incorrect');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 animated-gradient items-center justify-center p-12 relative overflow-hidden grain">
        <div className="absolute inset-0 opacity-10">
          <motion.div
            animate={{ x: [0, 15, 0], y: [0, -15, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-20 left-20 h-64 w-64 rounded-full bg-white/20 blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -15, 0], y: [0, 15, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute bottom-20 right-20 h-80 w-80 rounded-full bg-primary-300/20 blur-3xl"
          />
          <motion.div
            animate={{ x: [0, 10, 0], y: [0, -10, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-primary-500/10 blur-3xl"
          />
        </div>
        <div className="relative z-10 text-center text-white">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500 shadow-glow">
            <span className="text-2xl font-bold">H</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">HumanUp</h1>
          <p className="mt-3 text-lg text-white/80">Votre plateforme de recrutement</p>
          <p className="mt-1 text-sm text-white/60">ATS & CRM tout-en-un</p>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex w-full items-center justify-center bg-bg p-8 lg:w-1/2">
        <div className="w-full max-w-md animate-fadeInUp">
          <div className="mb-8 lg:hidden text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500 text-white font-bold text-lg">
              H
            </div>
            <h1 className="text-2xl font-bold gradient-text">HumanUp</h1>
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">Connexion</h2>
          <p className="mt-2 text-sm text-neutral-500">Connectez-vous à votre espace de recrutement</p>

          <motion.form onSubmit={handleSubmit} className="mt-8 space-y-5" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {error && (
              <div className="rounded-xl bg-error-100 border border-error/20 p-4 text-sm text-error">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-4 py-3 text-sm outline-none transition-all placeholder:text-neutral-300 focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
                placeholder="vous@entreprise.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Mot de passe</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-4 py-3 text-sm outline-none transition-all placeholder:text-neutral-300 focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl gradient-btn px-4 py-3 text-sm font-semibold text-white shadow-md shadow-primary-500/25 transition-all hover:shadow-lg hover:shadow-primary-500/30 disabled:opacity-50"
            >
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </button>
            <div className="text-center">
              <a href="/forgot-password" className="text-sm font-medium text-primary-500 hover:text-primary-700">
                Mot de passe oublié ?
              </a>
            </div>
          </motion.form>
        </div>
      </div>
    </div>
  );
}
