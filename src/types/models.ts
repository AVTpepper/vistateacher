export type UserRole = "educator" | "school_admin" | "platform_admin";
export type UserStatus = "active" | "suspended" | "deleted";
export type Plan = "free" | "plus";
export type SubscriptionStatus =
  "free" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export interface SubscriptionRecord {
  plan: Plan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  billingInterval: "month" | "year" | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialConsumed: boolean;
  updatedAt: Date;
}

export interface ProfileSearchResult {
  uid: string;
  displayName: string;
  photoURL: string | null;
  gradeLevel: string;
  subjects: string[];
  school: string;
  city: string;
  isVerified: boolean;
}

export interface LessonPlan {
  title: string;
  subject: string;
  gradeLevel: string;
  durationMinutes: number;
  objectives: string[];
  materials: string[];
  warmUp: { durationMinutes: number; activity: string };
  mainActivity: {
    durationMinutes: number;
    description: string;
    steps: string[];
  };
  closingActivity: { durationMinutes: number; activity: string };
  assessment: string;
  differentiation: { supports: string[]; extensions: string[] };
  standards: string[];
}
