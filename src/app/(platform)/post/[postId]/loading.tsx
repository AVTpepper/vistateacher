export default function PostLoading() {
  return (
    <div className="mx-auto min-h-112 max-w-2xl px-4 py-5 lg:px-6">
      <div className="bg-muted h-9 w-40 animate-pulse rounded-lg" />
      <div
        className="surface-card mt-4 h-72 animate-pulse"
        aria-hidden="true"
      />
      <span className="sr-only">Loading post</span>
    </div>
  );
}
