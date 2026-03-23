import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Building2, Briefcase, Users, ChevronRight, ChevronLeft, X, Check, Rocket } from 'lucide-react';
import Confetti from '../ui/Confetti';
import Button from '../ui/Button';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import { useAuthStore } from '../../stores/auth-store';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const steps = [
  {
    id: 'welcome',
    icon: Sparkles,
    iconColor: 'text-violet-500',
    title: 'Bienvenue sur HumanUp !',
    description: 'Votre espace de recrutement intelligent. En quelques étapes, configurez votre environnement pour commencer à recruter efficacement.',
  },
  {
    id: 'client',
    icon: Building2,
    iconColor: 'text-blue-500',
    title: 'Créez votre premier client',
    description: 'Ajoutez une entreprise cliente pour laquelle vous recrutez. Vous pourrez en ajouter d\'autres plus tard.',
    action: '/clients/new',
    actionLabel: 'Créer un client',
  },
  {
    id: 'mandat',
    icon: Briefcase,
    iconColor: 'text-emerald-500',
    title: 'Ouvrez votre premier mandat',
    description: 'Un mandat représente un poste à pourvoir. Définissez le profil recherché et commencez à sourcer.',
    action: '/mandats/new',
    actionLabel: 'Créer un mandat',
  },
  {
    id: 'done',
    icon: Rocket,
    iconColor: 'text-amber-500',
    title: 'Vous êtes prêt !',
    description: 'Votre espace est configuré. Explorez le tableau de bord, importez des candidats, et lancez vos recrutements.',
  },
];

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  const handleNext = () => {
    if (isLast) {
      handleFinish();
    } else {
      setCurrentStep((s) => s + 1);
      if (currentStep === steps.length - 2) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
    }
  };

  const handlePrev = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleAction = () => {
    if (step.action) {
      navigate(step.action);
      handleFinish();
    }
  };

  const handleFinish = async () => {
    try {
      await api.post('/settings/onboarding-complete', {});
      // Update auth store and localStorage so the modal doesn't reappear
      const { user, setUser } = useAuthStore.getState();
      if (user) {
        const updated = { ...user, onboardingCompleted: true };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
      }
    } catch {
      // Non-blocking
    }
    onComplete();
    toast('success', 'Bienvenue ! 🎉');
  };

  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Confetti active={showConfetti} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden"
      >
        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors z-10"
          title="Passer"
        >
          <X size={18} />
        </button>

        {/* Progress bar */}
        <div className="h-1 bg-neutral-100">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-primary-500"
            initial={{ width: 0 }}
            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        {/* Content */}
        <div className="px-8 py-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="text-center"
            >
              <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-50 ${step.iconColor}`}>
                <StepIcon size={32} />
              </div>
              <h2 className="text-xl font-bold text-neutral-900 mb-3">{step.title}</h2>
              <p className="text-sm text-neutral-500 leading-relaxed max-w-sm mx-auto">{step.description}</p>

              {step.action && (
                <Button
                  onClick={handleAction}
                  className="mt-6"
                >
                  {step.actionLabel}
                </Button>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 px-8 py-5">
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className="flex items-center gap-1 text-sm text-neutral-400 hover:text-neutral-600 disabled:opacity-0 transition-all"
          >
            <ChevronLeft size={16} />
            Précédent
          </button>

          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep ? 'w-6 bg-violet-500' : i < currentStep ? 'w-1.5 bg-violet-300' : 'w-1.5 bg-neutral-200'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            {isLast ? (
              <>
                <Check size={16} />
                Terminer
              </>
            ) : (
              <>
                Suivant
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
