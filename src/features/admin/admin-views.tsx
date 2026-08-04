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
            : "bg-accent/10 text-accent",
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
          <div key={label} className="bg-card rounded-lg border p-4">
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
      <section className="bg-card overflow-hidden rounded-lg border">
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
            {report.targetType} · {report.targetId}
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
    <div className="bg-card overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[760px] border-collapse text-left">
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
