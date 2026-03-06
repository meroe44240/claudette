import { Inbox } from 'lucide-react';
import Button from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export default function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="animate-revealUp flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="animate-float mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-neutral-50 gradient-border">
        <div className="text-neutral-300">
          {icon || <Inbox size={64} strokeWidth={1} />}
        </div>
      </div>
      <h3 className="text-xl font-semibold text-neutral-700">{title}</h3>
      {description && (
        <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed text-neutral-500">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-8" size="lg">{actionLabel}</Button>
      )}
    </div>
  );
}
