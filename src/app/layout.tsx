import type { Metadata } from "next";
import type { CSSProperties } from "react";
import localFont from "next/font/local";
import { Toaster } from "sonner";

import "./globals.css";

const displayFont = localFont({
  src: "../../public/fonts/DM-Serif-Display-Regular.ttf",
  variable: "--font-display",
  weight: "400",
});

const bodyFont = localFont({
  src: "../../public/fonts/Plus-Jakarta-Sans-Variable.ttf",
  weight: "200 800",
  variable: "--font-body",
});

const monoFont = localFont({
  src: "../../public/fonts/JetBrains-Mono-Variable.ttf",
  weight: "100 800",
  variable: "--font-mono",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "VistaTeacher | Find your people in education",
    template: "%s | VistaTeacher",
  },
  description:
    "A professional community where educators connect with peers, share resources, discuss practice, and build thoughtful lessons. Discover people by subject, grade, and teaching context.",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "VistaTeacher",
    title: "Find your people in education",
    description:
      "Connect with educators who share your subjects, curriculum, interests, and ambitions. Build your professional network and grow together.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "VistaTeacher - professional network for educators",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@vistateacher",
    title: "VistaTeacher | Find your people in education",
    description:
      "Professional community for educators to connect, collaborate, and build stronger teaching practice together.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      >
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          style={
            {
              "--success-text": "#166534",
              "--error-text": "#991b1b",
              "--warning-text": "#854d0e",
              "--info-text": "#1e40af",
            } as CSSProperties
          }
        />
      </body>
    </html>
  );
}
