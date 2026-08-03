import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baahi Sync — Listen with synced lyrics",
  description: "Browse Assamese songs and follow every lyric in perfect time.",
};

export const viewport: Viewport = {
  themeColor: "#0f1012",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
