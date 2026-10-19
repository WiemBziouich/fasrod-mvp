import "./globals.css";
import type { Metadata } from "next";

import { I18nProvider } from "@/components/I18n";
import { CartProvider } from "@/components/CartContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Fasrod — Streetwear tunisien",
  description:
    "Fasrod — Streetwear tunisien. Découvrez nos articles et commandez partout en Tunisie.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <I18nProvider>
          <CartProvider>
            <Header />
            {children}
            <Footer />
          </CartProvider>
        </I18nProvider>
      </body>
    </html>
  );
}