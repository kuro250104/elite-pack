import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Elite Pack — Le sport à collectionner", template: "%s | Elite Pack" },
  description: "Un jeu de cartes à collectionner multisport, gratuit et entièrement en français. Projet en préparation.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen antialiased">
        <a href="#contenu" className="sr-only fixed left-4 top-4 z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only">Aller au contenu</a>
        {children}
      </body>
    </html>
  );
}
