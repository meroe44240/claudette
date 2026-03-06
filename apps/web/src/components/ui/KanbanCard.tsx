interface KanbanCardProps {
  title: string;
  subtitle?: string;
  meta?: string;
  extraLine?: string;
  time?: string;
  onClick?: () => void;
  provided?: any;
}

export default function KanbanCard({ title, subtitle, meta, extraLine, time, onClick, provided }: KanbanCardProps) {
  return (
    <div
      ref={provided?.innerRef}
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      onClick={onClick}
      className="cursor-pointer rounded-xl border-l-[3px] border-l-primary-300 bg-white p-4 shadow-[0_1px_2px_rgba(26,26,46,0.04)] transition-all duration-200 hover:shadow-[0_4px_16px_rgba(124,92,252,0.08)] hover:-translate-y-[1px]"
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-500">
          {title.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 truncate">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-500 truncate">{subtitle}</p>}
          {meta && <p className="mt-1.5 text-xs text-neutral-300">{meta}</p>}
          {extraLine && <p className="mt-1 text-xs text-neutral-300 truncate">{extraLine}</p>}
        </div>
      </div>
      {time && (
        <p className="mt-2 text-right text-[11px] text-neutral-300">{time}</p>
      )}
    </div>
  );
}
