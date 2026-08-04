import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, MoreHorizontal } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import { requireCurrentAccount } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export const metadata: Metadata = { title: "Your account" };

export default async function AppPage() {
  const account = await requireCurrentAccount();
  if (!account.onboarded) redirect("/onboarding");
  const posts = await adminDb()
    .collection("posts")
    .orderBy("createdAt", "desc")
    .limit(20)
    .get();
  const approvedPosts = posts.docs
    .filter((document) => document.data().moderationStatus === "approved")
    .slice(0, 8);
  const authorIds = [
    ...new Set(
      approvedPosts.map((document) => String(document.data().authorId)),
    ),
  ];
  const authors = new Map(
    (
      await Promise.all(
        authorIds.map(async (uid) => {
          const snapshot = await adminDb().doc(`users/${uid}`).get();
          return [uid, snapshot.data()] as const;
        }),
      )
    ).filter((entry) => entry[1]),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 lg:px-6">
      <section className="bg-card rounded-2xl border p-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={account.displayName ?? "Educator"}
            photoURL={account.photoURL}
            className="size-10 rounded-full text-xs"
          />
          <div>
            <h1 className="font-serif text-xl">
              Welcome back, {(account.displayName ?? "Educator").split(" ")[0]}
            </h1>
            <p className="text-muted-foreground text-xs">
              See what educators are sharing.
            </p>
          </div>
        </div>
      </section>
      <div className="mt-4 space-y-4">
        {approvedPosts.length ? (
          approvedPosts.map((document) => {
            const post = document.data();
            const author = authors.get(String(post.authorId));
            const name = String(author?.displayName ?? "VistaTeacher educator");
            return (
              <article
                className="bg-card overflow-hidden rounded-2xl border"
                key={document.id}
              >
                <header className="flex items-start gap-3 p-4 pb-3">
                  <UserAvatar
                    name={name}
                    photoURL={
                      typeof author?.photoURL === "string"
                        ? author.photoURL
                        : null
                    }
                    className="size-10 rounded-full text-xs"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {String(author?.gradeLevel ?? "Educator")} ·{" "}
                      {String(author?.school ?? "")}
                    </p>
                  </div>
                  <button
                    aria-label="Post options"
                    className="text-muted-foreground grid size-8 place-items-center rounded-lg"
                  >
                    <MoreHorizontal aria-hidden="true" className="size-4" />
                  </button>
                </header>
                <div className="px-4 pb-4">
                  <p className="text-sm leading-6 whitespace-pre-line">
                    {String(post.content ?? "")}
                  </p>
                  {Array.isArray(post.tags) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {post.tags.map((tag: unknown) => (
                        <span
                          className="text-primary text-xs"
                          key={String(tag)}
                        >
                          #{String(tag)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <section className="bg-card rounded-2xl border p-10 text-center">
            <FileText
              aria-hidden="true"
              className="text-muted-foreground/40 mx-auto size-8"
            />
            <h2 className="mt-3 font-serif text-xl">Your feed is ready</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Approved community posts will appear here.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
