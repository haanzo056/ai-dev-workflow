import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "docs-chat",
  description: "Ask questions about the project docs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
