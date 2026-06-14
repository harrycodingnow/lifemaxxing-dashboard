import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lifemaxxing Dashboard",
  description: "Personal finance + nutrition tracker powered by Hermes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning on <body> silences benign warnings from
          browser extensions (Grammarly, password managers, dark-mode toggles)
          that mutate body attributes BEFORE React hydrates. Only attributes
          one level deep are suppressed — real hydration bugs in our own tree
          still surface. */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
