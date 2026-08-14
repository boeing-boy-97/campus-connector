/**
 * Jest setup: replaces `config/firebase` with in-memory doubles so the real
 * service and handler logic can be exercised without network access, a service
 * account, or the emulator JARs (which cannot be downloaded in every CI
 * environment).
 *
 * Everything under test is the production code path — only the Firebase
 * boundary is substituted.
 */

import { FieldValue, FirestoreMock, Timestamp } from './firestore.mock';

export const firestoreMock = new FirestoreMock();

// ── Auth double ───────────────────────────────────────────────────────────────

export interface FakeUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown>;
}

export class AuthMock {
  users = new Map<string, FakeUser>();
  revokedTokens: string[] = [];
  createdTokens: string[] = [];
  private counter = 0;

  async getUserByEmail(email: string): Promise<FakeUser> {
    const found = [...this.users.values()].find((user) => user.email === email);
    if (!found) {
      const error = new Error('There is no user record corresponding to this identifier.');
      (error as Error & { code: string }).code = 'auth/user-not-found';
      throw error;
    }
    return found;
  }

  async getUser(uid: string): Promise<FakeUser> {
    const found = this.users.get(uid);
    if (!found) {
      const error = new Error('No user record found.');
      (error as Error & { code: string }).code = 'auth/user-not-found';
      throw error;
    }
    return found;
  }

  async createUser(properties: Omit<FakeUser, 'uid'> & { uid?: string }): Promise<FakeUser> {
    this.counter += 1;
    const uid = properties.uid ?? `uid-${this.counter}`;
    const user: FakeUser = { ...properties, uid };
    this.users.set(uid, user);
    return user;
  }

  async updateUser(uid: string, properties: Partial<FakeUser>): Promise<FakeUser> {
    const user = await this.getUser(uid);
    const updated = { ...user, ...properties };
    this.users.set(uid, updated);
    return updated;
  }

  async setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
    const user = await this.getUser(uid);
    this.users.set(uid, { ...user, customClaims: claims });
  }

  async revokeRefreshTokens(uid: string): Promise<void> {
    this.revokedTokens.push(uid);
  }

  async createCustomToken(uid: string): Promise<string> {
    const token = `custom-token-for-${uid}`;
    this.createdTokens.push(token);
    return token;
  }

  reset(): void {
    this.users.clear();
    this.revokedTokens = [];
    this.createdTokens = [];
    this.counter = 0;
  }
}

export const authMock = new AuthMock();

// ── Storage double ────────────────────────────────────────────────────────────

export interface FakeFile {
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
}

export class StorageMock {
  files = new Map<string, FakeFile>();
  deleted: string[] = [];
  signedUrlsIssued: string[] = [];

  bucket() {
    return {
      file: (path: string) => {
        return {
          exists: async (): Promise<[boolean]> => [this.files.has(path)],
          getMetadata: async (): Promise<[FakeFile]> => {
            const file = this.files.get(path);
            if (!file) throw new Error(`No such object: ${path}`);
            return [file];
          },
          delete: async (): Promise<void> => {
            this.files.delete(path);
            this.deleted.push(path);
          },
          getSignedUrl: async (): Promise<[string]> => {
            this.signedUrlsIssued.push(path);
            return [`https://signed.example/${encodeURIComponent(path)}`];
          },
        };
      },
    };
  }

  put(path: string, file: FakeFile): void {
    this.files.set(path, {
      contentType: 'image/jpeg',
      size: 1024,
      metadata: {},
      ...file,
    });
  }

  reset(): void {
    this.files.clear();
    this.deleted = [];
    this.signedUrlsIssued = [];
  }
}

export const storageMock = new StorageMock();

// ── Messaging double ──────────────────────────────────────────────────────────

export class MessagingMock {
  sent: Array<{ token: string; title?: string; body?: string }> = [];
  failWith: string | null = null;

  async send(message: {
    token: string;
    notification?: { title?: string; body?: string };
  }): Promise<string> {
    if (this.failWith) {
      const error = new Error('Push failed') as Error & { errorInfo: { code: string } };
      error.errorInfo = { code: this.failWith };
      throw error;
    }
    this.sent.push({
      token: message.token,
      title: message.notification?.title,
      body: message.notification?.body,
    });
    return 'message-id';
  }

  reset(): void {
    this.sent = [];
    this.failWith = null;
  }
}

export const messagingMock = new MessagingMock();

// ── Module substitution ───────────────────────────────────────────────────────

jest.mock('../config/firebase', () => ({
  db: firestoreMock,
  auth: authMock,
  storage: storageMock,
  messaging: messagingMock,
  FieldValue,
  Timestamp,
  default: {},
}));

// `firebase-admin/firestore` is imported directly for FieldPath/FieldValue in a
// couple of handlers.
jest.mock('firebase-admin/firestore', () => {
  const actual = jest.requireActual('./firestore.mock');
  return {
    FieldValue: actual.FieldValue,
    Timestamp: actual.Timestamp,
    FieldPath: actual.FieldPath,
  };
});

// Silence structured logging during tests while keeping the API surface.
jest.mock('../utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createLogger: () => ({
    debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

/** Clears every double. Call in `beforeEach`. */
export function resetAllMocks(): void {
  firestoreMock.reset();
  authMock.reset();
  storageMock.reset();
  messagingMock.reset();
}
