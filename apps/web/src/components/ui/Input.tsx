import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const shakeAnimation = {
  x: [0, -4, 4, -4, 4, 0],
};

const shakeTransition = {
  duration: 0.4,
  ease: 'easeInOut' as const,
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const [shakeKey, setShakeKey] = useState(0);

    useEffect(() => {
      if (error) setShakeKey((k) => k + 1);
    }, [error]);

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {label}
          </label>
        )}
        <motion.div
          key={shakeKey}
          animate={error ? shakeAnimation : {}}
          transition={shakeTransition}
        >
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-sm outline-none transition-all placeholder:text-text-tertiary focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)] ${
              error ? 'border-error' : 'border-neutral-100'
            } ${className}`}
            {...props}
          />
        </motion.div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const [shakeKey, setShakeKey] = useState(0);

    useEffect(() => {
      if (error) setShakeKey((k) => k + 1);
    }, [error]);

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {label}
          </label>
        )}
        <motion.div
          key={shakeKey}
          animate={error ? shakeAnimation : {}}
          transition={shakeTransition}
        >
          <textarea
            ref={ref}
            id={inputId}
            className={`w-full rounded-lg border-[1.5px] bg-white px-3 py-2.5 text-sm outline-none transition-all placeholder:text-text-tertiary focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)] ${
              error ? 'border-error' : 'border-neutral-100'
            } ${className}`}
            rows={4}
            {...props}
          />
        </motion.div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export { Input as default, Textarea };
