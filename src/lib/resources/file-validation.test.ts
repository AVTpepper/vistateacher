import { describe, expect, it } from "vitest";

import { resourceFileError } from "@/lib/resources/file-validation";

describe("resourceFileError", () => {
  it.each(["image/jpeg", "image/png", "image/heic", "image/heif"])(
    "accepts %s images",
    (type) => {
      expect(resourceFileError({ type, size: 1024 })).toBeNull();
    },
  );

  it("rejects unsupported and oversized files with specific messages", () => {
    expect(resourceFileError({ type: "image/gif", size: 1024 })).toContain(
      "not supported",
    );
    expect(
      resourceFileError({ type: "image/png", size: 25 * 1024 * 1024 + 1 }),
    ).toContain("too large");
  });
});
