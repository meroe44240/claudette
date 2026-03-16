export default function PageLoader() {
  return (
    <div className="flex h-full w-full flex-col gap-6 p-8">
      <div className="flex items-center gap-4">
        <div className="h-8 w-48 rounded-lg skeleton-shimmer" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl skeleton-shimmer" />
        ))}
      </div>
      <div className="h-96 rounded-2xl skeleton-shimmer" />
    </div>
  );
}
