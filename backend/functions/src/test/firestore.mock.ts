/**
 * In-memory Firestore double.
 *
 * `firebase-functions-test` cannot be used here: it declares a peer range of
 * firebase-admin ≤13 while this codebase runs firebase-admin 14, and the
 * Firestore emulator JAR cannot be downloaded in every CI environment. This
 * double implements the subset of the Admin SDK surface the services actually
 * use — documents, queries with `where`/`orderBy`/`limit`/`startAfter`,
 * transactions, batches, `FieldValue` sentinels and aggregation counts — so the
 * real service logic runs unmodified against it.
 */

export type DocumentData = Record<string, unknown>;

// ── Field value sentinels ─────────────────────────────────────────────────────

const SERVER_TIMESTAMP = Symbol('serverTimestamp');
const DELETE_FIELD = Symbol('deleteField');

interface IncrementSentinel { __increment: number }
interface ArrayUnionSentinel { __arrayUnion: unknown[] }

export const FieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP,
  delete: () => DELETE_FIELD,
  increment: (amount: number): IncrementSentinel => ({ __increment: amount }),
  arrayUnion: (...values: unknown[]): ArrayUnionSentinel => ({ __arrayUnion: values }),
};

export class Timestamp {
  constructor(readonly seconds: number, readonly nanoseconds: number) {}

  static now(): Timestamp {
    return Timestamp.fromDate(new Date());
  }

  static fromDate(date: Date): Timestamp {
    return new Timestamp(Math.floor(date.getTime() / 1000), 0);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
}

export class FieldPath {
  private constructor(readonly segment: string) {}
  static documentId(): FieldPath {
    return new FieldPath('__name__');
  }
}

function isIncrement(value: unknown): value is IncrementSentinel {
  return typeof value === 'object' && value !== null && '__increment' in value;
}

function isArrayUnion(value: unknown): value is ArrayUnionSentinel {
  return typeof value === 'object' && value !== null && '__arrayUnion' in value;
}

/** Resolves sentinels against the existing document state. */
function resolveWrite(existing: DocumentData | undefined, updates: DocumentData): DocumentData {
  const result: DocumentData = { ...(existing ?? {}) };

  for (const [key, value] of Object.entries(updates)) {
    if (value === SERVER_TIMESTAMP) {
      result[key] = Timestamp.now();
    } else if (value === DELETE_FIELD) {
      delete result[key];
    } else if (isIncrement(value)) {
      result[key] = (Number(result[key]) || 0) + value.__increment;
    } else if (isArrayUnion(value)) {
      const current = Array.isArray(result[key]) ? (result[key] as unknown[]) : [];
      result[key] = [...new Set([...current, ...value.__arrayUnion])];
    } else {
      result[key] = value;
    }
  }

  return result;
}

/** Reads a possibly dotted field path out of a document. */
function readField(data: DocumentData, path: string): unknown {
  if (path === '__name__') return data.__id__;
  return path.split('.').reduce<unknown>(
    (value, segment) => (value && typeof value === 'object'
      ? (value as DocumentData)[segment]
      : undefined),
    data,
  );
}

function comparable(value: unknown): number | string {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value ?? '');
}

function compare(a: unknown, b: unknown): number {
  const left = comparable(a);
  const right = comparable(b);
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

type Operator = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains';

interface Filter {
  field: string;
  operator: Operator;
  value: unknown;
}

function matches(data: DocumentData, filter: Filter): boolean {
  const actual = readField(data, filter.field);

  switch (filter.operator) {
    case '==':
      return actual === filter.value
        || (actual == null && filter.value === null)
        || compareEqual(actual, filter.value);
    case '!=':
      return !matches(data, { ...filter, operator: '==' });
    case '<':
      return compare(actual, filter.value) < 0;
    case '<=':
      return compare(actual, filter.value) <= 0;
    case '>':
      return compare(actual, filter.value) > 0;
    case '>=':
      return compare(actual, filter.value) >= 0;
    case 'in':
      return Array.isArray(filter.value)
        && filter.value.some((candidate) => compareEqual(actual, candidate));
    case 'not-in':
      return Array.isArray(filter.value)
        && !filter.value.some((candidate) => compareEqual(actual, candidate));
    case 'array-contains':
      return Array.isArray(actual) && actual.some((item) => compareEqual(item, filter.value));
    default:
      return false;
  }
}

function compareEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Timestamp && b instanceof Timestamp) return a.toMillis() === b.toMillis();
  if (a instanceof Timestamp && b instanceof Date) return a.toMillis() === b.getTime();
  return a === b;
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export class DocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly raw: DocumentData | undefined,
    readonly ref: DocumentReference,
  ) {}

  get exists(): boolean {
    return this.raw !== undefined;
  }

  data(): DocumentData | undefined {
    if (!this.raw) return undefined;
    const { __id__: _ignored, ...rest } = this.raw;
    return rest;
  }

  get(field: string): unknown {
    return this.raw ? readField(this.raw, field) : undefined;
  }
}

export class QuerySnapshot {
  constructor(readonly docs: DocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (doc: DocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

// ── References ────────────────────────────────────────────────────────────────

export class DocumentReference {
  constructor(
    readonly store: FirestoreMock,
    readonly collectionPath: string,
    readonly id: string,
  ) {}

  get path(): string {
    return `${this.collectionPath}/${this.id}`;
  }

  async get(): Promise<DocumentSnapshot> {
    this.store.readCount += 1;
    return new DocumentSnapshot(this.id, this.store.raw(this.collectionPath, this.id), this);
  }

  async set(data: DocumentData, options?: { merge?: boolean }): Promise<void> {
    this.store.writeCount += 1;
    const existing = options?.merge ? this.store.raw(this.collectionPath, this.id) : undefined;
    this.store.put(this.collectionPath, this.id, resolveWrite(existing, data));
  }

  async update(data: DocumentData): Promise<void> {
    const existing = this.store.raw(this.collectionPath, this.id);
    if (!existing) {
      throw new Error(`NOT_FOUND: no document to update at ${this.path}`);
    }
    this.store.writeCount += 1;
    this.store.put(this.collectionPath, this.id, resolveWrite(existing, data));
  }

  async delete(): Promise<void> {
    this.store.writeCount += 1;
    this.store.remove(this.collectionPath, this.id);
  }
}

export class Query {
  constructor(
    protected readonly store: FirestoreMock,
    protected readonly collectionPath: string,
    protected readonly filters: Filter[] = [],
    protected readonly orders: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
    protected readonly limitValue?: number,
    protected readonly startAfterId?: string,
    protected readonly selectFields?: string[],
  ) {}

  private clone(overrides: Partial<{
    filters: Filter[];
    orders: Array<{ field: string; direction: 'asc' | 'desc' }>;
    limitValue: number;
    startAfterId: string;
    selectFields: string[];
  }>): Query {
    return new Query(
      this.store,
      this.collectionPath,
      overrides.filters ?? this.filters,
      overrides.orders ?? this.orders,
      overrides.limitValue ?? this.limitValue,
      overrides.startAfterId ?? this.startAfterId,
      overrides.selectFields ?? this.selectFields,
    );
  }

  where(field: string | FieldPath, operator: Operator, value: unknown): Query {
    const name = field instanceof FieldPath ? field.segment : field;
    return this.clone({ filters: [...this.filters, { field: name, operator, value }] });
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query {
    return this.clone({ orders: [...this.orders, { field, direction }] });
  }

  limit(count: number): Query {
    return this.clone({ limitValue: count });
  }

  startAfter(snapshot: DocumentSnapshot | string): Query {
    const id = typeof snapshot === 'string' ? snapshot : snapshot.id;
    return this.clone({ startAfterId: id });
  }

  select(...fields: string[]): Query {
    return this.clone({ selectFields: fields });
  }

  async get(): Promise<QuerySnapshot> {
    const entries = [...this.store.collection_(this.collectionPath).entries()]
      .filter(([, data]) => this.filters.every((filter) => matches(data, filter)));

    for (const order of [...this.orders].reverse()) {
      entries.sort(([, a], [, b]) => {
        const result = compare(readField(a, order.field), readField(b, order.field));
        return order.direction === 'desc' ? -result : result;
      });
    }

    let sliced = entries;
    if (this.startAfterId) {
      const index = sliced.findIndex(([id]) => id === this.startAfterId);
      if (index >= 0) sliced = sliced.slice(index + 1);
    }
    if (this.limitValue !== undefined) sliced = sliced.slice(0, this.limitValue);

    this.store.readCount += sliced.length;

    return new QuerySnapshot(sliced.map(([id, data]) => new DocumentSnapshot(
      id,
      data,
      new DocumentReference(this.store, this.collectionPath, id),
    )));
  }

  /** Aggregation query — mirrors `query.count().get()`. */
  count(): { get: () => Promise<{ data: () => { count: number } }> } {
    return {
      get: async () => {
        const snapshot = await this.get();
        return { data: () => ({ count: snapshot.size }) };
      },
    };
  }
}

export class CollectionReference extends Query {
  doc(id?: string): DocumentReference {
    return new DocumentReference(
      this.store,
      this.collectionPath,
      id ?? this.store.nextId(),
    );
  }

  async add(data: DocumentData): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

// ── Batch & transaction ───────────────────────────────────────────────────────

type Operation = () => Promise<void>;

export class WriteBatch {
  private readonly operations: Operation[] = [];

  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): this {
    this.operations.push(() => ref.set(data, options));
    return this;
  }

  update(ref: DocumentReference, data: DocumentData): this {
    this.operations.push(() => ref.update(data));
    return this;
  }

  delete(ref: DocumentReference): this {
    this.operations.push(() => ref.delete());
    return this;
  }

  async commit(): Promise<void> {
    // Applied sequentially; the double is single-threaded so this is atomic
    // enough to exercise the service logic.
    for (const operation of this.operations) await operation();
  }
}

export class Transaction {
  private readonly operations: Operation[] = [];

  async get(target: DocumentReference | Query): Promise<DocumentSnapshot | QuerySnapshot> {
    return target.get() as Promise<DocumentSnapshot | QuerySnapshot>;
  }

  set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): this {
    this.operations.push(() => ref.set(data, options));
    return this;
  }

  update(ref: DocumentReference, data: DocumentData): this {
    this.operations.push(() => ref.update(data));
    return this;
  }

  delete(ref: DocumentReference): this {
    this.operations.push(() => ref.delete());
    return this;
  }

  async flush(): Promise<void> {
    for (const operation of this.operations) await operation();
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class FirestoreMock {
  private readonly data = new Map<string, Map<string, DocumentData>>();
  private idCounter = 0;

  readCount = 0;
  writeCount = 0;

  settings(): void {
    // No-op: matches the Admin SDK surface used in config/firebase.ts.
  }

  collection(path: string): CollectionReference {
    return new CollectionReference(this, path);
  }

  batch(): WriteBatch {
    return new WriteBatch();
  }

  async runTransaction<T>(updateFunction: (tx: Transaction) => Promise<T>): Promise<T> {
    const transaction = new Transaction();
    const result = await updateFunction(transaction);
    // Only commit when the callback resolved: a throw must leave no writes,
    // which is what the real transactional guarantees give the services.
    await transaction.flush();
    return result;
  }

  // ── Test helpers ───────────────────────────────────────────────────────────

  collection_(path: string): Map<string, DocumentData> {
    if (!this.data.has(path)) this.data.set(path, new Map());
    return this.data.get(path)!;
  }

  raw(path: string, id: string): DocumentData | undefined {
    return this.collection_(path).get(id);
  }

  put(path: string, id: string, data: DocumentData): void {
    this.collection_(path).set(id, { ...data, __id__: id });
  }

  remove(path: string, id: string): void {
    this.collection_(path).delete(id);
  }

  nextId(): string {
    this.idCounter += 1;
    return `generated-${String(this.idCounter).padStart(4, '0')}`;
  }

  /** Seeds a document directly, bypassing sentinel resolution. */
  seed(path: string, id: string, data: DocumentData): void {
    this.put(path, id, data);
  }

  /** All documents in a collection, as plain objects keyed by ID. */
  dump(path: string): Record<string, DocumentData> {
    const result: Record<string, DocumentData> = {};
    this.collection_(path).forEach((value, key) => {
      const { __id__: _ignored, ...rest } = value;
      result[key] = rest;
    });
    return result;
  }

  reset(): void {
    this.data.clear();
    this.idCounter = 0;
    this.readCount = 0;
    this.writeCount = 0;
  }
}
