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
    "A professional community where educators connect, share resources, discuss practice, and build thoughtful lessons.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "VistaTeacher",
    title: "The network built for teachers",
    description:
      "Connect with educators, share practical resources, and plan stronger lessons.",
  },
  twitter: {
    card: "summary_large_image",
    title: "VistaTeacher",
    description: "The professional network built for teachers.",
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
