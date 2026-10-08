import { NextRequest, NextResponse } from "next/server";
// Protège /admin et l'export CSV (données personnelles) par mot de passe unique.
export function middleware(req: NextRequest) {
  const pass = process.env.ADMIN_PASSWORD;
  const auth = req.headers.get("authorization") || "";
  if (pass && auth.startsWith("Basic ")) {
    const [u, ...p] = atob(auth.slice(6)).split(":");
    if (u === "admin" && p.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("Authentification requise", {
    status: 401, headers: { "WWW-Authenticate": 'Basic realm="Fasrod admin"' },
  });
}
export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
