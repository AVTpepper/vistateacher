"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { DraftStatus } from "@/components/ui/draft-status";
import { useRecoveredDraft } from "@/lib/creation-drafts/use-recovered-draft";
import { validateWorksheetContent } from "@/lib/worksheets/validation";
import {
  WORKSHEET_QUESTION_LABELS,
  type WorksheetContent,
  type WorksheetQuestion,
  type WorksheetAnswer,
} from "@/schemas/worksheet";

function TextField({
  label,
  value,
  onChange,
  maxLength = 2000,
  multiline = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  multiline?: boolean;
}) {
  const id = useId();
  return (
    <FormField id={id} label={label}>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          rows={3}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
        />
      )}
    </FormField>
  );
}
const lines = (value: string) => value.split("\n");
function answerContext(question: WorksheetQuestion) {
  return JSON.stringify({
    prompt: question.prompt,
    options: question.type === "multipleChoice" ? question.options : null,
    left: question.type === "matching" ? question.left : null,
    right: question.type === "matching" ? question.right : null,
    trueLabel: question.type === "trueFalse" ? question.trueLabel : null,
    falseLabel: question.type === "trueFalse" ? question.falseLabel : null,
  });
}

function QuestionFields({
  question,
  answer,
  onQuestion,
  onAnswer,
}: {
  question: WorksheetQuestion;
  answer: WorksheetAnswer;
  onQuestion: (question: WorksheetQuestion) => void;
  onAnswer: (answer: WorksheetAnswer) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-4">
      <TextField
        label="Question"
        value={question.prompt}
        onChange={(prompt) => onQuestion({ ...question, prompt })}
      />
      <FormField id={`${id}-difficulty`} label="Question difficulty">
        <Select
          id={`${id}-difficulty`}
          value={question.difficulty}
          onChange={(event) =>
            onQuestion({
              ...question,
              difficulty: event.target.value as WorksheetQuestion["difficulty"],
            })
          }
        >
          <option value="foundation">Foundation</option>
          <option value="core">Core</option>
          <option value="challenge">Challenge</option>
        </Select>
      </FormField>
      {question.type === "multipleChoice" &&
        answer.type === "multipleChoice" && (
          <>
            {question.options.map((option, position) => (
              <TextField
                key={option.id}
                label={`Option ${String.fromCharCode(65 + position)}`}
                multiline={false}
                maxLength={500}
                value={option.text}
                onChange={(text) =>
                  onQuestion({
                    ...question,
                    options: question.options.map((item) =>
                      item.id === option.id ? { ...item, text } : item,
                    ),
                  })
                }
              />
            ))}
            <FormField id={`${id}-correct`} label="Correct option">
              <Select
                id={`${id}-correct`}
                value={answer.correctOptionId}
                onChange={(event) =>
                  onAnswer({ ...answer, correctOptionId: event.target.value })
                }
              >
                {question.options.map((option, position) => (
                  <option key={option.id} value={option.id}>
                    {String.fromCharCode(65 + position)}. {option.text}
                  </option>
                ))}
              </Select>
            </FormField>
            <TextField
              label="Answer explanation"
              value={answer.explanation}
              onChange={(explanation) => onAnswer({ ...answer, explanation })}
            />
          </>
        )}
      {(question.type === "shortAnswer" ||
        question.type === "extendedResponse") && (
        <FormField
          id={`${id}-responseLines`}
          label="Answer lines on the student worksheet"
        >
          <Input
            id={`${id}-responseLines`}
            type="number"
            min={question.type === "shortAnswer" ? 1 : 3}
            max={question.type === "shortAnswer" ? 10 : 30}
            value={question.responseLines}
            onChange={(event) =>
              onQuestion({
                ...question,
                responseLines: Number(event.target.value),
              })
            }
          />
        </FormField>
      )}
      {answer.type === "shortAnswer" && (
        <>
          <TextField
            label="Model answer"
            value={answer.modelAnswer}
            maxLength={3000}
            onChange={(modelAnswer) => onAnswer({ ...answer, modelAnswer })}
          />
          <TextField
            label="Accepted alternatives (one per line, optional)"
            value={answer.acceptedAlternatives.join("\n")}
            maxLength={5000}
            onChange={(value) =>
              onAnswer({
                ...answer,
                acceptedAlternatives: value === "" ? [] : lines(value),
              })
            }
          />
        </>
      )}
      {answer.type === "extendedResponse" && (
        <>
          <TextField
            label="Example response"
            value={answer.exampleResponse}
            maxLength={4000}
            onChange={(exampleResponse) =>
              onAnswer({ ...answer, exampleResponse })
            }
          />
          <TextField
            label="Assessment criteria (one per line)"
            value={answer.assessmentCriteria.join("\n")}
            maxLength={5000}
            onChange={(value) =>
              onAnswer({ ...answer, assessmentCriteria: lines(value) })
            }
          />
        </>
      )}
      {question.type === "matching" && answer.type === "matching" && (
        <>
          <p className="text-muted-foreground text-sm">
            The right column stays in this order when printed. Set one distinct
            partner for every left item.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["left", "right"] as const).map((column) => (
              <fieldset key={column} className="space-y-3">
                <legend className="mb-2 font-bold">
                  {column === "left" ? "Left column" : "Right column"}
                </legend>
                {question[column].map((item, position) => (
                  <TextField
                    key={item.id}
                    label={
                      column === "left"
                        ? `Item ${position + 1}`
                        : `Item ${String.fromCharCode(65 + position)}`
                    }
                    value={item.text}
                    maxLength={500}
                    multiline={false}
                    onChange={(text) =>
                      onQuestion({
                        ...question,
                        [column]: question[column].map((entry) =>
                          entry.id === item.id ? { ...entry, text } : entry,
                        ),
                      })
                    }
                  />
                ))}
              </fieldset>
            ))}
          </div>
          {question.left.map((item, position) => (
            <FormField
              key={item.id}
              id={`${id}-pair-${item.id}`}
              label={`Partner for ${position + 1}. ${item.text}`}
            >
              <Select
                id={`${id}-pair-${item.id}`}
                value={
                  answer.pairs.find((pair) => pair.leftId === item.id)
                    ?.rightId ?? ""
                }
                onChange={(event) =>
                  onAnswer({
                    ...answer,
                    pairs: answer.pairs.map((pair) =>
                      pair.leftId === item.id
                        ? { ...pair, rightId: event.target.value }
                        : pair,
                    ),
                  })
                }
              >
                {question.right.map((right, index) => (
                  <option key={right.id} value={right.id}>
                    {String.fromCharCode(65 + index)}. {right.text}
                  </option>
                ))}
              </Select>
            </FormField>
          ))}
        </>
      )}
      {answer.type === "fillInBlank" && (
        <>
          <p className="text-muted-foreground text-sm">
            Use exactly ___ in the question for each blank. Put each blank’s
            answer on a separate line; separate accepted alternatives with |.
          </p>
          <TextField
            label="Answers in blank order"
            value={answer.acceptedAnswers
              .map((values) => values.alternatives.join(" | "))
              .join("\n")}
            maxLength={15000}
            onChange={(value) =>
              onAnswer({
                ...answer,
                acceptedAnswers: lines(value).map((row) => ({
                  alternatives: row.split("|").map((entry) => entry.trim()),
                })),
              })
            }
          />
        </>
      )}
      {question.type === "trueFalse" && answer.type === "trueFalse" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="True label (content language)"
              value={question.trueLabel}
              maxLength={40}
              multiline={false}
              onChange={(trueLabel) => onQuestion({ ...question, trueLabel })}
            />
            <TextField
              label="False label (content language)"
              value={question.falseLabel}
              maxLength={40}
              multiline={false}
              onChange={(falseLabel) => onQuestion({ ...question, falseLabel })}
            />
          </div>
          <FormField id={`${id}-truth`} label="Correct answer">
            <Select
              id={`${id}-truth`}
              value={String(answer.answer)}
              onChange={(event) =>
                onAnswer({ ...answer, answer: event.target.value === "true" })
              }
            >
              <option value="true">{question.trueLabel}</option>
              <option value="false">{question.falseLabel}</option>
            </Select>
          </FormField>
          <TextField
            label="Answer explanation"
            value={answer.explanation}
            onChange={(explanation) => onAnswer({ ...answer, explanation })}
          />
        </>
      )}
    </div>
  );
}

export function WorksheetEditor({
  uid,
  worksheetId,
  content,
  version,
  pending,
  onSave,
  onCancel,
}: {
  uid: string;
  worksheetId: string;
  content: WorksheetContent;
  version: number;
  pending: boolean;
  onSave: (
    value: WorksheetContent,
    expectedVersion: number,
  ) => Promise<boolean>;
  onCancel: () => void;
}) {
  const recovery = useRecoveredDraft(`worksheet-edit:${uid}:${worksheetId}`, {
    content,
    baseVersion: version,
    reviewQuestionIds: [] as string[],
  });
  const draft = recovery.value.content;
  const [error, setError] = useState("");
  const changed = JSON.stringify(draft) !== JSON.stringify(content);
  useEffect(() => {
    if (!changed) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const link = event.target.closest("a[href]");
      if (
        !link ||
        link.getAttribute("target") === "_blank" ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      if (
        !window.confirm(
          "You have unsaved worksheet edits. Leave this page? Your draft is kept on this device when storage is available.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", navigate, true);
    };
  }, [changed]);
  const setDraft = (value: WorksheetContent) =>
    recovery.setValue((current) => ({
      ...current,
      content: value,
      reviewQuestionIds: current.reviewQuestionIds.filter((id) =>
        value.questions.some((question) => question.id === id),
      ),
    }));
  function move(index: number, offset: number) {
    const questions = [...draft.questions];
    [questions[index], questions[index + offset]] = [
      questions[index + offset],
      questions[index],
    ];
    setDraft({ ...draft, questions });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (recovery.value.reviewQuestionIds.length) {
      setError("Review the answers for your changed questions before saving.");
      return;
    }
    let value;
    try {
      value = validateWorksheetContent(draft);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Review the worksheet.",
      );
      return;
    }
    if (await onSave(value, recovery.value.baseVersion)) recovery.clear();
  }
  return (
    <form
      onSubmit={(event) => void save(event)}
      className="space-y-5"
      aria-busy={pending}
    >
      <div className="surface-card space-y-4 p-4 sm:p-6">
        <h2 className="font-serif text-2xl">Edit worksheet</h2>
        <p className="text-muted-foreground text-sm">
          Questions and answers save together as a new version. Check the answer
          key whenever you change a question or option.
        </p>
        <DraftStatus status={recovery.status} restored={recovery.restored} />
        {recovery.value.baseVersion !== version && (
          <p role="alert" className="text-destructive text-sm">
            This draft was based on version {recovery.value.baseVersion}. The
            saved worksheet is version {version}. Copy any changes you want to
            keep, then discard this draft and edit the latest version.
          </p>
        )}
        <fieldset disabled={pending} className="space-y-4">
          <legend className="sr-only">Worksheet headings</legend>
          <TextField
            label="Worksheet title"
            value={draft.title}
            multiline={false}
            maxLength={160}
            onChange={(title) => setDraft({ ...draft, title })}
          />
          <TextField
            label="Student instructions"
            value={draft.instructions}
            onChange={(instructions) => setDraft({ ...draft, instructions })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {(["name", "date", "answerKey"] as const).map((key) => (
              <TextField
                key={key}
                label={`${key === "answerKey" ? "Answer key" : key === "name" ? "Name" : "Date"} label`}
                value={draft.labels[key]}
                maxLength={key === "answerKey" ? 120 : 80}
                multiline={false}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    labels: { ...draft.labels, [key]: value },
                  })
                }
              />
            ))}
          </div>
        </fieldset>
      </div>
      {draft.questions.map((question, index) => (
        <fieldset
          key={question.id}
          disabled={pending}
          className="surface-card space-y-4 p-4 sm:p-6"
        >
          <legend className="sr-only">Question {index + 1}</legend>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold">
              {index + 1}. {WORKSHEET_QUESTION_LABELS[question.type]}
            </h3>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move question ${index + 1} up`}
                disabled={index === 0 || pending}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move question ${index + 1} down`}
                disabled={index === draft.questions.length - 1 || pending}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove question ${index + 1}`}
                disabled={draft.questions.length <= 1 || pending}
                onClick={() =>
                  setDraft({
                    ...draft,
                    questions: draft.questions.filter(
                      (item) => item.id !== question.id,
                    ),
                    answerKey: draft.answerKey.filter(
                      (item) => item.questionId !== question.id,
                    ),
                  })
                }
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <QuestionFields
            question={question}
            answer={draft.answerKey.find(
              (answer) => answer.questionId === question.id,
            )!}
            onQuestion={(value) =>
              recovery.setValue((current) => ({
                ...current,
                content: {
                  ...current.content,
                  questions: current.content.questions.map((item) =>
                    item.id === value.id ? value : item,
                  ),
                },
                reviewQuestionIds:
                  answerContext(value) !== answerContext(question)
                    ? Array.from(
                        new Set([...current.reviewQuestionIds, question.id]),
                      )
                    : current.reviewQuestionIds,
              }))
            }
            onAnswer={(value) =>
              setDraft({
                ...draft,
                answerKey: draft.answerKey.map((item) =>
                  item.questionId === value.questionId ? value : item,
                ),
              })
            }
          />
          {recovery.value.reviewQuestionIds.includes(question.id) && (
            <label className="bg-secondary flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-5 shrink-0"
                checked={false}
                onChange={() =>
                  recovery.setValue((current) => ({
                    ...current,
                    reviewQuestionIds: current.reviewQuestionIds.filter(
                      (id) => id !== question.id,
                    ),
                  }))
                }
              />
              I reviewed the answer for question {index + 1}
            </label>
          )}
        </fieldset>
      ))}
      {error && (
        <p
          role="alert"
          className="text-destructive text-sm whitespace-pre-wrap"
        >
          {error}
        </p>
      )}
      <div className="surface-card flex flex-wrap gap-3 p-4">
        <Button
          type="submit"
          disabled={
            pending ||
            !changed ||
            recovery.value.baseVersion !== version ||
            recovery.value.reviewQuestionIds.length > 0
          }
        >
          <Save />
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!changed || window.confirm("Discard these worksheet edits?")) {
              recovery.clear();
              onCancel();
            }
          }}
        >
          Discard edits
        </Button>
      </div>
    </form>
  );
}
