import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";

import type { NormalizedBillingEvent } from "@/lib/billing/provider";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

type PaidInvoiceEvent = Extract<
  NormalizedBillingEvent,
  { type: "invoice.paid" }
>;

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[character] ??
      character,
  );
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export async function sendPaidInvoiceReceipt(
  event: PaidInvoiceEvent,
): Promise<void> {
  if (event.amountPaid <= 0) return;

  const eventRef = adminDb().doc(`billingEvents/${event.id}`);
  const eventSnapshot = await eventRef.get();
  if (eventSnapshot.data()?.receiptSentAt) return;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from)
    throw new Error("Billing receipt email is not configured.");

  const account = await adminAuth()
    .getUser(event.uid)
    .catch(() => null);
  const recipient = event.customerEmail?.trim() || account?.email;
  if (!recipient) {
    await eventRef.set(
      {
        receiptSkippedAt: FieldValue.serverTimestamp(),
        receiptSkippedReason: "missing-email",
      },
      { merge: true },
    );
    return;
  }

  const name = event.customerName ?? account?.displayName ?? "Educator";
  const amount = formatAmount(event.amountPaid, event.currency);
  const reference = event.invoiceNumber ?? event.invoiceId;
  const invoiceUrl = event.hostedInvoiceUrl ?? event.invoicePdfUrl;
  const invoiceLine = invoiceUrl
    ? `View your Stripe invoice: ${invoiceUrl}`
    : "";
  const invoiceButton = invoiceUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#5b1838;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">View invoice and receipt</a></p>`
    : "";

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send(
    {
      from: `VistaTeacher <${from}>`,
      to: recipient,
      ...(process.env.RESEND_REPLY_TO_EMAIL
        ? { replyTo: process.env.RESEND_REPLY_TO_EMAIL }
        : {}),
      subject: `Your VistaTeacher receipt - ${amount}`,
      text: [
        `Hi ${name},`,
        "",
        `We received your ${amount} payment for VistaTeacher Plus.`,
        `Invoice: ${reference}`,
        invoiceLine,
        "",
        "Thank you for supporting the VistaTeacher community.",
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#302722;max-width:560px"><h1 style="font-family:Georgia,serif;color:#5b1838">Payment received</h1><p>Hi ${escapeHtml(name)},</p><p>We received your <strong>${escapeHtml(amount)}</strong> payment for VistaTeacher Plus.</p><p><strong>Invoice:</strong> ${escapeHtml(reference)}</p>${invoiceButton}<p>Thank you for supporting the VistaTeacher community.</p></div>`,
    },
    { idempotencyKey: `billing-receipt/${event.invoiceId}` },
  );
  if (error) throw new Error(`Receipt delivery failed: ${error.name}`);

  await eventRef.set(
    {
      receiptSentAt: FieldValue.serverTimestamp(),
      receiptEmailId: data?.id ?? null,
      receiptRecipient: recipient,
    },
    { merge: true },
  );
}
