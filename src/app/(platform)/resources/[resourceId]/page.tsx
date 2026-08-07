import {
  Activity,
  BookOpen,
  Download,
  FileText,
  Film,
  Grid2X2,
  Star,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UserAvatar } from "@/components/ui/user-avatar";
import { ResourceDetailActions } from "@/features/resources/resource-detail-actions";
import { requireCurrentAccount } from "@/lib/auth/session";
import { getResourceDetail } from "@/lib/resources/server";

export const metadata: Metadata = { title: "Resource" };
const icons = {
  "lesson-plan": FileText,
  worksheet: BookOpen,
  "unit-plan": Grid2X2,
  video: Film,
  activity: Activity,
};

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ resourceId: string }>;
}) {
  const [account, { resourceId }] = await Promise.all([
    requireCurrentAccount(),
    params,
  ]);
  const data = await getResourceDetail(resourceId, account.uid);
  if (!data) notFound();
  const { resource, reviews } = data;
  const Icon = icons[resource.type];
  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <article className="surface-card overflow-hidden">
            <div className="bg-primary grid aspect-[16/7] place-items-center text-white">
              <Icon aria-hidden="true" className="size-16 opacity-80" />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-secondary text-primary rounded-full px-2.5 py-1 font-bold capitalize">
                  {resource.type.replace("-", " ")}
                </span>
                {resource.accessTier === "plus" && (
                  <span className="bg-accent/10 text-accent rounded-full px-2.5 py-1 font-bold">
                    Plus
                  </span>
                )}
              </div>
              <h1 className="mt-3 font-serif text-3xl">{resource.title}</h1>
              <p className="text-foreground/75 mt-3 text-sm leading-6">
                {resource.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {resource.tags.map((tag) => (
                  <span key={tag} className="text-primary text-xs">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3 border-t pt-5">
                <UserAvatar
                  name={resource.author.displayName}
                  photoURL={resource.author.photoURL}
                  className="size-10 rounded-full text-xs"
                />
                <div>
                  <p className="text-sm font-bold">
                    {resource.author.displayName}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {resource.subject} · {resource.gradeLevel}
                  </p>
                </div>
              </div>
            </div>
          </article>
          <aside>
            <section className="surface-card p-5">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <Star
                    aria-hidden="true"
                    className="text-amber mx-auto size-5 fill-current"
                  />
                  <p className="mt-1 text-lg font-bold">
                    {resource.ratingAverage.toFixed(1)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {resource.ratingCount} reviews
                  </p>
                </div>
                <div>
                  <Download
                    aria-hidden="true"
                    className="text-primary mx-auto size-5"
                  />
                  <p className="mt-1 text-lg font-bold">
                    {resource.downloadCount.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-xs">downloads</p>
                </div>
              </div>
              <div className="text-muted-foreground mt-4 border-t pt-4 text-xs">
                <p className="truncate">{resource.fileName}</p>
                <p className="mt-1">
                  {(resource.fileSize / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <div className="mt-4">
                <ResourceDetailActions resource={resource} />
              </div>
            </section>
          </aside>
        </div>
        <section className="mt-5">
          <h2 className="font-serif text-2xl">Educator reviews</h2>
          {reviews.length ? (
            <div className="mt-3 space-y-3">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="surface-card p-4"
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={review.author.displayName}
                      photoURL={review.author.photoURL}
                      className="size-8 rounded-full text-[10px]"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-bold">
                        {review.author.displayName}
                      </p>
                      <div className="flex">
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            aria-hidden="true"
                            className={`size-3 ${index < review.rating ? "text-amber fill-current" : "text-muted-foreground/20"}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-foreground/75 mt-3 text-sm leading-6">
                    {review.review}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="surface-card text-muted-foreground mt-3 py-10 text-center text-sm">
              No reviews yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
