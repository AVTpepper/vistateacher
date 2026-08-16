import { describe, expect, it } from "vitest";

import {
  formatPostFileSize,
  normalizedHttpURL,
  postFileContentType,
  postFileError,
} from "@/lib/feed/attachments";

describe("post attachments", () => {
  it("recognizes supported classroom document extensions", () => {
    expect(postFileContentType("lesson-plan.PDF")).toBe("application/pdf");
    expect(postFileContentType("grades.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(postFileContentType("lesson.PPT")).toBe(
      "application/vnd.ms-powerpoint",
    );
    expect(postFileContentType("lesson.PPTX")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(postFileContentType("archive.zip")).toBeNull();
  });

  it("rejects unsupported and oversized files", () => {
    expect(postFileError({ name: "archive.zip", size: 10 })).toMatch(/Choose/);
    expect(
      postFileError({ name: "lesson.pdf", size: 25 * 1024 * 1024 + 1 }),
    ).toMatch(/25 MB/);
    expect(postFileError({ name: "lesson.pdf", size: 1_024 })).toBeNull();
  });

  it("normalizes web links and rejects non-web protocols", () => {
    expect(normalizedHttpURL("example.com/lesson")).toBe(
      "https://example.com/lesson",
    );
    expect(normalizedHttpURL("javascript:alert(1)")).toBeNull();
  });

  it("formats attachment sizes", () => {
    expect(formatPostFileSize(512)).toBe("512 bytes");
    expect(formatPostFileSize(2_048)).toBe("2.0 KB");
    expect(formatPostFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});
