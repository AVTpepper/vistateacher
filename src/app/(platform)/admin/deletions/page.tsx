import { requirePlatformAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/firebase/admin";
import { DeletionRetryButton } from "@/features/admin/deletion-retry-button";
export default async function DeletionsPage() {
  await requirePlatformAdmin();
  const jobs = await adminDb()
    .collection("accountDeletions")
    .where("status", "in", ["pending", "processing", "failed"])
    .limit(100)
    .get();
  return (
    <section className="space-y-5">
      <header>
        <h1 className="font-serif text-3xl">Account deletions</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Retry requests that could not finish. Completed requests are kept as
          minimal receipts.
        </p>
      </header>
      {jobs.empty ? (
        <p>No pending deletions.</p>
      ) : (
        jobs.docs.map((job) => (
          <article
            key={job.id}
            className="surface-card flex flex-wrap items-center justify-between gap-4 p-5"
          >
            <div>
              <p className="font-semibold break-all">{job.id}</p>
              <p className="text-muted-foreground text-sm">
                {String(job.data().status)} · {String(job.data().phase)}
              </p>
            </div>
            <DeletionRetryButton uid={job.id} />
          </article>
        ))
      )}
    </section>
  );
}
