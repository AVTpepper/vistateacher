import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";

import type {
  BillingCommunicationKind,
  NormalizedBillingEvent,
} from "@/lib/billing/provider";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

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

function communicationDetails(
  event: NormalizedBillingEvent,
  kind: BillingCommunicationKind,
): {
  subject: string;
  heading: string;
  message: string;
  amount: string | null;
  link: string | null;
  linkLabel: string;
  recipient: string | null;
  name: string | null;
} {
  const amountValue =
    event.type === "invoice.paid"
      ? event.amountPaid
      : event.type === "invoice.payment_failed" ||
          event.type === "invoice.upcoming"
        ? event.amountDue
        : event.type === "charge.refunded"
          ? event.amountRefunded
          : null;
  const currency =
    "currency" in event && typeof event.currency === "string"
      ? event.currency
      : null;
  const amount =
    amountValue !== null && currency
      ? formatAmount(amountValue, currency)
      : null;
  const appBillingUrl = new URL(
    "/settings/billing",
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ).toString();
  const link =
    event.type === "invoice.paid"
      ? (event.hostedInvoiceUrl ?? event.invoicePdfUrl)
      : event.type === "invoice.payment_failed" ||
          event.type === "invoice.upcoming"
        ? event.hostedInvoiceUrl
        : event.type === "charge.refunded"
          ? (event.receiptUrl ?? appBillingUrl)
          : appBillingUrl;
  const recipient =
    "customerEmail" in event ? event.customerEmail?.trim() || null : null;
  const name = "customerName" in event ? event.customerName : null;
  const copy: Record<
    BillingCommunicationKind,
    { subject: string; heading: string; message: string; linkLabel: string }
  > = {
    "payment-receipt": {
      subject: `VistaTeacher Plus is active${amount ? ` - receipt ${amount}` : ""}`,
      heading: "Payment received",
      message: `We received your${amount ? ` ${amount}` : ""} payment. VistaTeacher Plus is active, and your invoice is available below.`,
      linkLabel: "View invoice and receipt",
    },
    "payment-failed": {
      subject: "Action needed: VistaTeacher Plus payment failed",
      heading: "Payment needs attention",
      message:
        "Stripe could not complete your latest payment. Plus remains available while payment is retried; update your payment method to avoid interruption.",
      linkLabel: "Review payment",
    },
    "renewal-upcoming": {
      subject: "Your VistaTeacher Plus renewal is coming up",
      heading: "Upcoming renewal",
      message: `Your VistaTeacher Plus membership will renew soon${amount ? ` for ${amount}` : ""}. You can review billing before the renewal.`,
      linkLabel: "Review billing",
    },
    "cancellation-scheduled": {
      subject: "VistaTeacher Plus cancellation scheduled",
      heading: "Cancellation scheduled",
      message:
        "Automatic renewal has been turned off. Your Plus access continues until the end of the current billing period.",
      linkLabel: "Review membership",
    },
    "renewal-restored": {
      subject: "VistaTeacher Plus renewal restored",
      heading: "Renewal restored",
      message:
        "Automatic renewal is active again for your VistaTeacher Plus membership.",
      linkLabel: "Review membership",
    },
    "subscription-ended": {
      subject: "Your VistaTeacher Plus membership has ended",
      heading: "Membership ended",
      message:
        "Your VistaTeacher Plus membership has ended and your account now uses Community access.",
      linkLabel: "View plans",
    },
    "refund-issued": {
      subject: `VistaTeacher refund issued${amount ? ` - ${amount}` : ""}`,
      heading: "Refund issued",
      message: `Stripe has issued a refund${amount ? ` of ${amount}` : ""}. Your bank may take several business days to display it.`,
      linkLabel: "View receipt",
    },
  };
  return { ...copy[kind], amount, link, recipient, name };
}

export async function sendBillingCommunication(
  event: NormalizedBillingEvent,
  kind: BillingCommunicationKind,
): Promise<void> {
  const eventRef = adminDb().doc(`billingEvents/${event.id}`);
  const eventSnapshot = await eventRef.get();
  if (eventSnapshot.data()?.emailSentAt) return;

  const uid = String(eventSnapshot.data()?.uid ?? event.uid ?? "");
  if (!uid) return;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    await eventRef.set(
      {
        emailAttemptedAt: FieldValue.serverTimestamp(),
        emailError: "Billing email is not configured.",
      },
      { merge: true },
    );
    throw new Error("Billing email is not configured.");
  }

  const account = await adminAuth()
    .getUser(uid)
    .catch(() => null);
  const details = communicationDetails(event, kind);
  const recipient = details.recipient || account?.email;
  if (!recipient) {
    await eventRef.set(
      {
        emailAttemptedAt: FieldValue.serverTimestamp(),
        emailError: "missing-email",
      },
      { merge: true },
    );
    return;
  }

  const name = details.name ?? account?.displayName ?? "Educator";
  const actionLine = details.link
    ? `${details.linkLabel}: ${details.link}`
    : "";
  const actionButton = details.link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(details.link)}" style="display:inline-block;background:#5b1838;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(details.linkLabel)}</a></p>`
    : "";

  const resend = new Resend(apiKey);
  await eventRef.set(
    { emailAttemptedAt: FieldValue.serverTimestamp(), emailError: null },
    { merge: true },
  );
  const { data, error } = await resend.emails.send(
    {
      from: `VistaTeacher <${from}>`,
      to: recipient,
      ...(process.env.RESEND_REPLY_TO_EMAIL
        ? { replyTo: process.env.RESEND_REPLY_TO_EMAIL }
        : {}),
      subject: details.subject,
      text: [
        `Hi ${name},`,
        "",
        details.message,
        actionLine,
        "",
        "Need help? Reply to this email or visit VistaTeacher support.",
      ]
        .filter(Boolean)
        .join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#302722;max-width:560px"><h1 style="font-family:Georgia,serif;color:#5b1838">${escapeHtml(details.heading)}</h1><p>Hi ${escapeHtml(name)},</p><p>${escapeHtml(details.message)}</p>${actionButton}<p>Need help? Reply to this email or visit VistaTeacher support.</p></div>`,
    },
    { idempotencyKey: `billing-email/${event.id}/${kind}` },
  );
  if (error) {
    await eventRef.set(
      { emailError: `Delivery failed: ${error.name}` },
      { merge: true },
    );
    throw new Error(`Billing email delivery failed: ${error.name}`);
  }

  await eventRef.set(
    {
      emailSentAt: FieldValue.serverTimestamp(),
      emailId: data?.id ?? null,
      emailRecipient: recipient,
      emailError: null,
    },
    { merge: true },
  );
}
