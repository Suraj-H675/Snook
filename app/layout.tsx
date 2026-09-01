import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snook | Privacy Control Center",
  description: "Understand and control the fictional data uses behind your Snook account.",
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
