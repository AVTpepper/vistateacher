import { describe, expect, it } from "vitest";
import { attachmentDeliveryURL, attachmentIdFromURL, firebaseObjectURL, isPostMediaURL, legacyMediaSlot, ownedPostObjectPath } from "./media-paths";

describe("controlled post media identity", () => {
  const id = "d26e2cf4-057c-45a4-a209-1d25c1954c48";
  const bucket = "demo-vista-teacher.appspot.com";
  const path = "posts/owner/random-upload-folder/image.png";
  const tokenURL = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=secret-not-forwarded`;
  it("accepts only exact delivery references without arbitrary query paths", () => {
    expect(attachmentIdFromURL(attachmentDeliveryURL(id))).toBe(id);
    expect(attachmentIdFromURL(`/api/feed/attachments/${id}?path=other`)).toBeNull();
    expect(legacyMediaSlot("/api/feed/post-one/media/image/0")).toEqual({ postId: "post-one", kind: "image", slot: 0 });
    for (const value of ["//attacker.test/file", "/api/private/file", "javascript:alert(1)", "data:image/png;base64,abc"]) expect(isPostMediaURL(value)).toBe(false);
  });
  it("maps only this configured bucket and validates the stored author prefix", () => {
    expect(firebaseObjectURL(tokenURL, bucket)).toEqual({ path });
    expect(ownedPostObjectPath(path, "owner")).toBe(true);
    expect(ownedPostObjectPath(path, "another-owner")).toBe(false);
    expect(firebaseObjectURL(tokenURL, "different-bucket")).toBeNull();
    expect(firebaseObjectURL("https://attacker.test/file?url=" + encodeURIComponent(tokenURL), bucket)).toBeNull();
  });
  it("rejects ambiguous paths and permits only the explicitly configured local emulator", () => {
    const invalid = tokenURL.replace(encodeURIComponent(path), encodeURIComponent("posts/owner/../image.png"));
    expect(firebaseObjectURL(invalid, bucket)).toEqual({ path: null });
    const local = tokenURL.replace("https://firebasestorage.googleapis.com", "http://127.0.0.1:9199");
    expect(firebaseObjectURL(local, bucket)).toBeNull();
    expect(firebaseObjectURL(local, bucket, "127.0.0.1:9199")).toEqual({ path });
    expect(firebaseObjectURL(local, bucket, "127.0.0.1:9299")).toBeNull();
  });
});
