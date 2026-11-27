import {
  Activity,
  BadgeCheck,
  BookOpen,
  Flag,
  MessageSquare,
  UsersRound,
} from "lucide-react";

import { AdminActionButton } from "@/features/admin/admin-action-button";
import type {
  AdminContentRow,
  AdminOverview,
  AdminReportRow,
  AdminUserRow,
  AdminVerificationRow,
} from "@/lib/admin/server";
import { cn } from "@/lib/utils";

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Status({ value }: { value: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase",
        value === "active" || value === "approved" || value === "resolved"
          ? "bg-success/10 text-success"
          : value === "suspended" || value === "rejected"
            ? "bg-destructive/10 text-destructive"
            : "bg-accent/10 text-accent-readable",
      )}
    >
      {value}
    </span>
  );
}

export function AdminOverviewView({ overview }: { overview: AdminOverview }) {
  const metrics = [
    ["Educators", overview.totals.users, UsersRound],
    ["Plus members", overview.totals.plusSubscribers, BadgeCheck],
    ["Posts", overview.totals.posts, Activity],
    ["Resources", overview.totals.resources, BookOpen],
    ["Discussions", overview.totals.forumThreads, MessageSquare],
    ["Open reports", overview.totals.pendingReports, Flag],
  ] as const;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value, Icon]) => (
          <div key={label} className="surface-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs font-bold uppercase">
                {label}
              </p>
              <Icon className="text-primary size-4" />
            </div>
            <p className="mt-3 font-serif text-3xl">{value}</p>
          </div>
        ))}
      </div>
      <section className="surface-card overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="font-serif text-xl">Recent audit activity</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {overview.auditLogs.length} most recent trusted actions
          </p>
        </div>
        <div className="divide-y">
          {overview.auditLogs.length ? (
            overview.auditLogs.map((audit) => (
              <div
                key={audit.id}
                className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <p className="font-bold">
                    {audit.action} · {audit.targetType}
                  </p>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    {audit.targetId} · {audit.reason}
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatDate(audit.createdAt)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground px-5 py-10 text-center text-sm">
              No administrator actions recorded.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export function AdminUsersView({ users }: { users: AdminUserRow[] }) {
  return (
    <AdminTable headings={["Educator", "Role", "Plan", "Status", "Action"]}>
      {users.map((user) => (
        <tr key={user.uid} className="border-b last:border-0">
          <td className="px-4 py-3">
            <p className="font-bold">{user.displayName}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {user.school || user.uid}
            </p>
          </td>
          <td className="px-4 py-3 text-sm">{user.role.replace("_", " ")}</td>
          <td className="px-4 py-3 text-sm capitalize">{user.plan}</td>
          <td className="px-4 py-3">
            <Status value={user.status} />
          </td>
          <td className="px-4 py-3 text-right">
            {user.role !== "platform_admin" && user.status !== "deleted" && (
              <AdminActionButton
                label={user.status === "active" ? "Suspend" : "Reactivate"}
                title={`${user.status === "active" ? "Suspend" : "Reactivate"} ${user.displayName}?`}
                variant={user.status === "active" ? "destructive" : "outline"}
                action={{
                  action: "user.status",
                  targetId: user.uid,
                  status: user.status === "active" ? "suspended" : "active",
                }}
              />
            )}
          </td>
        </tr>
      ))}
    </AdminTable>
  );
}

export function AdminContentView({ content }: { content: AdminContentRow[] }) {
  return (
    <AdminTable headings={["Content", "Type", "Reports", "Status", "Actions"]}>
      {content.map((item) => (
        <tr key={`${item.type}-${item.id}`} className="border-b last:border-0">
          <td className="max-w-sm px-4 py-3">
            <p className="truncate font-bold">{item.title}</p>
            <p className="text-muted-foreground mt-1 text-xs">{item.ownerId}</p>
          </td>
          <td className="px-4 py-3 text-sm">{item.type}</td>
          <td className="px-4 py-3 text-sm">{item.reportCount}</td>
          <td className="px-4 py-3">
            <Status value={item.moderationStatus} />
          </td>
          <td className="px-4 py-3">
            <div className="flex justify-end gap-2">
              {item.moderationStatus !== "approved" && (
                <AdminActionButton
                  label="Approve"
                  title="Approve this content?"
                  action={{
                    action: "content.moderate",
                    targetType: item.type,
                    targetId: item.id,
                    parentId: null,
                    status: "approved",
                  }}
                />
              )}
              {item.moderationStatus !== "rejected" && (
                <AdminActionButton
                  label="Reject"
                  title="Reject this content?"
                  variant="destructive"
                  action={{
                    action: "content.moderate",
                    targetType: item.type,
                    targetId: item.id,
                    parentId: null,
                    status: "rejected",
                  }}
                />
              )}
            </div>
          </td>
        </tr>
      ))}
    </AdminTable>
  );
}

export function AdminReportsView({ reports }: { reports: AdminReportRow[] }) {
  return (
    <AdminTable headings={["Report", "Target", "Details", "Status", "Actions"]}>
      {reports.map((report) => (
        <tr key={report.id} className="border-b last:border-0">
          <td className="px-4 py-3">
            <p className="font-bold capitalize">{report.reason}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              by {report.reporterId}
            </p>
          </td>
          <td className="px-4 py-3 text-sm">
            {report.target ? (
              <div className="max-w-sm space-y-2">
                <p className="font-bold">{report.target.title}</p>
                <p className="text-muted-foreground text-xs break-all">
                  {report.target.type} · {report.target.id}
                </p>
                <Status value={report.target.moderationStatus} />
                <details>
                  <summary className="text-primary cursor-pointer text-xs font-bold">
                    Review reported content
                  </summary>
                  <p className="mt-2 max-h-64 overflow-y-auto text-xs leading-5 whitespace-pre-wrap">
                    {report.target.preview ||
                      "No text preview is available for this item."}
                  </p>
                </details>
                {report.target.announcement && (
                  <p className="text-muted-foreground text-xs">
                    Reported through an announcement:{" "}
                    {report.target.announcement.moderationStatus}.
                  </p>
                )}
              </div>
            ) : (
              <div className="max-w-sm">
                <p className="text-muted-foreground">
                  Content removed or unavailable for review.
                </p>
                <p className="text-muted-foreground mt-1 text-xs break-all">
                  {report.targetType} · {report.targetId}
                </p>
              </div>
            )}
          </td>
          <td className="max-w-xs px-4 py-3 text-sm">
            <p className="line-clamp-2">
              {report.details || "No details provided."}
            </p>
          </td>
          <td className="px-4 py-3">
            <Status value={report.status} />
          </td>
          <td className="px-4 py-3">
            <div className="space-y-3">
              {report.target && (
                <div className="flex flex-wrap justify-end gap-2">
                  {report.target.moderationStatus !== "rejected" && (
                    <AdminActionButton
                      label="Hide content"
                      title="Hide this content from the community?"
                      variant="destructive"
                      action={{
                        action: "content.moderate",
                        targetType: report.target.type,
                        targetId: report.target.id,
                        parentId: report.target.parentId,
                        status: "rejected",
                      }}
                    />
                  )}
                  {report.target.moderationStatus !== "approved" && (
                    <AdminActionButton
                      label="Approve content"
                      title="Approve this content?"
                      action={{
                        action: "content.moderate",
                        targetType: report.target.type,
                        targetId: report.target.id,
                        parentId: report.target.parentId,
                        status: "approved",
                      }}
                    />
                  )}
                  {report.target.announcement?.moderationStatus ===
                    "rejected" &&
                    report.target.moderationStatus === "approved" && (
                      <AdminActionButton
                        label="Approve announcement"
                        title="Approve this announcement and its approved source?"
                        action={{
                          action: "content.moderate",
                          targetType: "post",
                          targetId: report.target.announcement.id,
                          parentId: null,
                          status: "approved",
                        }}
                      />
                    )}
                </div>
              )}
              {report.status === "open" && (
                <div className="flex justify-end gap-2">
                  <AdminActionButton
                    label="Resolve"
                    title="Resolve this report?"
                    action={{
                      action: "report.resolve",
                      targetId: report.id,
                      resolution: "resolved",
                    }}
                  />
                  <AdminActionButton
                    label="Dismiss"
                    title="Dismiss this report?"
                    action={{
                      action: "report.resolve",
                      targetId: report.id,
                      resolution: "dismissed",
                    }}
                  />
                </div>
              )}
              {report.target && report.status === "open" && (
                <p className="text-muted-foreground max-w-56 text-right text-[11px]">
                  Content decisions and report resolution are separate actions.
                </p>
              )}
            </div>
          </td>
        </tr>
      ))}
    </AdminTable>
  );
}

export function AdminVerificationsView({
  verifications,
}: {
  verifications: AdminVerificationRow[];
}) {
  return (
    <AdminTable
      headings={["Applicant", "Evidence", "Submitted", "Status", "Actions"]}
    >
      {verifications.map((verification) => (
        <tr key={verification.id} className="border-b last:border-0">
          <td className="px-4 py-3 font-bold">{verification.uid}</td>
          <td className="max-w-xs px-4 py-3 text-sm">
            <p className="truncate">
              {verification.evidencePath ?? "No evidence path"}
            </p>
          </td>
          <td className="px-4 py-3 text-sm">
            {formatDate(verification.createdAt)}
          </td>
          <td className="px-4 py-3">
            <Status value={verification.status} />
          </td>
          <td className="px-4 py-3">
            {verification.status === "pending" && (
              <div className="flex justify-end gap-2">
                <AdminActionButton
                  label="Approve"
                  title="Approve educator verification?"
                  action={{
                    action: "verification.decide",
                    targetId: verification.id,
                    decision: "approved",
                  }}
                />
                <AdminActionButton
                  label="Reject"
                  title="Reject educator verification?"
                  variant="destructive"
                  action={{
                    action: "verification.decide",
                    targetId: verification.id,
                    decision: "rejected",
                  }}
                />
              </div>
            )}
          </td>
        </tr>
      ))}
    </AdminTable>
  );
}

function AdminTable({
  headings,
  children,
}: {
  headings: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label="Administration data table"
      tabIndex={0}
      className="surface-card overflow-x-auto overflow-y-hidden overscroll-x-contain"
    >
      <table className="w-full min-w-190 border-collapse text-left">
        <thead className="bg-muted/60">
          <tr>
            {headings.map((heading) => (
              <th
                key={heading}
                className="px-4 py-3 text-xs font-bold uppercase"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
