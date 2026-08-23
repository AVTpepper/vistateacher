import type {
  CreationDraftMap,
  CreationDraftType,
} from "@/schemas/creation-draft";

export async function saveCreationDraft<T extends CreationDraftType>(
  type: T,
  data: CreationDraftMap[T],
): Promise<void> {
  const response = await fetch(`/api/creation-drafts/${type}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Draft could not be saved.");
}

export async function deleteCreationDraft(
  type: CreationDraftType,
): Promise<void> {
  const response = await fetch(`/api/creation-drafts/${type}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Draft could not be cleared.");
}
