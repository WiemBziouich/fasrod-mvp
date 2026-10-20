import { NextResponse } from "next/server";
import { getProducts } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const response = NextResponse.json(await getProducts(true));
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;
  } catch (error) {
    console.error("GET public products failed:", error);
    return NextResponse.json(
      { error: "database_error" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
