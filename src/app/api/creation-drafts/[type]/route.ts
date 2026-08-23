import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasTrustedOrigin } from "@/lib/auth/request";
import { getRouteAccount } from "@/lib/auth/route-account";
import {
  deleteCreationDraft,
  saveCreationDraft,
} from "@/lib/creation-drafts/server";
import {
  creationDraftSchemas,
  creationDraftTypeSchema,
  type CreationDraftMap,
  type CreationDraftType,
} from "@/schemas/creation-draft";

type Context = { params: Promise<{ type: string }> };

export async function PUT(request: NextRequest, context: Context) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  const typeResult = creationDraftTypeSchema.safeParse(
    (await context.params).type,
  );
  if (!typeResult.success)
    return NextResponse.json({ error: "Unknown draft type." }, { status: 404 });
  const type = typeResult.data;
  const parsed = creationDraftSchemas[type].safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Review the draft details." },
      { status: 400 },
    );

  await saveCreationDraft(
    account.uid,
    type,
    parsed.data as CreationDraftMap[typeof type],
  );
  return NextResponse.json({ saved: true });
}

export async function DELETE(request: NextRequest, context: Context) {
  if (!hasTrustedOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const account = await getRouteAccount(request);
  if (!account)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  const typeResult = creationDraftTypeSchema.safeParse(
    (await context.params).type,
  );
  if (!typeResult.success)
    return NextResponse.json({ error: "Unknown draft type." }, { status: 404 });

  await deleteCreationDraft(account.uid, typeResult.data as CreationDraftType);
  return NextResponse.json({ deleted: true });
}
