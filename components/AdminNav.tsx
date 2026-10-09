"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminNav() {
  const pathname = usePathname();

  const links = [
    { href: "/admin/produits", label: "Produits" },
    { href: "/admin/commandes", label: "Commandes" },
  ];

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      padding: "14px 18px",
      marginBottom: 28,
      background: "#fff",
      border: "1px solid #e7e5e4",
      borderRadius: 12,
    }}>
      <strong style={{ fontSize: 17 }}>FASROD <span style={{ color: "#737373", fontWeight: 400 }}>Admin</span></strong>

      <div style={{ display: "flex", gap: 8 }}>
        {links.map((link) => {
          const active = pathname === link.href;

          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "9px 15px",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 600,
                background: active ? "#111" : "#f5f5f4",
                color: active ? "#fff" : "#44403c",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}