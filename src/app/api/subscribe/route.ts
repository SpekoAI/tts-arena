/**
 * POST /api/subscribe
 *
 * Lead capture for the gated methodology / report. Frontend-complete: it
 * validates the email and accepts it. Wiring it to a CRM / email tool / DB is
 * a later step — that integration goes where the TODO is.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // TODO: persist / forward the lead (Neon table, Resend, HubSpot, Speko API…).
  console.log("[subscribe] captured lead:", email);

  return NextResponse.json({ ok: true });
}
