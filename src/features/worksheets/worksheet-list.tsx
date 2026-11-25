"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WorksheetWorkspace } from "@/lib/worksheets/server";
import { worksheetResult } from "./request";

export function WorksheetList({ initial }: { initial: WorksheetWorkspace }) {
  const [workspace, setWorkspace] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function loadMore() {
    if (pending || !workspace.nextCursor) return;
    setPending(true);
    setError("");
    try {
      const next = await worksheetResult<WorksheetWorkspace>(
        await fetch(
          `/api/worksheets?cursor=${encodeURIComponent(workspace.nextCursor)}`,
        ),
      );
      setWorkspace((current) => ({
        ...next,
        worksheets: Array.from(
          new Map(
            [...current.worksheets, ...next.worksheets].map((item) => [
              item.id,
              item,
            ]),
          ).values(),
        ),
      }));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load worksheets.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Worksheets</h1>
          <p className="text-muted-foreground mt-2">
            Your questions, your answer keys. Private to you.
          </p>
        </div>
        <Button asChild>
          <Link href="/worksheets/new">
            <Plus />
            Create worksheet
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        {workspace.usage.remaining} of {workspace.usage.limit} AI actions left
        this month, shared with lessons. Editing and downloads are free.
      </p>
      {workspace.worksheets.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {workspace.worksheets.map((item) => (
            <li key={item.id}>
              <Link
                href={`/worksheets/${item.id}`}
                className="surface-card hover:border-primary focus-visible:ring-ring block h-full p-5 transition-colors focus-visible:ring-2"
              >
                <FileText
                  aria-hidden="true"
                  className="text-primary mb-3 size-5"
                />
                <h2 className="font-bold break-words">{item.title}</h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  {item.subject} · {item.gradeLevel}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {item.questionCount}{" "}
                  {item.questionCount === 1 ? "question" : "questions"} ·
                  Version {item.currentVersion}
                  {item.sampleMode ? " · Sample" : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="surface-card space-y-3 p-8 text-center">
          <FileText
            aria-hidden="true"
            className="text-primary mx-auto size-8"
          />
          <h2 className="font-serif text-xl">Make your first worksheet</h2>
          <p className="text-muted-foreground">
            Choose the question types and difficulty. Edit every question and
            answer before using it.
          </p>
          <Button asChild variant="outline">
            <Link href="/worksheets/new">Create worksheet</Link>
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {workspace.nextCursor && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void loadMore()}
        >
          {pending ? "Loading…" : "Load more worksheets"}
        </Button>
      )}
    </div>
  );
}
