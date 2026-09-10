import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Flatrun — Revenue Control",
  description: "Automated reconciliation and exception detection for real-estate finance teams. Find the money your leases say you should have collected but didn't.",
  keywords: ["real estate", "reconciliation", "revenue control", "property management", "Nigeria", "PropTech"],
  authors: [{ name: "Flatrun" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Flatrun — Revenue Control",
    description: "Automated reconciliation and exception detection for real-estate finance teams.",
    siteName: "Flatrun",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flatrun — Revenue Control",
    description: "Automated reconciliation and exception detection for real-estate finance teams.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
