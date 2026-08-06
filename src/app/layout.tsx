import type { Metadata } from "next";
import {
  DM_Serif_Display,
  JetBrains_Mono,
  Plus_Jakarta_Sans,
} from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const displayFont = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "VistaTeacher | The network built for teachers",
    template: "%s | VistaTeacher",
  },
  description:
    "Connect, collaborate, share resources, and grow professionally with educators who understand your work.",
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
    title: "The network built for teachers",
    description:
      "Build your professional network, exchange practical ideas, and strengthen classroom practice together.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "VistaTeacher",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VistaTeacher",
    description:
      "Connect, collaborate, and grow with an educator-first professional network.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
      >
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
