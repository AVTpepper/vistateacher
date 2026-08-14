import { BookOpen, Clock, Pencil, Users } from "lucide-react";
import Link from "next/link";

import { ProfileIdentityLink } from "@/components/ui/profile-identity-link";
import type { SharedLesson } from "@/lib/lessons/server";

export function SharedLessonView({ lesson }: { lesson: SharedLesson }) {
  const { content } = lesson;
  return (
    <article className="surface-card mx-auto max-w-4xl overflow-hidden">
      <header className="bg-primary p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="bg-accent text-accent-foreground inline-flex rounded-full px-2.5 py-1 text-xs font-bold">
              Lesson plan
            </span>
            <h1 className="mt-3 font-serif text-3xl">{content.title}</h1>
          </div>
          {lesson.ownedByViewer && (
            <Link
              href={`/ai-lessons?lesson=${encodeURIComponent(lesson.id)}`}
              className="flex h-10 items-center gap-2 rounded-lg border border-white/30 px-3 text-xs font-bold"
            >
              <Pencil className="size-3.5" /> Continue refining
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-white/80">
          <span className="flex items-center gap-1.5">
            <BookOpen className="size-3.5" />
            {content.subject}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-3.5" />
            {content.gradeLevel}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {content.durationMinutes} minutes
          </span>
        </div>
      </header>
      <div className="space-y-6 p-5 sm:p-7">
        <ProfileIdentityLink
          uid={lesson.author.uid}
          displayName={lesson.author.displayName}
          photoURL={lesson.author.photoURL}
          avatarClassName="size-9 rounded-full text-xs"
        />
        <LessonSection title="Learning objectives" items={content.objectives} />
        <LessonSection title="Materials" items={content.materials} />
        <TextSection title="Warm-up" text={content.warmUp.activity} />
        <section>
          <h2 className="font-serif text-xl">Main activity</h2>
          <p className="mt-2 text-sm leading-7">
            {content.mainActivity.description}
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">
            {content.mainActivity.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
        <TextSection
          title="Closing activity"
          text={content.closingActivity.activity}
        />
        <TextSection title="Assessment" text={content.assessment} />
        <div className="grid gap-5 sm:grid-cols-2">
          <LessonSection
            title="Supports"
            items={content.differentiation.supports}
          />
          <LessonSection
            title="Extensions"
            items={content.differentiation.extensions}
          />
        </div>
        <LessonSection title="Standards" items={content.standards} />
      </div>
    </article>
  );
}

function LessonSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h2 className="font-serif text-xl">{title}</h2>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-2 text-sm">None specified.</p>
      )}
    </section>
  );
}

function TextSection({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h2 className="font-serif text-xl">{title}</h2>
      <p className="mt-2 text-sm leading-7 whitespace-pre-wrap">{text}</p>
    </section>
  );
}
