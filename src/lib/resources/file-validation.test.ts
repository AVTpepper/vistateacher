import { describe, expect, it } from "vitest";

import {
  resourceFileContentType,
  resourceFileError,
} from "@/lib/resources/file-validation";

describe("resourceFileError", () => {
  it.each(["image/jpeg", "image/png", "image/heic", "image/heif"])(
    "accepts %s images",
    (type) => {
      const extension = type.split("/").at(-1)!;
      expect(
        resourceFileError({
          name: `classroom.${extension}`,
          type,
          size: 1024,
        }),
      ).toBeNull();
    },
  );

  it("rejects unsupported and oversized files with specific messages", () => {
    expect(
      resourceFileError({
        name: "animation.gif",
        type: "image/gif",
        size: 1024,
      }),
    ).toContain("not supported");
    expect(
      resourceFileError({
        name: "classroom.png",
        type: "image/png",
        size: 25 * 1024 * 1024 + 1,
      }),
    ).toContain("too large");
  });

  it("normalizes PowerPoint files by extension when mobile MIME data is missing", () => {
    expect(resourceFileContentType("lesson.PPT")).toBe(
      "application/vnd.ms-powerpoint",
    );
    expect(resourceFileContentType("lesson.PPTX")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(
      resourceFileError({ name: "lesson.pptx", type: "", size: 1024 }),
    ).toBeNull();
  });
});
