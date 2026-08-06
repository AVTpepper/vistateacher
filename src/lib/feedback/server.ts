import "server-only";

import { createHash } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";

import { adminDb } from "@/lib/firebase/admin";
import type { FeedbackInput } from "@/schemas/feedback";

const DAILY_LIMIT = 5;

export class FeedbackRateLimitError extends Error {}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ??
      character,
  );
}

function dateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function rateLimitId(address: string): string {
  return `${dateKey()}_${createHash("sha256").update(address).digest("hex")}`;
}

async function consumeDailyAllowance(address: string): Promise<void> {
  const reference = adminDb().doc(`feedbackRateLimits/${rateLimitId(address)}`);
  await adminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = Number(snapshot.data()?.count ?? 0);
    if (count >= DAILY_LIMIT) throw new FeedbackRateLimitError();
    transaction.set(
      reference,
      {
        count: FieldValue.increment(1),
        date: dateKey(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function sendFeedback(
  input: FeedbackInput,
  clientAddress: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const supportEmail = process.env.RESEND_REPLY_TO_EMAIL;
  if (!apiKey || !from || !supportEmail) {
    throw new Error("Feedback email is not configured.");
  }

  await consumeDailyAllowance(clientAddress);

  const resend = new Resend(apiKey);
  const category = input.category[0].toUpperCase() + input.category.slice(1);
  const { error: supportDeliveryError } = await resend.emails.send({
    from: `VistaTeacher <${from}>`,
    to: supportEmail,
    replyTo: input.email,
    subject: `[${category}] Feedback from ${input.name}`,
    text: [
      `Category: ${category}`,
      `From: ${input.name} <${input.email}>`,
      "",
      input.message,
    ].join("\n"),
    html: `<h2>New VistaTeacher message</h2><p><strong>Category:</strong> ${escapeHtml(category)}</p><p><strong>From:</strong> ${escapeHtml(input.name)} &lt;${escapeHtml(input.email)}&gt;</p><hr><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
  });
  if (supportDeliveryError) {
    throw new Error(`Resend delivery failed: ${supportDeliveryError.name}`);
  }

  const { error: confirmationDeliveryError } = await resend.emails.send({
    from: `VistaTeacher <${from}>`,
    to: input.email,
    replyTo: supportEmail,
    subject: "We received your VistaTeacher message",
    text: [
      `Hi ${input.name},`,
      "",
      "Thanks for contacting VistaTeacher support.",
      "We've received your message and our team will review it as soon as possible.",
      "",
      `Category: ${category}`,
      "",
      "For your records, here's what you sent:",
      input.message,
      "",
      "- VistaTeacher Support",
    ].join("\n"),
    html: [
      `<p>Hi ${escapeHtml(input.name)},</p>`,
      "<p>Thanks for contacting VistaTeacher support.</p>",
      "<p>We've received your message and our team will review it as soon as possible.</p>",
      `<p><strong>Category:</strong> ${escapeHtml(category)}</p>`,
      "<p><strong>For your records, here's what you sent:</strong></p>",
      `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
      "<p>- VistaTeacher Support</p>",
    ].join(""),
  });
  if (confirmationDeliveryError) {
    throw new Error(
      `Resend confirmation delivery failed: ${confirmationDeliveryError.name}`,
    );
  }
}
