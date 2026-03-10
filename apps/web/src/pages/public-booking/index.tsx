import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  User,
  Mail,
  Phone,
  Building2,
  MapPin,
  Banknote,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  Briefcase,
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isBefore,
  isAfter,
  isSameDay,
  isWeekend,
  startOfDay,
  addDays,
  getDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast, ToastContainer } from '../../components/ui/Toast';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface RecruiterInfo {
  recruiter: {
    nom: string;
    prenom: string;
    email: string;
    avatarUrl?: string | null;
  };
  settings: {
    slotDuration: number;
    welcomeMessage?: string;
    maxAdvanceDays?: number;
  };
  mandat?: {
    titrePoste: string;
    entreprise: {
      nom: string;
      secteur?: string;
    };
    salaryRange?: string;
    pitchPoints?: string[];
    localisation?: string;
  };
  bookingType?: {
    slug: string;
    label: string;
    durationMinutes: number;
    targetType: string; // 'candidate' or 'client'
  };
}

// Duration options per booking type
const CANDIDAT_DURATIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];
const CLIENT_DURATIONS = [
  { value: 45, label: '45 min' },
  { value: 60, label: '1 heure' },
];

interface Slot {
  time: string;
}

interface BookingFormData {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  entrepriseActuelle: string;
  salaireActuel: string;
  disponibilite: string;
  processConcurrents: string;
  typeRdv: string;
  message: string;
  honeypot: string;
}

interface BookingConfirmation {
  date: string;
  time: string;
  duration: number;
  recruiterName: string;
  candidateEmail: string;
  bookingId: string;
}

interface FormErrors {
  [key: string]: string;
}

type BookingStep = 'calendar' | 'form' | 'confirmation';

// ─── PUBLIC API HELPER ───────────────────────────────────────────────────────

const publicApi = {
  get: async <T,>(path: string): Promise<T> => {
    const res = await fetch(`/api/public/booking${path}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Erreur réseau' }));
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
      const err = await res.json().catch(() => ({ message: 'Erreur réseau' }));
      throw err;
    }
    return res.json();
  },
};

// ─── UTILS ───────────────────────────────────────────────────────────────────

function buildGoogleCalendarUrl(
  date: string,
  time: string,
  duration: number,
  recruiterName: string,
): string {
  const startDate = new Date(`${date}T${time}`);
  const endDate = new Date(startDate.getTime() + duration * 60_000);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `RDV avec ${recruiterName}`,
    dates: `${fmt(startDate)}/${fmt(endDate)}`,
    details: `Rendez-vous de recrutement avec ${recruiterName} via HumanUp`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildOutlookIcsUrl(
  date: string,
  time: string,
  duration: number,
  recruiterName: string,
): string {
  const startDate = new Date(`${date}T${time}`);
  const endDate = new Date(startDate.getTime() + duration * 60_000);

  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(startDate)}`,
    `DTEND:${fmt(endDate)}`,
    `SUMMARY:RDV avec ${recruiterName}`,
    `DESCRIPTION:Rendez-vous de recrutement avec ${recruiterName} via HumanUp`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone: string): boolean {
  return /^[\d\s+()./-]{6,20}$/.test(phone);
}

// ─── HEADER COMPONENT ────────────────────────────────────────────────────────

function BookingHeader({
  recruiter,
}: {
  recruiter: RecruiterInfo;
}) {
  return (
    <div className="text-center mb-8">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <img src="/logo-icon.png" alt="HumanUp" className="h-9 w-auto" />
        <span className="text-[17px] font-semibold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>HumanUp</span>
      </div>

      {/* Recruiter avatar */}
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#7C5CFC] flex items-center justify-center mx-auto mb-4">
        <span className="text-white font-bold text-xl">
          {recruiter.recruiter.prenom[0]}
          {recruiter.recruiter.nom[0]}
        </span>
      </div>

      <h1 className="text-[24px] font-semibold text-[#1a1a2e] mb-1">
        {recruiter.recruiter.prenom} {recruiter.recruiter.nom}
      </h1>
      <p className="text-[15px] text-neutral-500">
        Prenez rendez-vous en quelques clics
      </p>

      {recruiter.settings.welcomeMessage && (
        <p className="mt-3 text-[14px] text-neutral-500 leading-relaxed max-w-md mx-auto">
          {recruiter.settings.welcomeMessage}
        </p>
      )}
    </div>
  );
}

// ─── MANDAT PITCH CARD ──────────────────────────────────────────────────────

function MandatPitchCard({ mandat }: { mandat: NonNullable<RecruiterInfo['mandat']> }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mb-8 bg-primary-50 border-l-4 border-primary-500 rounded-xl p-5"
    >
      <div className="flex items-start gap-3 mb-3">
        <Briefcase size={18} className="text-primary-500 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-[#1a1a2e] text-[15px]">
            {mandat.titrePoste}
          </h3>
          <p className="text-[13px] text-neutral-500 mt-0.5">
            {mandat.entreprise.nom}
            {mandat.entreprise.secteur && ` - ${mandat.entreprise.secteur}`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-neutral-600 mb-3">
        {mandat.localisation && (
          <span className="flex items-center gap-1.5">
            <MapPin size={14} className="text-primary-500" />
            {mandat.localisation}
          </span>
        )}
        {mandat.salaryRange && (
          <span className="flex items-center gap-1.5">
            <Banknote size={14} className="text-primary-500" />
            {mandat.salaryRange}
          </span>
        )}
      </div>

      {mandat.pitchPoints && mandat.pitchPoints.length > 0 && (
        <ul className="space-y-1.5 mt-3">
          {mandat.pitchPoints.map((point, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[13px] text-neutral-700"
            >
              <CheckCircle2
                size={14}
                className="text-primary-500 mt-0.5 shrink-0"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

// ─── CALENDAR COMPONENT ─────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

function BookingCalendar({
  selectedDate,
  onSelectDate,
  maxAdvanceDays = 60,
}: {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  maxAdvanceDays?: number;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDate = useMemo(() => addDays(today, maxAdvanceDays), [today, maxAdvanceDays]);

  const canGoPrev = useMemo(
    () => !isBefore(startOfMonth(subMonths(currentMonth, 1)), startOfMonth(today)),
    [currentMonth, today],
  );
  const canGoNext = useMemo(
    () => isBefore(startOfMonth(addMonths(currentMonth, 1)), addMonths(startOfMonth(maxDate), 1)),
    [currentMonth, maxDate],
  );

  const weekdays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    return allDays.filter((d) => !isWeekend(d));
  }, [currentMonth]);

  // Build grid: 5 columns (Mon-Fri), fill in blanks for first week offset
  const calendarGrid = useMemo(() => {
    if (weekdays.length === 0) return [];

    const firstDay = weekdays[0];
    // getDay: 0=Sun, 1=Mon ... 6=Sat
    // We want Mon=0, Tue=1, ..., Fri=4
    const dayOfWeek = getDay(firstDay);
    const offset = dayOfWeek === 0 ? 4 : dayOfWeek - 1; // Mon=0

    const grid: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) {
      grid.push(null);
    }
    weekdays.forEach((d) => grid.push(d));

    return grid;
  }, [weekdays]);

  const isDayAvailable = useCallback(
    (date: Date) => {
      if (isBefore(date, today)) return false;
      if (isAfter(date, maxDate)) return false;
      return true;
    },
    [today, maxDate],
  );

  return (
    <div>
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => canGoPrev && setCurrentMonth(subMonths(currentMonth, 1))}
          disabled={!canGoPrev}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Mois precedent"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-[15px] font-semibold text-[#1a1a2e] capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: fr })}
        </h3>
        <button
          onClick={() => canGoNext && setCurrentMonth(addMonths(currentMonth, 1))}
          disabled={!canGoNext}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Mois suivant"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="text-center text-[12px] font-medium text-neutral-400 py-1"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-5 gap-1">
        {calendarGrid.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="h-10" />;
          }

          const available = isDayAvailable(date);
          const isSelected = selectedDate && isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);

          return (
            <button
              key={date.toISOString()}
              onClick={() => available && onSelectDate(date)}
              disabled={!available}
              className={`
                h-10 rounded-lg text-[14px] font-semibold transition-all relative
                ${
                  isSelected
                    ? 'bg-primary-500 text-white shadow-md'
                    : available
                      ? 'text-[#1a1a2e] hover:bg-primary-50 hover:text-primary-600 cursor-pointer'
                      : 'text-neutral-300 cursor-not-allowed'
                }
              `}
            >
              {format(date, 'd')}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── SLOT PICKER COMPONENT ──────────────────────────────────────────────────

function SlotPicker({
  slots,
  selectedSlot,
  onSelectSlot,
  loading,
  selectedDate,
}: {
  slots: Slot[];
  selectedSlot: string | null;
  onSelectSlot: (time: string) => void;
  loading: boolean;
  selectedDate: Date;
}) {
  if (loading) {
    return (
      <div className="mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-neutral-400" />
          <span className="text-[14px] font-medium text-neutral-500">
            Chargement des creneaux...
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-lg bg-neutral-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock size={16} className="text-neutral-400" />
        <span className="text-[14px] font-medium text-neutral-500">
          {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
        </span>
      </div>

      {slots.length === 0 ? (
        <div className="text-center py-6">
          <AlertCircle size={24} className="text-neutral-300 mx-auto mb-2" />
          <p className="text-[14px] text-neutral-400">
            Aucun creneau disponible pour cette date
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {slots.map((slot) => {
            const isSelected = selectedSlot === slot.time;
            return (
              <button
                key={slot.time}
                onClick={() => onSelectSlot(slot.time)}
                className={`
                  h-9 rounded-lg text-[13px] font-medium border transition-all
                  ${
                    isSelected
                      ? 'bg-primary-500 text-white border-blue-500 shadow-md'
                      : 'bg-white text-[#1a1a2e] border-neutral-200 hover:bg-primary-50 hover:border-primary-300'
                  }
                `}
              >
                {slot.time}
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── BOOKING FORM COMPONENT ─────────────────────────────────────────────────

const DISPONIBILITE_OPTIONS = [
  'Immediate',
  'Sous 1 mois',
  'Sous 3 mois',
  'En veille',
];

const PROCESS_OPTIONS = [
  { value: 'non', label: 'Non' },
  { value: 'oui_debut', label: 'Oui debut' },
  { value: 'oui_avance', label: 'Oui avance' },
];

const TYPE_RDV_OPTIONS = [
  { value: 'candidat', label: 'Candidat' },
  { value: 'client', label: 'Client' },
];

function BookingForm({
  recruiter,
  selectedDate,
  selectedSlot,
  hasMandatSlug,
  bookingType,
  onSubmit,
  onBack,
  submitting,
}: {
  recruiter: RecruiterInfo;
  selectedDate: Date;
  selectedSlot: string;
  hasMandatSlug: boolean;
  bookingType?: 'candidat' | 'client' | '';
  onSubmit: (data: BookingFormData) => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<BookingFormData>({
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    entrepriseActuelle: '',
    salaireActuel: '',
    disponibilite: '',
    processConcurrents: '',
    typeRdv: hasMandatSlug ? 'candidat' : '',
    message: '',
    honeypot: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const updateField = (field: keyof BookingFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!form.prenom.trim()) newErrors.prenom = 'Le prenom est requis';
    if (!form.nom.trim()) newErrors.nom = 'Le nom est requis';
    if (!form.email.trim()) {
      newErrors.email = "L'email est requis";
    } else if (!validateEmail(form.email)) {
      newErrors.email = "L'email n'est pas valide";
    }
    if (!form.telephone.trim()) {
      newErrors.telephone = 'Le telephone est requis';
    } else if (!validatePhone(form.telephone)) {
      newErrors.telephone = "Le numero n'est pas valide";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(form);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onSubmit={handleSubmit}
      className="space-y-5"
    >
      {/* Back + Summary */}
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-3 text-[14px]">
          <span className="flex items-center gap-1.5 text-neutral-500">
            <Calendar size={14} />
            {format(selectedDate, 'EEE d MMM', { locale: fr })}
          </span>
          <span className="text-neutral-300">|</span>
          <span className="flex items-center gap-1.5 text-neutral-500">
            <Clock size={14} />
            {selectedSlot}
          </span>
          <span className="text-neutral-300">|</span>
          <span className="text-neutral-400 text-[13px]">
            {recruiter.settings.slotDuration} min
          </span>
        </div>
      </div>

      <h3 className="text-[17px] font-semibold text-[#1a1a2e]">
        Vos informations
      </h3>

      {/* Honeypot - hidden field */}
      <input
        type="text"
        name="website"
        value={form.honeypot}
        onChange={(e) => updateField('honeypot', e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="absolute opacity-0 h-0 w-0 pointer-events-none"
        aria-hidden="true"
      />

      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <FormInput
          label="Prenom"
          required
          icon={<User size={16} />}
          value={form.prenom}
          onChange={(v) => updateField('prenom', v)}
          error={errors.prenom}
          placeholder="Jean"
        />
        <FormInput
          label="Nom"
          required
          icon={<User size={16} />}
          value={form.nom}
          onChange={(v) => updateField('nom', v)}
          error={errors.nom}
          placeholder="Dupont"
        />
      </div>

      {/* Email */}
      <FormInput
        label="Email"
        required
        type="email"
        icon={<Mail size={16} />}
        value={form.email}
        onChange={(v) => updateField('email', v)}
        error={errors.email}
        placeholder="jean@exemple.com"
      />

      {/* Phone */}
      <FormInput
        label="Telephone"
        required
        type="tel"
        icon={<Phone size={16} />}
        value={form.telephone}
        onChange={(v) => updateField('telephone', v)}
        error={errors.telephone}
        placeholder="06 12 34 56 78"
      />

      {/* Entreprise */}
      <FormInput
        label={bookingType === 'client' ? 'Entreprise' : 'Entreprise actuelle'}
        icon={<Building2 size={16} />}
        value={form.entrepriseActuelle}
        onChange={(v) => updateField('entrepriseActuelle', v)}
        placeholder="Facultatif"
      />

      {/* Candidat-specific fields (hidden for client bookings) */}
      {bookingType !== 'client' && (
        <>
          {/* Salaire actuel */}
          <FormInput
            label="Salaire actuel"
            icon={<Banknote size={16} />}
            value={form.salaireActuel}
            onChange={(v) => updateField('salaireActuel', v)}
            placeholder="Facultatif"
            suffix="/an"
          />

          {/* Disponibilite */}
          <div>
            <label className="block text-[13px] font-medium text-neutral-600 mb-2">
              Disponibilite
            </label>
            <div className="flex flex-wrap gap-2">
              {DISPONIBILITE_OPTIONS.map((opt) => (
                <RadioPill
                  key={opt}
                  label={opt}
                  selected={form.disponibilite === opt}
                  onClick={() => updateField('disponibilite', opt)}
                />
              ))}
            </div>
          </div>

          {/* Process concurrents */}
          <div>
            <label className="block text-[13px] font-medium text-neutral-600 mb-2">
              Process concurrents
            </label>
            <div className="flex flex-wrap gap-2">
              {PROCESS_OPTIONS.map((opt) => (
                <RadioPill
                  key={opt.value}
                  label={opt.label}
                  selected={form.processConcurrents === opt.value}
                  onClick={() => updateField('processConcurrents', opt.value)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Type de RDV - only if no mandatSlug and no bookingType from URL */}
      {!hasMandatSlug && !bookingType && (
        <div>
          <label className="block text-[13px] font-medium text-neutral-600 mb-2">
            Type de rendez-vous
          </label>
          <div className="flex gap-2">
            {TYPE_RDV_OPTIONS.map((opt) => (
              <RadioPill
                key={opt.value}
                label={opt.label}
                selected={form.typeRdv === opt.value}
                onClick={() => updateField('typeRdv', opt.value)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Message */}
      <div>
        <label className="block text-[13px] font-medium text-neutral-600 mb-2">
          Message (facultatif)
        </label>
        <textarea
          value={form.message}
          onChange={(e) => updateField('message', e.target.value)}
          rows={3}
          placeholder="Un message pour le recruteur..."
          className="w-full px-3 py-2.5 text-[14px] border border-neutral-200 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none resize-none transition-all placeholder:text-neutral-300"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full h-11 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-semibold text-[15px] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Confirmation en cours...
          </>
        ) : (
          <>
            Confirmer le rendez-vous
            <ChevronRight size={16} />
          </>
        )}
      </button>
    </motion.form>
  );
}

// ─── FORM INPUT COMPONENT ───────────────────────────────────────────────────

function FormInput({
  label,
  required,
  type = 'text',
  icon,
  value,
  onChange,
  error,
  placeholder,
  suffix,
}: {
  label: string;
  required?: boolean;
  type?: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-neutral-600 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            w-full h-10 text-[14px] border rounded-lg outline-none transition-all placeholder:text-neutral-300
            ${icon ? 'pl-9' : 'pl-3'}
            ${suffix ? 'pr-12' : 'pr-3'}
            ${
              error
                ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
                : 'border-neutral-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100'
            }
          `}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1 text-[12px] text-red-500 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── RADIO PILL COMPONENT ───────────────────────────────────────────────────

function RadioPill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        h-9 px-4 rounded-lg text-[13px] font-medium border transition-all
        ${
          selected
            ? 'bg-primary-500 text-white border-blue-500'
            : 'bg-white text-neutral-600 border-neutral-200 hover:bg-primary-50 hover:border-primary-300'
        }
      `}
    >
      {label}
    </button>
  );
}

// ─── CONFIRMATION COMPONENT ─────────────────────────────────────────────────

function BookingConfirmationView({
  confirmation,
}: {
  confirmation: BookingConfirmation;
}) {
  const googleCalUrl = buildGoogleCalendarUrl(
    confirmation.date,
    confirmation.time,
    confirmation.duration,
    confirmation.recruiterName,
  );

  const outlookUrl = buildOutlookIcsUrl(
    confirmation.date,
    confirmation.time,
    confirmation.duration,
    confirmation.recruiterName,
  );

  const displayDate = format(
    new Date(`${confirmation.date}T${confirmation.time}`),
    "EEEE d MMMM yyyy 'a' HH:mm",
    { locale: fr },
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="text-center py-4"
    >
      {/* Animated check */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6"
      >
        <CheckCircle2 size={40} className="text-green-500" />
      </motion.div>

      <h2 className="text-[22px] font-bold text-[#1a1a2e] mb-2">
        Rendez-vous confirme !
      </h2>

      <div className="bg-neutral-50 rounded-xl p-5 mt-6 mb-6 text-left space-y-3">
        <div className="flex items-center gap-3 text-[14px]">
          <Calendar size={16} className="text-neutral-400 shrink-0" />
          <span className="text-[#1a1a2e] capitalize">{displayDate}</span>
        </div>
        <div className="flex items-center gap-3 text-[14px]">
          <Clock size={16} className="text-neutral-400 shrink-0" />
          <span className="text-neutral-600">
            Duree : {confirmation.duration} minutes
          </span>
        </div>
        <div className="flex items-center gap-3 text-[14px]">
          <User size={16} className="text-neutral-400 shrink-0" />
          <span className="text-neutral-600">{confirmation.recruiterName}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[13px] text-neutral-500 mb-6">
        <Mail size={14} />
        <span>
          Un email de confirmation a ete envoye a{' '}
          <strong className="text-[#1a1a2e]">{confirmation.candidateEmail}</strong>
        </span>
      </div>

      <div className="flex gap-3">
        <a
          href={googleCalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 h-10 bg-white border border-neutral-200 rounded-lg flex items-center justify-center gap-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-all"
        >
          <Calendar size={14} />
          Google Calendar
          <ExternalLink size={12} className="text-neutral-400" />
        </a>
        <a
          href={outlookUrl}
          download="rendez-vous.ics"
          className="flex-1 h-10 bg-white border border-neutral-200 rounded-lg flex items-center justify-center gap-2 text-[13px] font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-all"
        >
          <Calendar size={14} />
          Outlook / iCal
          <ExternalLink size={12} className="text-neutral-400" />
        </a>
      </div>
    </motion.div>
  );
}

// ─── LOADING SKELETON ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[600px] glass-card rounded-2xl p-10">
        {/* Logo skeleton */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-full bg-neutral-100 animate-pulse" />
          <div className="w-24 h-5 rounded bg-neutral-100 animate-pulse" />
        </div>

        {/* Avatar skeleton */}
        <div className="w-16 h-16 rounded-full bg-neutral-100 animate-pulse mx-auto mb-4" />
        <div className="w-40 h-6 rounded bg-neutral-100 animate-pulse mx-auto mb-2" />
        <div className="w-56 h-4 rounded bg-neutral-100 animate-pulse mx-auto mb-8" />

        {/* Calendar skeleton */}
        <div className="w-32 h-5 rounded bg-neutral-100 animate-pulse mx-auto mb-4" />
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 25 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-neutral-100 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ERROR STATE ─────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[600px] glass-card rounded-2xl p-10 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} className="text-red-400" />
        </div>
        <h2 className="text-[18px] font-semibold text-[#1a1a2e] mb-2">
          Page introuvable
        </h2>
        <p className="text-[14px] text-neutral-500">{message}</p>
      </div>
    </div>
  );
}

// ─── MAIN PAGE COMPONENT ────────────────────────────────────────────────────

export default function PublicBookingPage() {
  const { slug, mandatSlug } = useParams<{ slug: string; mandatSlug?: string }>();
  const [searchParams] = useSearchParams();

  // Determine booking type from URL: ?type=candidat or ?type=client
  const urlBookingType = (searchParams.get('type') || '') as 'candidat' | 'client' | '';
  // Will be overridden if API returns a bookingType from the slug
  const [resolvedBookingType, setResolvedBookingType] = useState<'candidat' | 'client' | ''>(urlBookingType);
  const [fixedDuration, setFixedDuration] = useState<number | null>(null);
  const bookingType = resolvedBookingType;
  const durationOptions = fixedDuration ? null : bookingType === 'client' ? CLIENT_DURATIONS : bookingType === 'candidat' ? CANDIDAT_DURATIONS : null;

  const [recruiter, setRecruiter] = useState<RecruiterInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<BookingStep>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(
    bookingType === 'client' ? 45 : bookingType === 'candidat' ? 15 : 30,
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // ── Load recruiter info ──
  useEffect(() => {
    if (!slug) return;

    const path = mandatSlug ? `/${slug}/${mandatSlug}` : `/${slug}`;

    setLoading(true);
    setError(null);

    publicApi
      .get<RecruiterInfo>(path)
      .then((data) => {
        setRecruiter(data);
        // If the API resolved a booking type from the slug, use it
        if (data.bookingType) {
          const t = data.bookingType.targetType === 'client' ? 'client' : 'candidat';
          setResolvedBookingType(t);
          setFixedDuration(data.bookingType.durationMinutes);
          setSelectedDuration(data.bookingType.durationMinutes);
        }
      })
      .catch((err) => {
        setError(err.message || 'Ce lien de reservation est invalide ou expire.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug, mandatSlug]);

  // ── Fetch slots when date or duration is selected ──
  useEffect(() => {
    if (!selectedDate || !slug) return;

    setSlotsLoading(true);
    setSelectedSlot(null);

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const durationParam = (fixedDuration || durationOptions) ? `&duration=${selectedDuration}` : '';
    publicApi
      .get<Slot[]>(`/${slug}/slots?date=${dateStr}${durationParam}`)
      .then((data) => {
        // API may return { data: [...] } or [...] directly
        const slotsArr = Array.isArray(data) ? data : (data as any).data || [];
        setSlots(slotsArr);
      })
      .catch((err) => {
        toast('error', err.message || 'Impossible de charger les creneaux.');
        setSlots([]);
      })
      .finally(() => {
        setSlotsLoading(false);
      });
  }, [selectedDate, slug, selectedDuration, durationOptions]);

  // ── Handle date selection ──
  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  }, []);

  // ── Handle slot selection → go to form ──
  const handleSelectSlot = useCallback((time: string) => {
    setSelectedSlot(time);
    setStep('form');
  }, []);

  // ── Handle form submission ──
  const handleFormSubmit = useCallback(
    async (formData: BookingFormData) => {
      if (!slug || !selectedDate || !selectedSlot || !recruiter) return;

      // Honeypot check
      if (formData.honeypot) {
        // Silently reject bot submissions
        toast('success', 'Rendez-vous confirme !');
        return;
      }

      setSubmitting(true);

      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        // Determine entityType from URL or form
        const entityType = bookingType || formData.typeRdv || 'candidat';
        const effectiveDuration = fixedDuration || (durationOptions ? selectedDuration : recruiter.settings.slotDuration);

        const body = {
          date: dateStr,
          time: selectedSlot,
          firstName: formData.prenom,
          lastName: formData.nom,
          email: formData.email,
          phone: formData.telephone,
          entityType,
          durationMinutes: effectiveDuration,
          currentCompany: formData.entrepriseActuelle || undefined,
          salary: formData.salaireActuel || undefined,
          availability: formData.disponibilite || undefined,
          competingProcesses: formData.processConcurrents || undefined,
          message: formData.message || undefined,
          mandatSlug: mandatSlug || undefined,
          source: searchParams.get('source') || undefined,
        };

        const result = await publicApi.post<{ bookingId: string }>(`/${slug}/book`, body);

        setConfirmation({
          date: dateStr,
          time: selectedSlot,
          duration: effectiveDuration,
          recruiterName: `${recruiter.recruiter.prenom} ${recruiter.recruiter.nom}`,
          candidateEmail: formData.email,
          bookingId: result.bookingId,
        });
        setStep('confirmation');
      } catch (err: unknown) {
        const error = err as { message?: string; error?: string };
        const message =
          error.message || error.error || 'Impossible de confirmer le rendez-vous.';

        // Handle "slot no longer available"
        if (message.toLowerCase().includes('plus disponible') || message.toLowerCase().includes('no longer available')) {
          toast('error', 'Ce creneau n\'est plus disponible. Veuillez en choisir un autre.');
          setStep('calendar');
          setSelectedSlot(null);
          // Refresh slots
          if (selectedDate) {
            setSlotsLoading(true);
            const refreshDateStr = format(selectedDate, 'yyyy-MM-dd');
            const refreshDurationParam = (fixedDuration || durationOptions) ? `&duration=${selectedDuration}` : '';
            publicApi
              .get<Slot[]>(`/${slug}/slots?date=${refreshDateStr}${refreshDurationParam}`)
              .then((d) => {
                const arr = Array.isArray(d) ? d : (d as any).data || [];
                setSlots(arr);
              })
              .catch(() => setSlots([]))
              .finally(() => setSlotsLoading(false));
          }
        } else {
          toast('error', message);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [slug, mandatSlug, selectedDate, selectedSlot, recruiter, searchParams, bookingType, selectedDuration, durationOptions, fixedDuration],
  );

  // ── Back to calendar ──
  const handleBack = useCallback(() => {
    setStep('calendar');
  }, []);

  // ── Render ──

  if (loading) return <LoadingSkeleton />;
  if (error || !recruiter) return <ErrorState message={error || 'Page introuvable'} />;

  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4 py-8">
      <ToastContainer />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[600px] glass-card rounded-2xl p-10"
      >
        <BookingHeader recruiter={recruiter} />

        {/* Mandat pitch card */}
        {recruiter.mandat && <MandatPitchCard mandat={recruiter.mandat} />}

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              {/* Duration selector or badge */}
              {durationOptions ? (
                <div className="mb-5">
                  <p className="text-center text-[13px] font-medium text-neutral-500 mb-3">
                    {bookingType === 'client' ? 'RDV Client' : 'RDV Candidat'} — Choisissez la durée
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    {durationOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSelectedDuration(opt.value)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium border transition-all ${
                          selectedDuration === opt.value
                            ? 'bg-primary-500 text-white border-primary-500 shadow-md'
                            : 'bg-white text-neutral-600 border-neutral-200 hover:border-primary-300 hover:bg-primary-50'
                        }`}
                      >
                        <Clock size={14} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 mb-5">
                  <div className="flex items-center gap-1.5 bg-neutral-50 px-3 py-1.5 rounded-full">
                    <Clock size={14} className="text-neutral-400" />
                    <span className="text-[13px] font-medium text-neutral-600">
                      {fixedDuration || recruiter.settings.slotDuration} min
                    </span>
                  </div>
                  {recruiter.bookingType && (
                    <div className="flex items-center gap-1.5 bg-primary-50 px-3 py-1.5 rounded-full">
                      <span className="text-[13px] font-medium text-primary-600">
                        {recruiter.bookingType.label}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <BookingCalendar
                selectedDate={selectedDate}
                onSelectDate={handleSelectDate}
                maxAdvanceDays={recruiter.settings.maxAdvanceDays}
              />

              {selectedDate && (
                <SlotPicker
                  slots={slots}
                  selectedSlot={selectedSlot}
                  onSelectSlot={handleSelectSlot}
                  loading={slotsLoading}
                  selectedDate={selectedDate}
                />
              )}
            </motion.div>
          )}

          {step === 'form' && selectedDate && selectedSlot && (
            <BookingForm
              key="form"
              recruiter={{
                ...recruiter,
                settings: {
                  ...recruiter.settings,
                  slotDuration: fixedDuration || (durationOptions ? selectedDuration : recruiter.settings.slotDuration),
                },
              }}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              hasMandatSlug={!!mandatSlug}
              bookingType={bookingType}
              onSubmit={handleFormSubmit}
              onBack={handleBack}
              submitting={submitting}
            />
          )}

          {step === 'confirmation' && confirmation && (
            <BookingConfirmationView key="confirmation" confirmation={confirmation} />
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="mt-8 pt-5 border-t border-neutral-100 text-center">
          <p className="text-[12px] text-neutral-400">
            Propulse par{' '}
            <span className="font-semibold gradient-text">HumanUp</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
