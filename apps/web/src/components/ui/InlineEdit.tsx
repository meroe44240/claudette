import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void> | void;
  label?: string;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel' | 'number' | 'url';
  className?: string;
  disabled?: boolean;
}

export default function InlineEdit({
  value,
  onSave,
  label,
  placeholder = 'Cliquer pour modifier',
  type = 'text',
  className = '',
  disabled = false,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = useCallback(async () => {
    const trimmed = editValue.trim();
    if (trimmed === value) {
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      await onSave(trimmed);
      setShowCheck(true);
      setTimeout(() => setShowCheck(false), 1500);
    } catch {
      setEditValue(value);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [editValue, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        setEditValue(value);
        setEditing(false);
      }
    },
    [handleSave, value],
  );

  if (disabled) {
    return (
      <div className={className}>
        {label && <span className="mb-0.5 block text-xs font-medium text-neutral-400">{label}</span>}
        <span className="text-sm text-neutral-900">{value || <span className="text-neutral-300">{placeholder}</span>}</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className={className}>
        {label && <span className="mb-0.5 block text-xs font-medium text-neutral-400">{label}</span>}
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-primary-200 bg-white px-2.5 py-1 text-sm text-neutral-900 outline-none ring-2 ring-primary-100 transition-all"
            disabled={saving}
          />
          {saving && <Loader2 size={14} className="animate-spin text-primary-500" />}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && <span className="mb-0.5 block text-xs font-medium text-neutral-400">{label}</span>}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-neutral-50"
      >
        <span className="text-sm text-neutral-900">
          {value || <span className="text-neutral-300">{placeholder}</span>}
        </span>
        <AnimatePresence mode="wait">
          {showCheck ? (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
            >
              <Check size={12} className="text-green-500" />
            </motion.span>
          ) : (
            <motion.span
              key="pencil"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Pencil size={12} className="text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
