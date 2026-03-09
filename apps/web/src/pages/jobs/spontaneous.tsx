/**
 * Candidature spontanée.
 * URL: /jobs/candidature-spontanee
 */

import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, Upload, Loader2, CheckCircle2, ArrowRight, Linkedin } from 'lucide-react';
import { publicPost } from '../../lib/public-api';

const AVAILABILITY_OPTIONS = [
  { value: 'immediate', label: 'Immédiate' },
  { value: '1_month', label: '1 mois' },
  { value: '3_months', label: '3 mois' },
  { value: 'passive', label: 'En veille' },
];

const JOB_TYPE_OPTIONS = [
  { value: '', label: 'Sélectionnez...' },
  { value: 'sales_ae', label: 'Sales / Account Executive' },
  { value: 'management_commercial', label: 'Management Commercial' },
  { value: 'business_dev', label: 'Business Development' },
  { value: 'direction_commerciale', label: 'Direction Commerciale' },
  { value: 'autre', label: 'Autre' },
];

export default function SpontaneousApplicationPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    salaryCurrent: '',
    currentCompany: '',
    availability: '',
    jobTypeSought: '',
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.firstName || !form.lastName || !form.email) {
      setError('Veuillez remplir les champs obligatoires');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('firstName', form.firstName);
      formData.append('lastName', form.lastName);
      formData.append('email', form.email);
      if (form.phone) formData.append('phone', form.phone);
      if (form.linkedinUrl) formData.append('linkedinUrl', form.linkedinUrl);
      if (form.salaryCurrent) formData.append('salaryCurrent', form.salaryCurrent);
      if (form.currentCompany) formData.append('currentCompany', form.currentCompany);
      if (form.availability) formData.append('availability', form.availability);
      if (form.jobTypeSought) formData.append('jobTypeSought', form.jobTypeSought);
      if (cvFile) formData.append('cv', cvFile);

      await publicPost('/jobs/spontaneous', formData);
      navigate(`/jobs/confirmation?name=${encodeURIComponent(form.firstName)}&title=Candidature+spontan%C3%A9e`);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header className="glass sticky top-0 z-10 border-b border-white/30">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/jobs" className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
            <ArrowLeft size={16} /> Retour aux offres
          </Link>
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="HumanUp" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>HumanUp</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[#1a1a2e] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>Candidature spontanée</h1>
          <p className="text-neutral-500">
            Envoyez-nous votre CV. Nous vous contacterons si une opportunite correspond a votre profil.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Prenom *</label>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Nom *</label>
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email *</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Telephone</label>
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                <span className="inline-flex items-center gap-1.5">
                  <Linkedin size={14} className="text-[#0A66C2]" /> Profil LinkedIn
                </span>
              </label>
              <input
                name="linkedinUrl"
                value={form.linkedinUrl}
                onChange={handleChange}
                placeholder="https://linkedin.com/in/votre-profil"
                className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Salaire actuel</label>
                <input
                  name="salaryCurrent"
                  value={form.salaryCurrent}
                  onChange={handleChange}
                  placeholder="ex: 55k"
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Entreprise actuelle</label>
                <input
                  name="currentCompany"
                  value={form.currentCompany}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {/* Job type sought */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Type de poste recherche</label>
              <select
                name="jobTypeSought"
                value={form.jobTypeSought}
                onChange={handleChange}
                className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              >
                {JOB_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Availability */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Disponibilite</label>
              <div className="flex flex-wrap gap-3">
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-all ${
                      form.availability === opt.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium shadow-sm'
                        : 'border-white/50 bg-white/60 text-neutral-600 hover:border-primary-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="availability"
                      value={opt.value}
                      checked={form.availability === opt.value}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* CV Upload */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">CV (PDF)</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  cvFile
                    ? 'border-primary-400 bg-primary-50/50'
                    : 'border-white/60 hover:border-primary-300 bg-white/40'
                }`}
              >
                {cvFile ? (
                  <div className="flex items-center justify-center gap-2 text-primary-600">
                    <CheckCircle2 size={20} />
                    <span className="text-sm font-medium">{cvFile.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="mx-auto mb-2 text-neutral-400" />
                    <p className="text-sm text-neutral-500">Cliquez ou glissez votre CV ici (PDF)</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full gradient-btn rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Envoi en cours...</>
              ) : (
                <>Envoyer ma candidature <ArrowRight size={14} /></>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
