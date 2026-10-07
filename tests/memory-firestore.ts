type Data = Record<string, unknown>;

/** Transactional test double for server workflows; reads and writes are serialized. */
export function createMemoryFirestore() {
  const documents = new Map<string, Data>();
  let queue = Promise.resolve();
  class Reference {
    constructor(readonly path: string) {}
    get id() {
      return this.path.split("/").at(-1)!;
    }
    get parent(): { parent: Reference | null } {
      return {
        parent:
          this.path.split("/").length > 2
            ? new Reference(this.path.split("/").slice(0, -2).join("/"))
            : null,
      };
    }
    async get() {
      return snapshot(this);
    }
    async update(data: Data) {
      documents.set(this.path, { ...documents.get(this.path), ...data });
    }
    async set(data: Data, options?: { merge?: boolean }) {
      documents.set(
        this.path,
        options?.merge ? { ...documents.get(this.path), ...data } : data,
      );
    }
    async delete() {
      documents.delete(this.path);
    }
  }
  function snapshot(ref: Reference) {
    return {
      ref,
      id: ref.id,
      exists: documents.has(ref.path),
      data: () => documents.get(ref.path),
    };
  }
  class Query {
    filters: ((path: string, data: Data) => boolean)[] = [];
    maximum = Infinity;
    constructor(
      readonly collection: string,
      readonly group = false,
    ) {}
    where(field: string, operator: string, value: unknown) {
      this.filters.push((_path, data) =>
        operator === "array-contains"
          ? Array.isArray(data[field]) &&
            (data[field] as unknown[]).includes(value)
          : data[field] === value,
      );
      return this;
    }
    limit(value: number) {
      this.maximum = value;
      return this;
    }
    orderBy() {
      return this;
    }
    startAt(value: string) {
      this.filters.push((path) => path.split("/").at(-1)! >= value);
      return this;
    }
    endAt(value: string) {
      this.filters.push((path) => path.split("/").at(-1)! <= value);
      return this;
    }
    async get() {
      const docs = [...documents]
        .filter(([path, data]) => {
          const segments = path.split("/");
          return (
            (this.group
              ? segments.at(-2) === this.collection
              : segments.slice(0, -1).join("/") === this.collection) &&
            this.filters.every((filter) => filter(path, data))
          );
        })
        .slice(0, this.maximum)
        .map(([path]) => snapshot(new Reference(path)));
      return { docs, empty: docs.length === 0 };
    }
  }
  function read(ref: Reference): Promise<ReturnType<typeof snapshot>>;
  function read(ref: Query): ReturnType<Query["get"]>;
  async function read(ref: Reference | Query) {
    return ref instanceof Query ? ref.get() : snapshot(ref);
  }
  const db = {
    documents,
    doc: (path: string) => new Reference(path),
    collection: (path: string) => new Query(path),
    collectionGroup: (name: string) => new Query(name, true),
    getAll: async (...refs: Reference[]) => refs.map(snapshot),
    recursiveDelete: async (ref: Reference) => {
      for (const path of documents.keys())
        if (path === ref.path || path.startsWith(`${ref.path}/`))
          documents.delete(path);
    },
    async runTransaction<T>(
      callback: (transaction: {
        get: typeof read;
        getAll: (
          ...refs: Reference[]
        ) => Promise<ReturnType<typeof snapshot>[]>;
        set: (
          ref: Reference,
          data: Data,
          options?: { merge?: boolean },
        ) => void;
        update: (ref: Reference, data: Data) => void;
        delete: (ref: Reference) => void;
      }) => Promise<T>,
    ) {
      const previous = queue;
      let release!: () => void;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      const writes: (() => void)[] = [];
      try {
        const result = await callback({
          get: read,
          getAll: async (...refs) => refs.map(snapshot),
          set: (ref, data, options) => {
            writes.push(() => {
              documents.set(
                ref.path,
                options?.merge ? { ...documents.get(ref.path), ...data } : data,
              );
            });
          },
          update: (ref, data) => {
            writes.push(() => {
              documents.set(ref.path, { ...documents.get(ref.path), ...data });
            });
          },
          delete: (ref) => {
            writes.push(() => {
              documents.delete(ref.path);
            });
          },
        });
        writes.forEach((write) => write());
        return result;
      } finally {
        release();
      }
    },
  };
  return db;
}
