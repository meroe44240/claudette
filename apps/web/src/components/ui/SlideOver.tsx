import { Fragment, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export default function SlideOver({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
}: SlideOverProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <Fragment>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={`fixed inset-y-0 right-0 z-50 w-full ${widthMap[width]} flex flex-col bg-white shadow-[−20px_0_60px_rgba(26,26,46,0.12)]`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2 className="text-[15px] font-semibold text-neutral-900 truncate">{title}</h2>
                )}
                {subtitle && (
                  <p className="text-xs text-neutral-500 truncate">{subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}
