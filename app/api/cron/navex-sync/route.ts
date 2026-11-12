import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConfiguredNavexClient, isNavexConfigured } from "@/lib/navex/client";
import { refreshParcelStates } from "@/lib/navex-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function constantTimeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!expected || !supplied || !constantTimeEqual(supplied, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isNavexConfigured()) {
    return NextResponse.json({ skipped: true });
  }
  try {
    const result = await refreshParcelStates(new ConfiguredNavexClient());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = [
      "navex_not_configured",
      "navex_auth",
      "navex_bad_response",
      "navex_timeout",
      "navex_network",
    ].includes(message)
      ? message
      : "navex_network";
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
