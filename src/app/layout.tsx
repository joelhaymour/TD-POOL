import type { Metadata } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${barlow.variable} h-full antialiased`}
    >
      <body className="field-atmosphere min-h-full font-sans text-ink">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
