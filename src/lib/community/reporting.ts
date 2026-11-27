import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import {
  activityTarget,
  publicActivityIds,
  publicResourceIds,
} from "@/lib/community/visibility";
import { adminDb } from "@/lib/firebase/admin";
import { reportDetailsSchema, type ReportDetails } from "@/schemas/report";

type TargetType = "post" | "resource" | "forumThread";
const paths: Record<TargetType, string> = {
  post: "posts",
  resource: "resources",
  forumThread: "forumThreads",
};

export class ContentReportError extends Error {
  constructor(readonly code: "inactive" | "not-found" | "already-reported") {
    super(code);
  }
}

/** A feed announcement and its source share one report identity and counter. */
export async function reportPublicContent(
  reporterId: string,
  type: TargetType,
  id: string,
  input: ReportDetails,
): Promise<void> {
  if (!/^[\w-]{1,128}$/.test(id)) throw new ContentReportError("not-found");
  const details = reportDetailsSchema.parse(input);
  const db = adminDb();
  await db.runTransaction(async (transaction) => {
    const [reporter, original] = await transaction.getAll(
      db.doc(`users/${reporterId}`),
      db.doc(`${paths[type]}/${id}`),
    );
    if (reporter.data()?.status !== "active")
      throw new ContentReportError("inactive");
    if (!original.exists) throw new ContentReportError("not-found");
    let target = original;
    let targetType = type;
    if (type === "post" && original.data()?.type === "activity") {
      if (!(await publicActivityIds([original], transaction)).has(id))
        throw new ContentReportError("not-found");
      const source = activityTarget(original.data());
      if (!source) throw new ContentReportError("not-found");
      targetType = source.type;
      target = await transaction.get(db.doc(source.path));
    }
    if (
      !target.exists ||
      (targetType === "resource"
        ? !(await publicResourceIds([target], transaction)).has(target.id)
        : target.data()?.moderationStatus !== "approved")
    )
      throw new ContentReportError("not-found");
    if (target.data()?.authorId === reporterId)
      throw new ContentReportError("not-found");
    const reportRef = db.doc(
      `reports/${targetType}_${target.id}_${reporterId}`,
    );
    const report = await transaction.get(reportRef);
    if (report.exists) throw new ContentReportError("already-reported");
    transaction.create(reportRef, {
      reporterId,
      targetType,
      targetId: target.id,
      targetOwnerId: String(target.data()?.authorId ?? ""),
      parentId: null,
      sourceActivityId:
        original.data()?.type === "activity" ? original.id : null,
      ...details,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(target.ref, { reportCount: FieldValue.increment(1) });
    transaction.set(
      db.doc("platformStats/current"),
      {
        pendingReports: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export function contentReportErrorResponse(error: unknown) {
  if (!(error instanceof ContentReportError)) return null;
  const errors = {
    inactive: ["Your account cannot submit a report.", 403],
    "not-found": ["This content is no longer available.", 404],
    "already-reported": ["We already have your report for this content.", 409],
  } as const;
  const [message, status] = errors[error.code];
  return NextResponse.json({ error: message, code: error.code }, { status });
}
