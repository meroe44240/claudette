interface SkeletonProps {
  className?: string;
  count?: number;
}

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`skeleton-shimmer rounded-md bg-bg-secondary ${className}`} />;
}

export default function Skeleton({ className = 'h-4 w-full', count = 1 }: SkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonLine key={i} className={className} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.06)' }}>
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full skeleton-shimmer" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded skeleton-shimmer" />
          <div className="h-3 w-1/2 rounded skeleton-shimmer" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded skeleton-shimmer" />
        <div className="h-3 w-5/6 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-2xl bg-white overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.06)' }}>
      {/* Header */}
      <div className="flex gap-4 border-b border-neutral-100 px-6 py-4">
        <div className="h-4 w-1/4 rounded skeleton-shimmer" />
        <div className="h-4 w-1/4 rounded skeleton-shimmer" />
        <div className="h-4 w-1/4 rounded skeleton-shimmer" />
        <div className="h-4 w-1/4 rounded skeleton-shimmer" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-neutral-50 px-6 py-4">
          <div className="h-3 w-1/4 rounded skeleton-shimmer" />
          <div className="h-3 w-1/4 rounded skeleton-shimmer" />
          <div className="h-3 w-1/4 rounded skeleton-shimmer" />
          <div className="h-3 w-1/6 rounded skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonKPI() {
  return (
    <div className="rounded-2xl bg-white p-6" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.06)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-3 w-24 rounded skeleton-shimmer" />
        <div className="h-8 w-8 rounded-lg skeleton-shimmer" />
      </div>
      <div className="space-y-2">
        <div className="h-8 w-20 rounded skeleton-shimmer" />
        <div className="h-3 w-32 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}
