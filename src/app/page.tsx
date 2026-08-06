import type { Metadata } from "next";

import { LandingPage } from "@/features/marketing/landing-page";

export const metadata: Metadata = {
  title: "VistaTeacher | Find your people in education",
  description:
    "VistaTeacher helps educators connect with peers, share resources, join thoughtful forum discussions, and grow their professional network.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <LandingPage />;
}
