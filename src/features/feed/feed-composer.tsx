"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import {
  FileText,
  FileUp,
  HelpCircle,
  ImagePlus,
  Link2,
  Tag,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import { MentionTextarea } from "@/features/mentions/mention-textarea";
import {
  formatPostFileSize,
  normalizedHttpURL,
  POST_FILE_ACCEPT,
  postFileContentType,
  postFileError,
} from "@/lib/feed/attachments";
import { getFirebaseClient } from "@/lib/firebase/client";
import type { MentionTarget } from "@/lib/mentions/types";
import { cn } from "@/lib/utils";
import type { CreatePostInput, PostFileAttachment } from "@/schemas/feed";

interface ComposerAccount {
  uid: string;
  displayName: string;
  photoURL: string | null;
}

interface FeedComposerProps {
  account: ComposerAccount;
  onCreate: (input: CreatePostInput) => Promise<boolean>;
}

const types = [
  { value: "post" as const, label: "Post", action: "Share", icon: FileText },
  {
    value: "resource" as const,
    label: "Resource",
    action: "Resource",
    icon: Tag,
  },
  {
    value: "question" as const,
    label: "Question",
    action: "Ask",
    icon: HelpCircle,
  },
];

export function FeedComposer({ account, onCreate }: FeedComposerProps) {
  const [expanded, setExpanded] = useState(false);
  const [type, setType] = useState<CreatePostInput["type"]>("post");
  const [content, setContent] = useState("");
  const [mentions, setMentions] = useState<MentionTarget[]>([]);
  const [tags, setTags] = useState("");
  const [imageURL, setImageURL] = useState<string | null>(null);
  const [fileAttachment, setFileAttachment] =
    useState<PostFileAttachment | null>(null);
  const [linkURL, setLinkURL] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstName = account.displayName.split(" ")[0] || "Educator";

  async function uploadImage(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Images must be 10 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `posts/${account.uid}/${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
      const object = ref(getFirebaseClient().storage, path);
      await uploadBytes(object, file, { contentType: file.type });
      setImageURL(await getDownloadURL(object));
    } catch {
      toast.error("We couldn't upload that image.");
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(file: File) {
    const error = postFileError(file);
    if (error) {
      toast.error(error);
      return;
    }
    const contentType = postFileContentType(file.name);
    if (!contentType) return;
    setUploading(true);
    try {
      const extension = file.name.split(".").at(-1)!.toLocaleLowerCase("en-US");
      const path = `posts/${account.uid}/${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;
      const object = ref(getFirebaseClient().storage, path);
      await uploadBytes(object, file, { contentType });
      setFileAttachment({
        name: file.name,
        url: await getDownloadURL(object),
        contentType,
        size: file.size,
      });
    } catch {
      toast.error("We couldn't upload that file.");
    } finally {
      setUploading(false);
    }
  }

  function attachWebLink() {
    const normalized = normalizedHttpURL(linkDraft);
    if (!normalized) {
      toast.error("Enter a valid web link.");
      return;
    }
    setLinkURL(normalized);
    setLinkDraft("");
    setLinkEditorOpen(false);
  }

  async function submit() {
    if (!content.trim() || submitting || uploading) return;
    setSubmitting(true);
    const created = await onCreate({
      type,
      content: content.trim(),
      imageURLs: imageURL ? [imageURL] : [],
      fileAttachments: fileAttachment ? [fileAttachment] : [],
      linkURLs: linkURL ? [linkURL] : [],
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      resourceId: null,
      mentionUids: mentions.map((mention) => mention.uid),
    });
    setSubmitting(false);
    if (!created) return;
    setContent("");
    setMentions([]);
    setTags("");
    setImageURL(null);
    setFileAttachment(null);
    setLinkURL(null);
    setLinkDraft("");
    setLinkEditorOpen(false);
    setType("post");
    setExpanded(false);
  }

  return (
    <section className="surface-card before:from-primary before:to-accent relative overflow-hidden p-4 pt-5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-linear-to-r">
      <div className="flex items-center gap-3">
        <UserAvatar
          name={account.displayName}
          photoURL={account.photoURL}
          className="size-10 shrink-0 rounded-full text-xs"
        />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="bg-muted text-muted-foreground hover:bg-muted/70 flex-1 rounded-lg px-4 py-2.5 text-left text-sm transition-colors"
        >
          {expanded
            ? "Share with the community"
            : `What's on your mind, ${firstName}?`}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3">
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Post type">
            {types.map(({ value, label, icon: Icon }) => (
              <button
                type="button"
                key={value}
                onClick={() => setType(value)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                  type === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <MentionTextarea
            autoFocus
            value={content}
            mentions={mentions}
            onMentionsChange={setMentions}
            excludeUid={account.uid}
            maxLength={5_000}
            onValueChange={setContent}
            placeholder={
              type === "question"
                ? "Ask your fellow educators a question..."
                : type === "resource"
                  ? "Describe the resource you're sharing..."
                  : "Share a classroom win, challenge, or useful insight..."
            }
            className="text-foreground placeholder:text-muted-foreground min-h-24 w-full resize-none bg-transparent text-sm leading-6 outline-none"
          />
          <p className="text-muted-foreground mt-1 text-[11px]">
            Type @ and an educator&apos;s name to tag them.
          </p>
          <input
            value={tags}
            maxLength={160}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Tags, separated by commas"
            className="bg-muted text-foreground placeholder:text-muted-foreground mt-2 h-10 w-full rounded-lg px-3 text-base outline-none md:text-xs"
          />
          {imageURL && (
            <div className="bg-muted mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-xs">
              <span className="truncate">Image ready to share</span>
              <button
                type="button"
                onClick={() => setImageURL(null)}
                aria-label="Remove image"
                className="text-muted-foreground hover:text-foreground grid size-7 place-items-center rounded-md"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          )}
          {fileAttachment && (
            <div className="bg-muted mt-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs">
              <span className="min-w-0 truncate">
                {fileAttachment.name} ·{" "}
                {formatPostFileSize(fileAttachment.size)}
              </span>
              <button
                type="button"
                onClick={() => setFileAttachment(null)}
                aria-label="Remove attached file"
                className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded-md"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          )}
          {linkURL && (
            <div className="bg-muted mt-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs">
              <span className="min-w-0 truncate">{linkURL}</span>
              <button
                type="button"
                onClick={() => setLinkURL(null)}
                aria-label="Remove web link"
                className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center rounded-md"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          )}
          {linkEditorOpen && !linkURL && (
            <div className="bg-muted mt-2 rounded-lg p-2">
              <label htmlFor="post-web-link" className="sr-only">
                Web link
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="post-web-link"
                  type="url"
                  inputMode="url"
                  autoFocus
                  value={linkDraft}
                  onChange={(event) => setLinkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      attachWebLink();
                    }
                  }}
                  placeholder="https://example.com"
                  className="bg-background text-foreground placeholder:text-muted-foreground h-10 min-w-0 flex-1 rounded-lg border px-3 text-base outline-none md:text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={attachWebLink}
                    className="bg-primary text-primary-foreground h-10 rounded-lg px-3 text-sm font-bold"
                  >
                    Attach link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkEditorOpen(false);
                      setLinkDraft("");
                    }}
                    aria-label="Cancel adding web link"
                    className="text-muted-foreground hover:bg-background grid size-10 place-items-center rounded-lg"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploading || Boolean(imageURL)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold disabled:opacity-50"
              >
                <ImagePlus aria-hidden="true" className="size-4" />
                Add image
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || Boolean(fileAttachment)}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold disabled:opacity-50"
              >
                <FileUp aria-hidden="true" className="size-4" />
                Add file
              </button>
              <button
                type="button"
                onClick={() => setLinkEditorOpen(true)}
                disabled={Boolean(linkURL) || linkEditorOpen}
                className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold disabled:opacity-50"
              >
                <Link2 aria-hidden="true" className="size-4" />
                Add web link
              </button>
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose an image to attach"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.target.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={POST_FILE_ACCEPT}
              aria-label="Choose a file to attach"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.target.value = "";
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-muted-foreground hover:bg-muted h-9 rounded-lg px-3 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!content.trim() || submitting || uploading}
                className="bg-primary text-primary-foreground h-9 rounded-lg px-5 text-sm font-bold disabled:opacity-50"
              >
                {uploading ? "Uploading" : submitting ? "Posting" : "Post"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex border-t pt-3">
          {types.map(({ value, action, icon: Icon }) => (
            <button
              type="button"
              key={value}
              onClick={() => {
                setType(value);
                setExpanded(true);
              }}
              className="text-muted-foreground hover:bg-secondary hover:text-primary group flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors"
            >
              <Icon
                aria-hidden="true"
                className="text-primary group-hover:text-accent-readable size-4 transition-colors"
              />
              {action}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
