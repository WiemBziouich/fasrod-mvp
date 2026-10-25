import { NextRequest, NextResponse } from "next/server";

// Protège l'administration, l'export CSV et les opérations de nettoyage.
export function middleware(req: NextRequest) {
  const pass = process.env.ADMIN_PASSWORD;
  const auth = req.headers.get("authorization") || "";

  if (pass && auth.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const [username, ...passwordParts] = decoded.split(":");
      const password = passwordParts.join(":");

      if (username === "admin" && password === pass) {
        return NextResponse.next();
      }
    } catch {
      // Toute autorisation mal formée est refusée.
    }
  }

  return new NextResponse("Authentification requise", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Fasrod admin"',
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
