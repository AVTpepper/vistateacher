"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { FileText, HelpCircle, ImagePlus, Tag, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/ui/user-avatar";
import { MentionTextarea } from "@/features/mentions/mention-textarea";
import { getFirebaseClient } from "@/lib/firebase/client";
import type { MentionTarget } from "@/lib/mentions/types";
import { cn } from "@/lib/utils";
import type { CreatePostInput } from "@/schemas/feed";

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
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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

  async function submit() {
    if (!content.trim() || submitting || uploading) return;
    setSubmitting(true);
    const created = await onCreate({
      type,
      content: content.trim(),
      imageURLs: imageURL ? [imageURL] : [],
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
            className="bg-muted text-foreground placeholder:text-muted-foreground mt-2 h-9 w-full rounded-lg px-3 text-xs outline-none"
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
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || Boolean(imageURL)}
              title="Add image"
              aria-label="Add image"
              className="text-muted-foreground hover:bg-muted hover:text-foreground grid size-9 place-items-center rounded-lg disabled:opacity-50"
            >
              <ImagePlus aria-hidden="true" className="size-4" />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
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
                className="text-primary group-hover:text-accent size-4 transition-colors"
              />
              {action}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
