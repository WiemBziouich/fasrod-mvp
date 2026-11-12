import { NextRequest, NextResponse } from "next/server";
import { getCustomerHistory } from "@/lib/customer-history";
import { normalizeTunisiaPhone } from "@/lib/duplicate-orders.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const phone = normalizeTunisiaPhone(req.nextUrl.searchParams.get("phone"));
  if (!phone) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }
  try {
    const history = await getCustomerHistory([phone]);
    return NextResponse.json(history);
  } catch {
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}
