import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lifemaxxing Dashboard",
  description: "Personal finance + nutrition tracker powered by Hermes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
