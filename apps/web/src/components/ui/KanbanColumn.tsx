interface KanbanColumnProps {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
  provided?: any;
}

export default function KanbanColumn({ title, count, color, children, provided }: KanbanColumnProps) {
  return (
    <div className="flex w-[300px] flex-shrink-0 flex-col rounded-2xl bg-neutral-50 p-4">
      {/* Color bar */}
      <div className="mb-3 h-[3px] rounded-full" style={{ backgroundColor: color }} />
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-700 shadow-sm">
          {count}
        </span>
      </div>
      <div
        ref={provided?.innerRef}
        {...provided?.droppableProps}
        className="flex-1 space-y-2 min-h-[100px]"
      >
        {children}
        {provided?.placeholder}
      </div>
    </div>
  );
}
