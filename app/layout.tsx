import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { VersionToast } from "@/components/version-toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Delphi Human Design",
  description: "Personalized Human Design readings.",
};

// Without this a phone renders the page at desktop width and shrinks it, so
// everything arrives too small to read and too small to tap.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <VersionToast />
      </body>
    </html>
  );
}
