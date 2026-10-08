import "./globals.css";
import type { Metadata } from "next";
import { I18nProvider } from "@/components/I18n";
import Header from "@/components/Header";

export const metadata: Metadata = { title: "Fasrod", description: "Streetwear tunisien — livraison partout en Tunisie" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr"><body><I18nProvider><Header />{children}</I18nProvider></body></html>
  );
}
