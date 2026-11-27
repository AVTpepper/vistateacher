import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { PDFDocument } from "pdf-lib";
import type { WorksheetContent } from "../../src/schemas/worksheet";

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

// Only GIS and Drive are mocked. Authentication, immutable export snapshots,
// ownership, publication, Storage and downloads use the real emulator app APIs.
const GOOGLE_TOKEN = "mock-browser-only-google-access-token";
const GOOGLE_ACCOUNT = {
  id: "mock-drive-permission-id",
  email: "mock.teacher@example.com",
  name: "Mock Google Teacher",
};
const DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const KEY = "DEMO_PRIVATE_ANSWER_KEY_827";
const BRIEF = "DEMO_PRIVATE_TEACHING_BRIEF_916";

function emulator() {
  if (
    process.env.GCLOUD_PROJECT !== "demo-vista-teacher" ||
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !process.env.FIREBASE_STORAGE_EMULATOR_HOST
  )
    throw new Error("Google Docs checks require demo Firebase emulators.");
  const app =
    getApps().find((app) => app.name === "google-docs-e2e") ??
    initializeApp({ projectId: "demo-vista-teacher" }, "google-docs-e2e");
  return { db: getFirestore(app), auth: getAuth(app) };
}

async function teacher() {
  const { db, auth } = emulator();
  const uid = `google-docs-${randomUUID()}`;
  const email = `${uid}@vista.local`;
  const [profile, privateUser, subscription] = await Promise.all([
    db.doc("users/free-educator").get(),
    db.doc("userPrivate/free-educator").get(),
    db.doc("subscriptions/plus-educator").get(),
  ]);
  if (!profile.exists || !privateUser.exists || !subscription.exists)
    throw new Error(
      "Seed the demo teachers before Google Docs browser checks.",
    );
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: "VistaTeacher1!",
  });
  await Promise.all([
    db.doc(`users/${uid}`).set({
      ...profile.data(),
      uid,
      displayName: "Google Export Teacher",
      connectionCount: 0,
    }),
    db.doc(`userPrivate/${uid}`).set({ ...privateUser.data(), email }),
    db.doc(`subscriptions/${uid}`).set(subscription.data()!),
  ]);
  return { uid, email };
}

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("VistaTeacher1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
}

async function api<T>(
  page: Page,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const result = await page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
    { path, method, body },
  );
  return { ...result, body: result.body as T };
}

interface Worksheet {
  id: string;
  title: string;
  currentVersion: number;
  content: WorksheetContent;
}

async function worksheet(page: Page) {
  const created = await api<Worksheet>(page, "/api/worksheets", "POST", {
    requestId: randomUUID(),
    source: {
      subject: "Science",
      gradeLevel: "Grade 6",
      topic: "Local food webs",
      difficulty: "core",
      language: "Swedish",
      studentNeeds: BRIEF,
      questionCounts: {
        multipleChoice: 1,
        shortAnswer: 1,
        extendedResponse: 0,
        matching: 0,
        fillInBlank: 0,
        trueFalse: 0,
      },
    },
  });
  expect(created.status).toBe(201);
  const content = structuredClone(created.body.content);
  content.title = "Food webs ready to share";
  const answer = content.answerKey.find(
    (answer) => answer.type === "shortAnswer",
  );
  if (!answer || answer.type !== "shortAnswer")
    throw new Error("The two-question sample must contain a short answer.");
  answer.modelAnswer = KEY;
  const saved = await api<Worksheet>(
    page,
    `/api/worksheets/${created.body.id}`,
    "PATCH",
    { expectedVersion: 1, content },
  );
  expect(saved.status).toBe(200);
  expect(saved.body.currentVersion).toBe(2);
  await page.goto(`/worksheets/${created.body.id}`);
  await expect(
    page.getByRole("heading", { name: content.title, exact: true }),
  ).toBeVisible();
  return saved.body;
}

function docxXml(bytes: Buffer) {
  for (let position = 0; position < bytes.length - 46; position++) {
    if (bytes.readUInt32LE(position) !== 0x02014b50) continue;
    const nameLength = bytes.readUInt16LE(position + 28);
    if (
      bytes.subarray(position + 46, position + 46 + nameLength).toString() !==
      "word/document.xml"
    )
      continue;
    const size = bytes.readUInt32LE(position + 20);
    const local = bytes.readUInt32LE(position + 42);
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(start, start + size);
    return (
      bytes.readUInt16LE(position + 10) === 8
        ? inflateRawSync(compressed)
        : compressed
    ).toString();
  }
  throw new Error("Missing Word document XML.");
}

interface MockUpload {
  uri: string;
  metadata: {
    name: string;
    mimeType: string;
    appProperties: Record<string, string>;
  };
  declaredLength: number;
  bytes: Buffer;
  complete: boolean;
  document: { id: string; name: string; mimeType: string; trashed: boolean };
}

async function mockGoogle(page: Page) {
  const state = {
    sdkLoads: 0,
    failWrites: 0,
    uploads: [] as MockUpload[],
    calls: [] as { method: string; path: string }[],
    appTokenLeaks: [] as string[],
  };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin === new URL(page.url()).origin &&
      (request.postData()?.includes(GOOGLE_TOKEN) ||
        Object.values(request.headers()).some((value) =>
          value.includes(GOOGLE_TOKEN),
        ))
    )
      state.appTokenLeaks.push(url.pathname);
  });
  const pdf = await PDFDocument.create();
  pdf
    .addPage([612, 792])
    .drawText("Mocked Google Docs PDF export", { x: 48, y: 740 });
  const pdfBytes = Buffer.from(await pdf.save());
  await page.route("https://accounts.google.com/gsi/client", async (route) => {
    state.sdkLoads++;
    await route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){queueMicrotask(()=>config.callback({access_token:${JSON.stringify(GOOGLE_TOKEN)},expires_in:3600,scope:'https://www.googleapis.com/auth/drive.file'}));}};}}}};`,
    });
  });
  await page.route("https://www.googleapis.com/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Content-Range, X-Upload-Content-Type, X-Upload-Content-Length",
      "Access-Control-Expose-Headers": "Location, Range",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    state.calls.push({ method: request.method(), path: url.pathname });
    expect(request.headers().authorization).toBe(`Bearer ${GOOGLE_TOKEN}`);
    if (url.pathname === "/drive/v3/about") {
      await route.fulfill({
        headers,
        json: {
          user: {
            permissionId: GOOGLE_ACCOUNT.id,
            emailAddress: GOOGLE_ACCOUNT.email,
            displayName: GOOGLE_ACCOUNT.name,
          },
        },
      });
      return;
    }
    if (
      request.method() === "POST" &&
      url.pathname === "/upload/drive/v3/files"
    ) {
      expect(url.searchParams.get("ignoreDefaultVisibility")).toBe("true");
      expect(request.headers()["x-upload-content-type"]).toBe(DOCX_MIME);
      const metadata = request.postDataJSON() as MockUpload["metadata"];
      expect(metadata.mimeType).toBe(DOC_MIME);
      expect(metadata).not.toHaveProperty("parents");
      const id = `mock-native-doc-${state.uploads.length + 1}`;
      const uri = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}`;
      state.uploads.push({
        uri,
        metadata,
        declaredLength: Number(request.headers()["x-upload-content-length"]),
        bytes: Buffer.alloc(0),
        complete: false,
        document: {
          id,
          name: metadata.name,
          mimeType: DOC_MIME,
          trashed: false,
        },
      });
      await route.fulfill({
        status: 200,
        headers: { ...headers, Location: uri },
        body: "",
      });
      return;
    }
    const upload = state.uploads.find((upload) => upload.uri === request.url());
    if (request.method() === "PUT" && upload) {
      if (upload.complete) {
        await route.fulfill({ headers, json: upload.document });
        return;
      }
      if (request.headers()["content-range"].startsWith("bytes */")) {
        await route.fulfill({
          status: 308,
          headers: {
            ...headers,
            ...(upload.bytes.length
              ? { Range: `bytes=0-${upload.bytes.length - 1}` }
              : {}),
          },
          body: "",
        });
        return;
      }
      if (state.failWrites > 0) {
        state.failWrites--;
        await route.abort("failed");
        return;
      }
      const offset = Number(
        /^bytes (\d+)-/.exec(request.headers()["content-range"])?.[1],
      );
      expect(offset).toBe(upload.bytes.length);
      upload.bytes = Buffer.concat([upload.bytes, request.postDataBuffer()!]);
      expect(upload.bytes.length).toBe(upload.declaredLength);
      upload.complete = true;
      await route.fulfill({ status: 201, headers, json: upload.document });
      return;
    }
    const document = state.uploads.find(
      (upload) =>
        url.pathname === `/drive/v3/files/${upload.document.id}` ||
        url.pathname === `/drive/v3/files/${upload.document.id}/export`,
    );
    if (request.method() === "GET" && document?.complete) {
      await route.fulfill(
        url.pathname.endsWith("/export")
          ? {
              headers: { ...headers, "Content-Type": "application/pdf" },
              body: pdfBytes,
            }
          : { headers, json: document.document },
      );
      return;
    }
    // An unexpected permissions endpoint must fail, never reach live Google.
    await route.fulfill({
      status: 404,
      headers,
      json: { error: "Unexpected mocked Google endpoint" },
    });
  });
  return state;
}

async function openExport(page: Page) {
  await page.getByRole("button", { name: "Google Docs", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export to Google Docs" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: /^(Connect|Reconnect) Google Drive$|^Change Google account$/,
    }),
  ).toBeEnabled();
  return dialog;
}

async function connect(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Export to Google Docs" });
  await dialog
    .getByRole("button", { name: /^(Connect|Reconnect) Google Drive$/ })
    .click();
  await expect(
    dialog.getByText(`${GOOGLE_ACCOUNT.name} · ${GOOGLE_ACCOUNT.email}`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("status").filter({ hasText: /Connecting/ }),
  ).toHaveCount(0);
}

async function evidence(page: Page, project: string, name: string) {
  const directory = `${process.env.AUDIT_GOOGLE_DOCS_EVIDENCE_DIR ?? "docs/audit/evidence/google-docs"}/${project}`;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png` });
  const result = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  const geometry = await page.getByRole("dialog").evaluate((dialog) => ({
    overflow:
      document.documentElement.scrollWidth > innerWidth + 1 ||
      dialog.scrollWidth > dialog.clientWidth + 1,
    smallButtons: [
      ...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ]
      .filter((button) => {
        const box = button.getBoundingClientRect();
        return (
          box.width > 0 && box.height > 0 && (box.width < 43 || box.height < 43)
        );
      })
      .map((button) => button.getAttribute("aria-label") ?? button.textContent),
  }));
  expect(geometry).toEqual({ overflow: false, smallButtons: [] });
}

test("exports a saved private native Doc and publishes one separate frozen community copy", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(150_000);
  const owner = await teacher();
  const google = await mockGoogle(page);
  await signIn(page, owner.email);
  const source = await worksheet(page);
  expect(google.sdkLoads).toBe(0);
  const dialog = await openExport(page);
  await expect(dialog).toContainText("Student worksheet");
  await expect(dialog).toContainText("Saved version 2");
  await evidence(page, info.project.name, "connect-private-doc");
  await connect(page);
  await dialog
    .getByRole("button", { name: "Save to Google Docs", exact: true })
    .click();
  await expect(
    dialog.getByText("Your private Google Doc is ready", { exact: true }),
  ).toBeVisible();
  expect(google.uploads).toHaveLength(1);
  const uploaded = google.uploads[0];
  expect(uploaded.complete).toBe(true);
  const xml = docxXml(uploaded.bytes);
  expect(xml).toContain(source.title);
  expect(xml).not.toContain(KEY);
  expect(xml).not.toContain(BRIEF);
  expect(
    await dialog
      .getByRole("link", { name: "Open Google Doc" })
      .getAttribute("href"),
  ).toBe(`https://docs.google.com/document/d/${uploaded.document.id}/edit`);
  const jobs = await emulator()
    .db.collection(`users/${owner.uid}/teachingExports`)
    .get();
  expect(jobs.docs).toHaveLength(1);
  const job = jobs.docs[0];
  expect(job.data()).toMatchObject({
    version: 2,
    mode: "student",
    state: "complete",
    destination: GOOGLE_ACCOUNT,
  });
  expect(createHash("sha256").update(uploaded.bytes).digest("hex")).toBe(
    job.data().binaryHash,
  );
  const privateBinary = await page.request.get(
    `/api/teaching-exports/${job.id}/document`,
  );
  expect(privateBinary.status()).toBe(200);
  expect(privateBinary.headers()["cache-control"]).toBe("private, no-store");
  expect(privateBinary.headers()["x-document-sha256"]).toBe(
    job.data().binaryHash,
  );
  expect(await privateBinary.body()).toEqual(uploaded.bytes);
  expect(
    (
      await page.request.post("/api/teaching-exports", {
        headers: { Origin: "https://untrusted.example" },
        data: {
          kind: "worksheet",
          sourceId: source.id,
          version: 2,
          mode: "student",
          destination: GOOGLE_ACCOUNT,
        },
      })
    ).status(),
  ).toBe(403);
  const anonymous = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    expect(
      (await anonymous.request.get(`/api/teaching-exports/${job.id}`)).status(),
    ).toBe(401);
    expect(
      (
        await anonymous.request.get(`/api/teaching-exports/${job.id}/document`)
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  await evidence(page, info.project.name, "private-doc-ready");
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Download Google PDF", exact: true })
    .click();
  const pdf = await downloaded;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  await pdf.saveAs(info.outputPath("mock-google-export.pdf"));

  // Later private-source edits must not change the already reviewed export copy.
  const edited = await api<Worksheet>(
    page,
    `/api/worksheets/${source.id}`,
    "PATCH",
    {
      expectedVersion: 2,
      content: { ...source.content, title: "Later private worksheet edit" },
    },
  );
  expect(edited.status).toBe(200);
  await dialog
    .getByRole("checkbox", {
      name: "Publish a Word copy of this saved version",
      exact: true,
    })
    .check();
  await dialog
    .getByLabel("Resource title", { exact: true })
    .fill("Community food webs worksheet");
  await dialog
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A reviewed two-question worksheet for exploring local food webs.");
  await dialog
    .getByRole("checkbox", { name: /I have reviewed this material/ })
    .check();
  await evidence(page, info.project.name, "review-community-copy");

  let lostPublicationResponse = false;
  await page.route("**/api/teaching-exports/*/publish", async (route) => {
    if (lostPublicationResponse) return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    lostPublicationResponse = true;
    await route.abort("failed");
  });
  await dialog
    .getByRole("button", { name: "Publish Word copy", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your private Google Doc is kept.",
  );
  await expect(
    dialog.getByRole("link", { name: "Open Google Doc" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Retry publishing Word copy", exact: true })
    .click();
  await expect(
    dialog.getByText(
      "Community resource copy created. Your Google Doc remains private.",
      { exact: true },
    ),
  ).toBeVisible();
  const href = await dialog
    .getByRole("link", { name: "View published resource", exact: true })
    .getAttribute("href");
  const resourceId = href!.split("/").at(-1)!;
  const resources = await emulator()
    .db.collection("resources")
    .where("authorId", "==", owner.uid)
    .get();
  expect(resources.docs).toHaveLength(1);
  expect(resources.docs[0].id).toBe(resourceId);
  const resource = resources.docs[0].data();
  expect(resource).toMatchObject({
    status: "active",
    accessTier: "free",
    fileType: DOCX_MIME,
  });
  expect(JSON.stringify(resource)).not.toContain(uploaded.document.id);
  expect(JSON.stringify(resource)).not.toContain(uploaded.uri);
  expect(JSON.stringify(resource)).not.toContain(GOOGLE_TOKEN);
  const publicDownload = await page.request.get(
    `/api/resources/${resourceId}/download`,
  );
  expect(publicDownload.status()).toBe(200);
  expect(await publicDownload.body()).toEqual(uploaded.bytes);
  expect(docxXml(await publicDownload.body())).not.toContain(
    "Later private worksheet edit",
  );
  await evidence(page, info.project.name, "community-copy-published");

  await dialog
    .getByRole("button", { name: "Close export to google docs", exact: true })
    .click();
  await openExport(page);
  // Component memory keeps the connected account and existing native document.
  await expect(
    dialog.getByRole("link", { name: "Open Google Doc" }),
  ).toBeVisible();
  expect(google.uploads).toHaveLength(1);
  await dialog
    .getByRole("link", { name: "View published resource", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/resources/${resourceId}$`));
  await expect(
    page.getByRole("heading", {
      name: "Community food webs worksheet",
      exact: true,
    }),
  ).toBeVisible();
  const outsider = await teacher();
  const otherContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  });
  try {
    const otherPage = await otherContext.newPage();
    await signIn(otherPage, outsider.email);
    expect(
      (await otherPage.request.get(`/api/teaching-exports/${job.id}`)).status(),
    ).toBe(404);
    expect(
      (
        await otherPage.request.get(`/api/teaching-exports/${job.id}/document`)
      ).status(),
    ).toBe(404);
    const shared = await otherPage.request.get(
      `/api/resources/${resourceId}/download`,
    );
    expect(shared.status()).toBe(200);
    expect(await shared.body()).toEqual(uploaded.bytes);
  } finally {
    await otherContext.close();
  }
  expect(
    google.calls.filter((call) => call.path.includes("permissions")),
  ).toEqual([]);
  expect(google.appTokenLeaks).toEqual([]);
  await writeFile(
    `docs/audit/evidence/google-docs/${info.project.name}/mocked-flow.json`,
    JSON.stringify(
      {
        googleNetwork:
          "mocked GIS + Drive only; no real Google account or file was used",
        appApi: "real local Firebase emulators",
        savedVersion: 2,
        sourceLaterEditedToVersion: 3,
        studentAnswerKeyExcluded: true,
        privateBriefExcluded: true,
        publicationLostResponseRecovered: true,
        publishedCopies: resources.size,
        publishedResourceNavigationVerified: true,
        independentTeacherDownloadVerified: true,
        ownerBinaryNoStoreAndHashVerified: true,
        anonymousPrivateAccessDenied: true,
        untrustedOriginRejected: true,
        googlePermissionMutations: 0,
        googleUploadInitiations: google.uploads.length,
        googleTokenSentToApp: false,
      },
      null,
      2,
    ),
  );
});

test("retries an interrupted upload with its saved URI and labels answer-key sharing explicitly", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const owner = await teacher();
  const google = await mockGoogle(page);
  await signIn(page, owner.email);
  const source = await worksheet(page);
  await page.getByRole("tab", { name: "Answer key", exact: true }).click();
  const dialog = await openExport(page);
  await expect(dialog).toContainText("Teacher answer key");
  await expect(dialog).toContainText("Saved version 2");
  await connect(page);
  google.failWrites = 3;
  await dialog
    .getByRole("button", { name: "Save to Google Docs", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Google Drive could not be reached",
  );
  await expect(
    dialog.getByRole("button", { name: "Continue saved export", exact: true }),
  ).toBeEnabled();
  expect(google.uploads).toHaveLength(1);
  expect(google.uploads[0].complete).toBe(false);
  await evidence(page, info.project.name, "saved-upload-retry");
  const jobs = await emulator()
    .db.collection(`users/${owner.uid}/teachingExports`)
    .get();
  expect(jobs.docs).toHaveLength(1);
  expect(jobs.docs[0].data()).toMatchObject({
    state: "uploading",
    mode: "key",
    uploadSessionUri: google.uploads[0].uri,
    claim: null,
  });
  await dialog
    .getByRole("button", { name: "Continue saved export", exact: true })
    .click();
  await expect(
    dialog.getByText("Your private Google Doc is ready", { exact: true }),
  ).toBeVisible();
  expect(google.uploads).toHaveLength(1);
  expect(docxXml(google.uploads[0].bytes)).toContain(KEY);
  expect(docxXml(google.uploads[0].bytes)).not.toContain(BRIEF);
  await dialog
    .getByRole("checkbox", {
      name: "Publish a Word copy of this saved version",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("checkbox", { name: /I have reviewed this material/ })
    .check();
  await expect(
    dialog.getByRole("button", { name: "Publish Word copy", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("checkbox", {
      name: /This copy contains teacher answers/,
    }),
  ).not.toBeChecked();
  await evidence(page, info.project.name, "answer-key-publication-warning");
  // Do not publish the key: verify the extra explicit choice is required.
  expect(
    (
      await emulator()
        .db.collection("resources")
        .where("authorId", "==", owner.uid)
        .get()
    ).empty,
  ).toBe(true);
  await dialog
    .getByRole("button", { name: "Close export to google docs", exact: true })
    .click();
  await page.reload();
  await page.getByRole("tab", { name: "Answer key", exact: true }).click();
  await openExport(page);
  await connect(page);
  await expect(
    dialog.getByRole("link", { name: "Open Google Doc" }),
  ).toBeVisible();
  expect(google.uploads).toHaveLength(1);
  expect(
    google.calls.some(
      (call) =>
        call.method === "GET" &&
        call.path === `/drive/v3/files/${google.uploads[0].document.id}`,
    ),
  ).toBe(true);
  expect(
    (await api<Worksheet>(page, `/api/worksheets/${source.id}`)).body
      .currentVersion,
  ).toBe(2);
  expect(
    google.calls.filter((call) => call.path.includes("permissions")),
  ).toEqual([]);
  expect(google.appTokenLeaks).toEqual([]);
});

test("exports the saved lesson from its real toolbar and reconnects to the existing private Doc", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const owner = await teacher();
  const google = await mockGoogle(page);
  await signIn(page, owner.email);
  const created = await api<{
    id: string;
    title: string;
    currentVersion: number;
  }>(page, "/api/ai-lessons", "POST", {
    requestId: randomUUID(),
    source: {
      subject: "Music and local history",
      gradeLevel: "Ages 8–10, mixed ability",
      topic: "Stories through local folk songs",
      durationMinutes: 40,
      teachingStyle: "balanced",
      language: "English",
      curriculum: "Sweden, Lgr22",
      availableMaterials: "Paper and pencils",
      studentNeeds: BRIEF,
      additionalInstructions: "DEMO_PRIVATE_LESSON_INSTRUCTIONS_927",
    },
  });
  expect(created.status).toBe(201);
  expect(created.body.currentVersion).toBe(1);
  await page.goto(`/ai-lessons?lesson=${created.body.id}`);
  await expect(
    page.getByRole("heading", { name: created.body.title, exact: true }),
  ).toBeVisible();
  expect(google.sdkLoads).toBe(0);
  const dialog = await openExport(page);
  await expect(dialog).toContainText("Lesson plan");
  await expect(dialog).toContainText("Saved version 1");
  await evidence(page, info.project.name, "lesson-connect-private-doc");
  await connect(page);
  await dialog
    .getByRole("button", { name: "Save to Google Docs", exact: true })
    .click();
  await expect(
    dialog.getByText("Your private Google Doc is ready", { exact: true }),
  ).toBeVisible();
  expect(google.uploads).toHaveLength(1);
  const uploaded = google.uploads[0];
  expect(uploaded.complete).toBe(true);
  const xml = docxXml(uploaded.bytes);
  expect(xml).toContain("Stories through local folk songs");
  expect(xml).toContain("Music and local history");
  expect(xml).not.toContain(BRIEF);
  expect(xml).not.toContain("DEMO_PRIVATE_LESSON_INSTRUCTIONS_927");
  const jobs = await emulator()
    .db.collection(`users/${owner.uid}/teachingExports`)
    .get();
  expect(jobs.docs).toHaveLength(1);
  expect(jobs.docs[0].data()).toMatchObject({
    kind: "lesson",
    sourceId: created.body.id,
    version: 1,
    mode: "student",
    state: "complete",
    defaults: { type: "lesson-plan" },
  });
  expect(
    (
      await api(page, "/api/teaching-exports", "POST", {
        kind: "lesson",
        sourceId: created.body.id,
        version: 1,
        mode: "key",
        destination: GOOGLE_ACCOUNT,
      })
    ).status,
  ).toBe(400);
  await evidence(page, info.project.name, "lesson-private-doc-ready");
  await dialog
    .getByRole("button", { name: "Close export to google docs", exact: true })
    .click();
  await page.reload();
  await openExport(page);
  await connect(page);
  await expect(
    dialog.getByRole("link", { name: "Open Google Doc" }),
  ).toHaveAttribute(
    "href",
    `https://docs.google.com/document/d/${uploaded.document.id}/edit`,
  );
  expect(google.uploads).toHaveLength(1);
  expect(
    (await emulator().db.collection(`users/${owner.uid}/teachingExports`).get())
      .size,
  ).toBe(1);
  expect(
    google.calls.filter((call) => call.path.includes("permissions")),
  ).toEqual([]);
  expect(google.appTokenLeaks).toEqual([]);
});
