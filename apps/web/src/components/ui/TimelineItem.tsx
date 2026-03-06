interface TimelineItemProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  timestamp: string;
  meta?: React.ReactNode;
}

export default function TimelineItem({ icon, title, description, timestamp, meta }: TimelineItemProps) {
  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      <div className="relative flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-secondary text-text-secondary">
          {icon}
        </div>
        <div className="absolute top-8 bottom-0 w-px bg-border" />
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">{title}</p>
            {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
          </div>
          <span className="text-xs text-text-tertiary whitespace-nowrap ml-4">{timestamp}</span>
        </div>
        {meta && <div className="mt-2">{meta}</div>}
      </div>
    </div>
  );
}
