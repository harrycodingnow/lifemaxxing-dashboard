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
      <head>
        {/* No-flash Liquid Glass theme bootstrap. Runs before React paints so
            the `liquid-glass` class is already on <html> when the override
            stylesheet evaluates — no FOUC into the default dark theme. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('lifemax.liquidGlass')==='1'){document.documentElement.classList.add('liquid-glass');}var L=localStorage.getItem('lifemax.lang');if(L==='zh'||L==='en'){document.documentElement.setAttribute('lang',L==='zh'?'zh-Hant':'en');}}catch(e){}`,
          }}
        />
      </head>
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
