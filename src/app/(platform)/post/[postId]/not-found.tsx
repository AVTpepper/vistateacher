import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function PostNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-5 lg:px-6">
      <section className="surface-card px-6 py-14 text-center">
        <FileQuestion
          aria-hidden="true"
          className="text-muted-foreground/40 mx-auto size-9"
        />
        <h1 className="mt-3 font-serif text-2xl">Post unavailable</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This post may have been deleted, moderated, or shared with an invalid
          link.
        </p>
        <Button asChild className="mt-5">
          <Link href="/app">Return to the feed</Link>
        </Button>
      </section>
    </div>
  );
}
