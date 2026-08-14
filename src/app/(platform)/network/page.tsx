import { UserRoundSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EducatorCard } from "@/features/network/educator-card";
import { requireCurrentAccount } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { getNetworkList } from "@/lib/network/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your network" };

const views = ["connections", "suggestions"] as const;
const connectionScopes = ["shared", "other"] as const;

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [account, params] = await Promise.all([
    requireCurrentAccount(),
    searchParams,
  ]);
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view = views.includes(rawView as (typeof views)[number])
    ? (rawView as (typeof views)[number])
    : "connections";
  const rawProfileUid = Array.isArray(params.uid) ? params.uid[0] : params.uid;
  const profileUid =
    view === "connections" ? (rawProfileUid ?? account.uid) : account.uid;
  const viewingAnotherProfile = profileUid !== account.uid;
  const rawScope = Array.isArray(params.scope) ? params.scope[0] : params.scope;
  const scope = connectionScopes.includes(
    rawScope as (typeof connectionScopes)[number],
  )
    ? (rawScope as (typeof connectionScopes)[number])
    : "shared";
  const [networkList, viewedProfile] = await Promise.all([
    getNetworkList(account.uid, profileUid, view),
    viewingAnotherProfile
      ? adminDb().doc(`users/${profileUid}`).get()
      : Promise.resolve(null),
  ]);
  const profileName =
    viewedProfile && typeof viewedProfile.data()?.displayName === "string"
      ? String(viewedProfile.data()?.displayName)
      : "This educator";
  const profileConnections = networkList.filter(
    (result) => result.profile.uid !== account.uid,
  );
  const sharedConnections = profileConnections.filter(
    (result) => result.connectionStatus === "accepted",
  );
  const otherConnections = profileConnections.filter(
    (result) => result.connectionStatus !== "accepted",
  );
  const educators = viewingAnotherProfile
    ? scope === "shared"
      ? sharedConnections
      : otherConnections
    : networkList;
  const navigationItems = viewingAnotherProfile
    ? [
        {
          key: "shared",
          label: `Shared network (${sharedConnections.length})`,
        },
        {
          key: "other",
          label: `Other connections (${otherConnections.length})`,
        },
      ]
    : views.map((item) => ({
        key: item,
        label: item,
      }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <div>
        <h1 className="font-serif text-3xl">
          {viewingAnotherProfile
            ? `${profileName}'s connections`
            : "Educator network"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {viewingAnotherProfile
            ? "See who is already in your network and who you have not connected with yet."
            : "Review connections and find educators with relevant experience."}
        </p>
      </div>
      <nav
        aria-label="Network views"
        className="surface-card mt-6 flex gap-1 p-1"
      >
        {navigationItems.map((item) => (
          <Link
            key={item.key}
            href={
              viewingAnotherProfile
                ? `/network?view=connections&uid=${encodeURIComponent(profileUid)}&scope=${item.key}`
                : `/network?view=${item.key}`
            }
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center rounded-lg px-2 text-center text-sm font-semibold capitalize",
              (viewingAnotherProfile ? scope : view) === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {educators.length ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {educators.map((result) => (
            <EducatorCard
              key={result.profile.uid}
              result={result}
              viewerUid={account.uid}
            />
          ))}
        </div>
      ) : (
        <section className="surface-card mt-5 rounded-2xl p-12 text-center">
          <UserRoundSearch
            aria-hidden="true"
            className="text-muted-foreground/40 mx-auto size-9"
          />
          <h2 className="mt-3 font-serif text-xl">
            {viewingAnotherProfile
              ? scope === "shared"
                ? "No shared connections yet"
                : "No other connections to show"
              : `No ${view} to show yet`}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {viewingAnotherProfile
              ? scope === "shared"
                ? `You and ${profileName} do not share any connections yet.`
                : `Every visible connection of ${profileName} is already in your network.`
              : view === "suggestions"
                ? "Suggestions appear as more active educators join the community."
                : "Discover educators and begin building your professional network."}
          </p>
          <Link
            href="/discover"
            className="text-primary mt-4 inline-block text-sm font-semibold hover:underline"
          >
            Discover educators
          </Link>
        </section>
      )}
    </div>
  );
}
