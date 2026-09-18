import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Barlow_Condensed, Manrope } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TD Pool",
  description: "Weekly Anytime Touchdown Pool for your fantasy league",
  applicationName: "TD Pool",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TD Pool",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e0b",
  colorScheme: "dark",
  // Draw under the notch and home bar; the shell pads with env(safe-area-inset-*).
  viewportFit: "cover",
};

/**
 * The staging banner takes the status-bar inset so nothing else has to: it
 * sticks to the top at a fixed height, and the app shell's header sticks just
 * below it (`--banner-h`) with a plain top pad (`--top-inset` = 0).
 */
const STAGING = process.env.NEXT_PUBLIC_TD_POOL_ENV === "staging";
const stagingVars = {
  "--banner-h": "calc(2.25rem + env(safe-area-inset-top))",
  "--top-inset": "0px",
} as CSSProperties;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${barlow.variable} h-full antialiased`}
    >
      <body
        className="field-atmosphere min-h-full font-sans text-ink"
        style={STAGING ? stagingVars : undefined}
      >
        {STAGING && (
          <div className="sticky top-0 z-40 flex h-[var(--banner-h)] items-end justify-center bg-amber-200 px-4 pb-1.5 text-center text-[11px] font-semibold leading-tight text-amber-950">
            TD Pool V2 · Test environment · Simulated odds · Picks do not affect your live league
          </div>
        )}
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
