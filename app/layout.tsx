import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snook | WebMCP Phase 0",
  description: "A minimal real-browser WebMCP registration test.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
