import { lessonDocument } from "@/lib/lessons/document";
import type { LessonPlanInput } from "@/schemas/lesson";

export function LessonContentPreview({
  content,
}: {
  content: LessonPlanInput;
}) {
  const document = lessonDocument(content);
  return (
    <article className="space-y-4 break-words">
      <div>
        <h3 className="font-serif text-xl">{document.title}</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          {document.subtitle}
        </p>
      </div>
      {document.sections.map(([heading, items]) => (
        <section key={heading}>
          <h4 className="font-semibold">{heading}</h4>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
            {items.map((item, index) => (
              <li key={index} className="whitespace-pre-wrap">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
