export default function ForumLoading() {
  return (
    <div className="mx-auto min-h-112 max-w-6xl px-4 py-5 lg:px-6">
      <div className="bg-muted h-9 w-36 animate-pulse rounded-lg" />
      <div className="bg-muted mt-3 h-5 w-full max-w-md animate-pulse rounded" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="surface-card h-32 animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="sr-only">Loading forum</span>
    </div>
  );
}
