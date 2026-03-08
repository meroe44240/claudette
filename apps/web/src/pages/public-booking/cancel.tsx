import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import {
  Calendar,
  Clock,
  User,
  AlertCircle,
  CheckCircle2,
  Loader2,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast, ToastContainer } from '../../components/ui/Toast';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface BookingInfo {
  date: string;
  time: string;
  duration: number;
  recruiter: {
    nom: string;
    prenom: string;
  };
  candidat: {
    prenom: string;
    nom: string;
  };
}

// ─── PUBLIC API HELPER ───────────────────────────────────────────────────────

const publicApi = {
  get: async <T,>(path: string): Promise<T> => {
    const res = await fetch(`/api/public/booking${path}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erreur reseau' }));
      throw err;
    }
    return res.json();
  },
  post: async <T,>(path: string, body: unknown): Promise<T> => {
    const res = await fetch(`/api/public/booking${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erreur reseau' }));
      throw err;
    }
    return res.json();
  },
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function BookingCancelPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  // ── Load booking info ──
  useEffect(() => {
    if (!bookingId || !token) {
      setError('Lien d\'annulation invalide.');
      setLoading(false);
      return;
    }

    publicApi
      .get<BookingInfo>(`/cancel/${bookingId}?token=${encodeURIComponent(token)}`)
      .then((data) => {
        setBooking(data);
      })
      .catch((err) => {
        setError(err.message || 'Impossible de charger les informations du rendez-vous.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [bookingId, token]);

  // ── Handle cancel ──
  const handleCancel = async () => {
    if (!bookingId || !token) return;

    setCancelling(true);
    try {
      await publicApi.post(`/cancel/${bookingId}`, { token });
      setCancelled(true);
    } catch (err: unknown) {
      const error = err as { message?: string };
      toast('error', error.message || 'Impossible d\'annuler le rendez-vous.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4">
        <div className="w-full max-w-[500px] glass-card rounded-2xl p-10 text-center">
          <Loader2 size={32} className="text-neutral-300 animate-spin mx-auto mb-4" />
          <p className="text-[14px] text-neutral-500">Chargement...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !booking) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4">
        <ToastContainer />
        <div className="w-full max-w-[500px] glass-card rounded-2xl p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-2">
            Lien invalide
          </h2>
          <p className="text-[14px] text-neutral-500">
            {error || 'Impossible de charger les informations du rendez-vous.'}
          </p>
        </div>
      </div>
    );
  }

  const displayDate = format(
    new Date(`${booking.date}T${booking.time}`),
    "EEEE d MMMM yyyy 'a' HH:mm",
    { locale: fr },
  );

  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4">
      <ToastContainer />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[500px] glass-card rounded-2xl p-10"
      >
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src="/logo-icon.png" alt="HumanUp" className="h-9 w-auto" />
          <span className="text-[17px] font-semibold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>HumanUp</span>
        </div>

        {cancelled ? (
          /* ── Cancelled confirmation ── */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
              className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-6"
            >
              <XCircle size={40} className="text-amber-500" />
            </motion.div>

            <h2 className="text-[22px] font-bold text-[#1a1a2e] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              Rendez-vous annule
            </h2>
            <p className="text-[14px] text-neutral-500 mb-4">
              Votre rendez-vous a bien ete annule. Un email de confirmation vous a ete envoye.
            </p>

            <div className="bg-white/40 backdrop-blur-sm rounded-xl p-4 text-left space-y-2 mt-4 border border-white/50">
              <div className="flex items-center gap-3 text-[14px]">
                <Calendar size={16} className="text-neutral-400 shrink-0" />
                <span className="text-neutral-600 capitalize line-through">
                  {displayDate}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[14px]">
                <User size={16} className="text-neutral-400 shrink-0" />
                <span className="text-neutral-600 line-through">
                  {booking.recruiter.prenom} {booking.recruiter.nom}
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── Cancel form ── */
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={28} className="text-amber-500" />
              </div>
              <h2 className="text-[20px] font-semibold text-[#1a1a2e] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
                Annuler le rendez-vous ?
              </h2>
              <p className="text-[14px] text-neutral-500">
                Vous etes sur le point d'annuler le rendez-vous suivant :
              </p>
            </div>

            {/* Booking details */}
            <div className="bg-white/40 backdrop-blur-sm rounded-xl p-5 mb-6 space-y-3 border border-white/50">
              <div className="flex items-center gap-3 text-[14px]">
                <Calendar size={16} className="text-neutral-400 shrink-0" />
                <span className="text-[#1a1a2e] font-medium capitalize">
                  {displayDate}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[14px]">
                <Clock size={16} className="text-neutral-400 shrink-0" />
                <span className="text-neutral-600">
                  Duree : {booking.duration} minutes
                </span>
              </div>
              <div className="flex items-center gap-3 text-[14px]">
                <User size={16} className="text-neutral-400 shrink-0" />
                <span className="text-neutral-600">
                  Avec {booking.recruiter.prenom} {booking.recruiter.nom}
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full h-11 bg-red-500 hover:bg-red-600 text-white rounded-full font-semibold text-[15px] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
              >
                {cancelling ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Annulation en cours...
                  </>
                ) : (
                  "Confirmer l'annulation"
                )}
              </button>

              <a
                href="/"
                className="w-full h-10 bg-white/60 backdrop-blur-sm border border-white/50 rounded-full font-medium text-[14px] text-neutral-600 hover:bg-white/80 transition-all flex items-center justify-center"
              >
                Retour
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-5 border-t border-white/30 text-center">
          <p className="text-[12px] text-neutral-400">
            Propulse par{' '}
            <span className="font-semibold gradient-text">HumanUp</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
