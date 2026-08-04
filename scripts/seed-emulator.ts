import { getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-vista-teacher";

if (!projectId.startsWith("demo-")) {
  throw new Error("Seed aborted: project ID must begin with 'demo-'.");
}

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;

const app = getApps().length ? getApp() : initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

const educators = [
  {
    uid: "free-educator",
    email: "free@vista.local",
    displayName: "Alex Rivera",
    role: "educator",
    plan: "free",
    subjects: ["science"],
    gradeLevel: "Middle School",
    city: "Portland",
    school: "Cedar Grove School",
  },
  {
    uid: "plus-educator",
    email: "plus@vista.local",
    displayName: "Maya Chen",
    role: "educator",
    plan: "plus",
    subjects: ["mathematics"],
    gradeLevel: "High School",
    city: "Toronto",
    school: "Lakeshore Collegiate",
  },
  {
    uid: "educator-three",
    email: "jordan@vista.local",
    displayName: "Jordan Okafor",
    role: "educator",
    plan: "free",
    subjects: ["language-arts"],
    gradeLevel: "Elementary",
    city: "Atlanta",
    school: "Northfield Academy",
  },
  {
    uid: "platform-admin",
    email: "admin@vista.local",
    displayName: "Sam Admin",
    role: "platform_admin",
    plan: "plus",
    subjects: ["school-leadership"],
    gradeLevel: "All Grades",
    city: "Chicago",
    school: "VistaTeacher",
  },
] as const;

async function upsertAuthUser(user: (typeof educators)[number]) {
  try {
    await auth.getUser(user.uid);
    await auth.updateUser(user.uid, {
      email: user.email,
      displayName: user.displayName,
      emailVerified: true,
      password: "VistaTeacher1!",
    });
  } catch {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      emailVerified: true,
      password: "VistaTeacher1!",
    });
  }

  await auth.setCustomUserClaims(user.uid, { role: user.role });
}

await Promise.all(educators.map(upsertAuthUser));

const batch = db.batch();
for (const educator of educators) {
  const normalizedName = educator.displayName.toLocaleLowerCase("en-US");
  batch.set(db.doc(`users/${educator.uid}`), {
    uid: educator.uid,
    displayName: educator.displayName,
    displayNameLower: normalizedName,
    photoURL: null,
    coverImageURL: null,
    role: educator.role,
    gradeLevel: educator.gradeLevel,
    subjects: educator.subjects,
    country: educator.city === "Toronto" ? "Canada" : "United States",
    city: educator.city,
    cityLower: educator.city.toLocaleLowerCase("en-US"),
    school: educator.school,
    schoolLower: educator.school.toLocaleLowerCase("en-US"),
    yearsOfExperience: 8,
    bio: "Development-only educator profile used with Firebase emulators.",
    website: null,
    interests: ["collaboration", "student-engagement"],
    searchKeywords: normalizedName.split(" "),
    isVerified: educator.uid === "plus-educator",
    followerCount: 0,
    followingCount: 0,
    resourceCount: educator.uid === "plus-educator" ? 1 : 0,
    postCount: 1,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`userPrivate/${educator.uid}`), {
    email: educator.email,
    contactDetails: {},
    privacySettings: { shareContactInfo: false },
    notificationSettings: { email: true, inApp: true },
    accountDeletion: { requestedAt: null },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`subscriptions/${educator.uid}`), {
    plan: educator.plan,
    status: educator.plan === "plus" ? "active" : "free",
    stripeCustomerId:
      educator.plan === "plus" ? `cus_demo_${educator.uid}` : null,
    stripeSubscriptionId:
      educator.plan === "plus" ? `sub_demo_${educator.uid}` : null,
    stripePriceId: educator.plan === "plus" ? "price_demo_plus_monthly" : null,
    billingInterval: educator.plan === "plus" ? "month" : null,
    currentPeriodEnd:
      educator.plan === "plus" ? new Date("2026-09-04T12:00:00.000Z") : null,
    cancelAtPeriodEnd: false,
    trialStartedAt: null,
    trialEndsAt: null,
    trialConsumed: false,
    stripeEventCreatedAt:
      educator.plan === "plus" ? new Date("2026-08-04T12:00:00.000Z") : null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

batch.set(db.doc("posts/demo-post"), {
  authorId: "free-educator",
  type: "question",
  content: "What routines help students make their thinking visible?",
  imageURLs: [],
  tags: ["student-voice", "discussion"],
  likeCount: 1,
  commentCount: 1,
  shareCount: 0,
  reportCount: 1,
  visibility: "public",
  moderationStatus: "approved",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("posts/demo-post/comments/demo-comment"), {
  authorId: "plus-educator",
  content:
    "Notice-and-wonder gives every student an accessible starting point.",
  moderationStatus: "approved",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("resources/demo-resource"), {
  authorId: "plus-educator",
  title: "Ecosystem Notice and Wonder",
  description: "A development-only discussion routine and organizer.",
  type: "activity",
  subject: "Science",
  gradeLevel: "Middle School",
  tags: ["ecosystems"],
  accessTier: "free",
  filePath: null,
  fileName: null,
  fileType: null,
  fileSize: null,
  thumbnailURL: null,
  externalURL: "https://example.com/demo-resource",
  downloadCount: 2,
  ratingAverage: 5,
  ratingCount: 1,
  status: "active",
  moderationStatus: "approved",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

const categoryNames = [
  "Classroom Management",
  "Lesson Planning",
  "Student Engagement",
  "Educational Technology",
  "Teacher Support",
  "Special Education",
  "Subject-Specific Teaching",
  "New Teacher Questions",
  "AI in Education",
];
const categoryIcons = [
  "LayoutGrid",
  "BookOpen",
  "Zap",
  "Monitor",
  "Heart",
  "Users",
  "MessageCircle",
  "HelpCircle",
  "Sparkles",
];
const categoryColors = [
  "#3B6B5C",
  "#3D70A2",
  "#D18B34",
  "#6F5A98",
  "#B95D65",
  "#3C8A78",
  "#A36A42",
  "#58799B",
  "#8A5C9E",
];
for (const [order, name] of categoryNames.entries()) {
  const id = name.toLocaleLowerCase("en-US").replaceAll(" ", "-");
  batch.set(db.doc(`forumCategories/${id}`), {
    name,
    description: `Development-only ${name.toLocaleLowerCase("en-US")} discussions.`,
    icon: categoryIcons[order],
    color: categoryColors[order],
    threadCount: id === "student-engagement" ? 1 : 0,
    postCount: id === "student-engagement" ? 2 : 0,
    order,
    active: true,
  });
}
batch.set(db.doc("forumThreads/demo-thread"), {
  authorId: "educator-three",
  categoryId: "student-engagement",
  title: "How do you structure student-led discussion?",
  content:
    "Share a routine that gives every learner a way into the conversation.",
  tags: ["discussion"],
  pinned: false,
  locked: false,
  solved: false,
  acceptedReplyId: null,
  viewCount: 4,
  likeCount: 0,
  replyCount: 1,
  reportCount: 0,
  moderationStatus: "approved",
  lastActivityAt: FieldValue.serverTimestamp(),
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("forumThreads/demo-thread/replies/demo-reply"), {
  authorId: "free-educator",
  content: "Silent writing before partner talk has worked well for us.",
  likeCount: 0,
  reportCount: 0,
  accepted: false,
  moderationStatus: "approved",
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("conversations/free-educator_plus-educator"), {
  participantIds: ["free-educator", "plus-educator"],
  lastMessagePreview: "I sent over the organizer we discussed.",
  lastMessageAt: FieldValue.serverTimestamp(),
  lastSenderId: "plus-educator",
  unreadCounts: { "free-educator": 1, "plus-educator": 0 },
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(
  db.doc("conversations/free-educator_plus-educator/messages/demo-message"),
  {
    senderId: "plus-educator",
    content: "I sent over the organizer we discussed.",
    attachment: null,
    readBy: ["plus-educator"],
    moderationStatus: "approved",
    createdAt: FieldValue.serverTimestamp(),
  },
);
batch.set(db.doc("users/free-educator/notifications/demo-notification"), {
  type: "message",
  actorId: "plus-educator",
  entityId: "free-educator_plus-educator",
  message: "Maya Chen sent you a message.",
  href: "/messages?conversation=free-educator_plus-educator",
  read: false,
  createdAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("reports/demo-report"), {
  reporterId: "educator-three",
  targetType: "post",
  targetId: "demo-post",
  reason: "other",
  description: "Development-only report for moderation testing.",
  status: "open",
  assignedAdminId: null,
  resolution: null,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("verificationRequests/demo-verification"), {
  uid: "educator-three",
  evidencePath: "verification/educator-three/demo-evidence.pdf",
  status: "pending",
  reviewerId: null,
  reason: null,
  reviewedAt: null,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("auditLogs/demo-audit"), {
  actorId: "platform-admin",
  action: "content.moderate",
  targetType: "resource",
  targetId: "demo-resource",
  previousState: { moderationStatus: "pending" },
  newState: { moderationStatus: "approved" },
  reason: "Development seed approval.",
  createdAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("platformStats/current"), {
  demoData: true,
  totalUsers: educators.length,
  plusSubscribers: 1,
  posts: 1,
  resources: 1,
  forumThreads: 1,
  pendingReports: 1,
  pendingVerifications: 1,
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("userAnalytics/plus-educator"), {
  demoData: true,
  profileViews: 384,
  postEngagements: 126,
  resourceDownloadsTotal: 218,
  forumContributions: 17,
  lessonsGeneratedTotal: 12,
  resourceDownloads: [
    { period: "Mar", value: 22 },
    { period: "Apr", value: 31 },
    { period: "May", value: 28 },
    { period: "Jun", value: 44 },
    { period: "Jul", value: 39 },
    { period: "Aug", value: 54 },
  ],
  followerGrowth: [
    { period: "Mar", value: 3 },
    { period: "Apr", value: 5 },
    { period: "May", value: 8 },
    { period: "Jun", value: 11 },
    { period: "Jul", value: 15 },
    { period: "Aug", value: 19 },
  ],
  profileViewTrend: [
    { period: "Mar", value: 38 },
    { period: "Apr", value: 49 },
    { period: "May", value: 55 },
    { period: "Jun", value: 72 },
    { period: "Jul", value: 78 },
    { period: "Aug", value: 92 },
  ],
  engagementTrend: [
    { period: "Mar", value: 12 },
    { period: "Apr", value: 18 },
    { period: "May", value: 17 },
    { period: "Jun", value: 24 },
    { period: "Jul", value: 26 },
    { period: "Aug", value: 29 },
  ],
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("userAnalytics/free-educator"), {
  demoData: true,
  profileViews: 42,
  postEngagements: 18,
  resourceDownloadsTotal: 0,
  forumContributions: 4,
  lessonsGeneratedTotal: 0,
  followerGrowth: [{ period: "Aug", value: 2 }],
  resourceDownloads: [],
  profileViewTrend: [{ period: "Aug", value: 42 }],
  engagementTrend: [{ period: "Aug", value: 18 }],
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(
  db.doc(`usage/free-educator_${new Date().toISOString().slice(0, 10)}`),
  {
    uid: "free-educator",
    period: new Date().toISOString().slice(0, 10),
    messages: 3,
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
batch.set(
  db.doc(`usage/free-educator_${new Date().toISOString().slice(0, 7)}`),
  {
    uid: "free-educator",
    period: new Date().toISOString().slice(0, 7),
    resourceUploads: 2,
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
const demoLessonContent = {
  title: "Investigating Local Ecosystems",
  subject: "Science",
  gradeLevel: "Grade 6",
  durationMinutes: 50,
  objectives: ["Describe relationships in a local food web."],
  materials: ["Species cards"],
  warmUp: { durationMinutes: 5, activity: "Notice and wonder." },
  mainActivity: {
    durationMinutes: 35,
    description: "Build and revise a food web model.",
    steps: ["Sort cards.", "Connect producers and consumers."],
  },
  closingActivity: {
    durationMinutes: 10,
    activity: "Complete an exit ticket.",
  },
  assessment: "Review models and exit tickets.",
  differentiation: {
    supports: ["Provide sentence frames."],
    extensions: ["Model a species removal."],
  },
  standards: ["MS-LS2-3"],
};
const demoLessonSource = {
  subject: "Science",
  gradeLevel: "Grade 6",
  topic: "Investigating local ecosystems",
  durationMinutes: 50,
  objectives: "Describe relationships in a local food web.",
  standards: "MS-LS2-3",
  studentNeeds: "Provide sentence frames for scientific explanations.",
  teachingStyle: "inquiry",
};
batch.set(db.doc("lessons/demo-lesson"), {
  ownerId: "plus-educator",
  source: demoLessonSource,
  content: demoLessonContent,
  status: "ready",
  generationStatus: "idle",
  currentVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.set(db.doc("lessons/demo-lesson/versions/v1"), {
  ownerId: "plus-educator",
  version: 1,
  kind: "generated",
  source: demoLessonSource,
  content: demoLessonContent,
  createdAt: FieldValue.serverTimestamp(),
});
batch.set(
  db.doc(`usage/plus-educator_${new Date().toISOString().slice(0, 7)}`),
  {
    uid: "plus-educator",
    period: new Date().toISOString().slice(0, 7),
    aiLessons: 12,
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);

await batch.commit();
console.log(
  `Seeded development data into Firebase emulator project ${projectId}.`,
);
