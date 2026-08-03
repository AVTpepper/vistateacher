import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
} from "firebase/firestore";
import type { ZodType } from "zod";

export function createConverter<T extends DocumentData>(
  schema: ZodType<T>,
): FirestoreDataConverter<T> {
  return {
    toFirestore(value: WithFieldValue<T>): DocumentData {
      return value;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options: SnapshotOptions,
    ): T {
      return schema.parse(snapshot.data(options));
    },
  };
}
