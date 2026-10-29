import { NextRequest, NextResponse } from "next/server";

async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

// Comparaison à temps constant
async function safeEqual(a: string, b: string) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// Protège l'administration, l'export CSV et les opérations de nettoyage.
export async function middleware(req: NextRequest) {
  const pass = process.env.ADMIN_PASSWORD;
  const auth = req.headers.get("authorization") || "";

  if (pass && auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const i = decoded.indexOf(":");
      if (i > -1) {
        const okUser = await safeEqual(decoded.slice(0, i), "admin");
        const okPass = await safeEqual(decoded.slice(i + 1), pass);
        if (okUser && okPass) return NextResponse.next();
      }
    } catch {
      // Toute autorisation mal formée est refusée.
    }
  }

  return new NextResponse("Authentification requise", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Fasrod admin"',
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/orders/cleanup",
    "/api/orders/cleanup-backup",
  ],
};
