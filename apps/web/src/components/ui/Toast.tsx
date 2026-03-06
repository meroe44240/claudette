import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: 'border-success/20 bg-green-50 text-success',
  error: 'border-error/20 bg-red-50 text-error',
  warning: 'border-warning/20 bg-amber-50 text-warning',
  info: 'border-info/20 bg-blue-50 text-info',
};

let addToast: (toast: Omit<ToastData, 'id'>) => void;

export function toast(type: ToastType, message: string, duration = 4000) {
  addToast?.({ type, message, duration });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  addToast = (toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast: t, onRemove }: { toast: ToastData; onRemove: () => void }) {
  const Icon = icons[t.type];

  useEffect(() => {
    const timer = setTimeout(onRemove, t.duration || 4000);
    return () => clearTimeout(timer);
  }, [t.duration, onRemove]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-md ${styles[t.type]}`}
    >
      <Icon size={18} />
      <span className="text-sm font-medium">{t.message}</span>
      <button onClick={onRemove} className="ml-2 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </motion.div>
  );
}
