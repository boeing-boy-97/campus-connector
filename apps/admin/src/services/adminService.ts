import { FirebaseError } from 'firebase/app';
import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  approveCollegeFn,
  createCollegeFn,
  db,
  getPlatformAnalyticsFn,
  getVerificationQueueFn,
  reinstateUserFn,
  reviewReportFn,
  reviewVerificationFn,
  sendEmailFn,
  sendPushNotificationFn,
  suspendUserFn,
} from './firebase';

/** Envelope returned by every callable. */
interface Envelope<T> {
  success: boolean;
  data: T;
}

/** Turns any thrown value into a message safe to show an administrator. */
export function describeError(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied' || error.code === 'functions/permission-denied') {
      return 'You do not have permission to do that.';
    }
    if (error.code === 'unavailable' || error.code === 'functions/unavailable') {
      return 'The server is unreachable. Check your connection and try again.';
    }
    if (error.code === 'failed-precondition') {
      return 'This query needs a Firestore index that has not finished building yet.';
    }
    return error.message.replace(/^Firebase:\s*/i, '').replace(/\s*\([^)]*\)\.?$/, '') || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

function unwrap<T>(result: { data: unknown }): T {
  const envelope = result.data as Envelope<T> | undefined;
  if (!envelope?.success) throw new Error('The server returned an unexpected response.');
  return envelope.data;
}

/** Timestamp → localised date string, tolerating missing/odd values. */
function toDateString(value: unknown, options?: Intl.DateTimeFormatOptions): string | null {
  let date: Date | null = null;

  if (value instanceof Timestamp) date = value.toDate();
  else if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  } else if (value && typeof value === 'object' && 'toDate' in value) {
    const parsed = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }

  return date
    ? date.toLocaleDateString(undefined, options ?? { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  total_students: number;
  pending_verification: number;
  verified_students: number;
  suspended_students: number;
  active_matches: number;
  total_colleges: number;
  pending_colleges: number;
  open_reports: number;
  new_students_7d: number;
  new_students_prev_7d: number;
  new_matches_today: number;
  recent_verifications: Array<{
    id: string;
    student_name: string;
    college_name: string;
    submitted_at: string | null;
  }>;
}

/** Midnight local time, `daysAgo` days back. */
function daysAgoDate(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function countOf(target: Query): Promise<number> {
  const snapshot = await getCountFromServer(target);
  return snapshot.data().count;
}

/**
 * Real dashboard aggregates.
 *
 * The trend figures shown on the dashboard were previously hardcoded strings
 * ("+12% this week"). They are now computed by comparing the last seven days
 * against the seven before that.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const students = collection(db, 'students');
  const matches = collection(db, 'matches');
  const colleges = collection(db, 'colleges');
  const reports = collection(db, 'reports');
  const verificationRequests = collection(db, 'verification_requests');

  const weekStart = daysAgoDate(7);
  const previousWeekStart = daysAgoDate(14);
  const todayStart = daysAgoDate(0);

  const [
    totalStudents,
    pendingVerification,
    verifiedStudents,
    suspendedStudents,
    activeMatches,
    totalColleges,
    pendingColleges,
    openReports,
    newStudents7d,
    newStudentsPrev,
    newMatchesToday,
    recentSnapshot,
  ] = await Promise.all([
    countOf(students),
    countOf(query(students, where('verification_status', '==', 'pending'))),
    countOf(query(students, where('verification_status', '==', 'approved'))),
    countOf(query(students, where('verification_status', '==', 'suspended'))),
    countOf(query(matches, where('status', '==', 'active'))),
    countOf(query(colleges, where('verified_status', '==', 'approved'))),
    countOf(query(colleges, where('verified_status', '==', 'pending'))),
    countOf(query(reports, where('status', '==', 'pending'))),
    countOf(query(students, where('created_at', '>=', Timestamp.fromDate(weekStart)))),
    countOf(query(
      students,
      where('created_at', '>=', Timestamp.fromDate(previousWeekStart)),
      where('created_at', '<', Timestamp.fromDate(weekStart)),
    )),
    countOf(query(matches, where('matched_at', '>=', Timestamp.fromDate(todayStart)))),
    getDocs(query(
      verificationRequests,
      where('review_status', '==', 'pending'),
      orderBy('submitted_at', 'asc'),
      limit(5),
    )),
  ]);

  // Resolve the student and college names for the recent-requests table, which
  // previously rendered raw document IDs.
  const requests = recentSnapshot.docs.map((document) => ({
    id: document.id,
    student_id: String(document.get('student_id') ?? ''),
    college_id: String(document.get('college_id') ?? ''),
    submitted_at: toDateString(document.get('submitted_at'), { day: 'numeric', month: 'short' }),
  }));

  const [studentNames, collegeNames] = await Promise.all([
    resolveNames('students', requests.map((item) => item.student_id), 'full_name'),
    resolveNames('colleges', requests.map((item) => item.college_id), 'short_name', 'name'),
  ]);

  return {
    total_students: totalStudents,
    pending_verification: pendingVerification,
    verified_students: verifiedStudents,
    suspended_students: suspendedStudents,
    active_matches: activeMatches,
    total_colleges: totalColleges,
    pending_colleges: pendingColleges,
    open_reports: openReports,
    new_students_7d: newStudents7d,
    new_students_prev_7d: newStudentsPrev,
    new_matches_today: newMatchesToday,
    recent_verifications: requests.map((item) => ({
      id: item.id,
      student_name: studentNames.get(item.student_id) ?? 'Unknown student',
      college_name: collegeNames.get(item.college_id) ?? 'Unknown college',
      submitted_at: item.submitted_at,
    })),
  };
}

/** Batch document-name lookup (Firestore caps `in` filters at 30 values). */
async function resolveNames(
  collectionName: string,
  ids: string[],
  field: string,
  fallbackField?: string,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;

  for (let index = 0; index < unique.length; index += 30) {
    const chunk = unique.slice(index, index + 30);
    const snapshot = await getDocs(
      query(collection(db, collectionName), where(documentId(), 'in', chunk)),
    );
    snapshot.docs.forEach((document) => {
      const value = document.get(field) ?? (fallbackField ? document.get(fallbackField) : null);
      if (typeof value === 'string' && value) names.set(document.id, value);
    });
  }

  return names;
}

export async function getPendingCounts() {
  const [verification, reports] = await Promise.all([
    countOf(query(collection(db, 'verification_requests'), where('review_status', '==', 'pending'))),
    countOf(query(collection(db, 'reports'), where('status', '==', 'pending'))),
  ]);
  return { verification, reports };
}

// ── Verification queue ────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  student_id: string;
  verification_photo_url: string | null;
  name: string;
  college_email: string;
  college_name: string;
  branch: string | null;
  year: number | null;
  gender: string | null;
  date_of_birth: string | null;
  intent_flags: Record<string, boolean> | null;
  profile_photos: string[];
  submitted_at: string | null;
}

export type VerificationQueueItem = QueueItem & { dob: string | null };

export async function getVerificationQueue(): Promise<VerificationQueueItem[]> {
  const data = unwrap<{ items: QueueItem[] }>(await getVerificationQueueFn());
  return data.items.map((item) => ({
    ...item,
    dob: toDateString(item.date_of_birth),
    submitted_at: toDateString(item.submitted_at),
  }));
}

export async function reviewVerification(
  requestId: string,
  action: 'approve' | 'reject',
  notes?: string,
) {
  return unwrap<{ status: string }>(
    await reviewVerificationFn({ request_id: requestId, action, notes }),
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  full_name: string;
  college_email: string;
  college_id: string;
  branch: string | null;
  year: number | null;
  gender: string | null;
  verification_status: string;
  is_active: boolean;
  profile_photos: string[];
  suspension_reason: string | null;
  created_at: string | null;
  last_seen: string | null;
}

export interface UsersPage {
  users: AdminUser[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

const USERS_PAGE_SIZE = 25;

/** Paginated user listing, optionally filtered by verification status. */
export async function getUsers(options: {
  status?: string;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
} = {}): Promise<UsersPage> {
  const constraints = [
    ...(options.status ? [where('verification_status', '==', options.status)] : []),
    orderBy('created_at', 'desc'),
    ...(options.cursor ? [startAfter(options.cursor)] : []),
    limit(USERS_PAGE_SIZE + 1),
  ];

  const snapshot = await getDocs(query(collection(db, 'students'), ...constraints));
  const docs = snapshot.docs.slice(0, USERS_PAGE_SIZE);
  const hasMore = snapshot.docs.length > USERS_PAGE_SIZE;

  return {
    users: docs.map((document) => ({
      id: document.id,
      full_name: String(document.get('full_name') ?? '—'),
      college_email: String(document.get('college_email') ?? '—'),
      college_id: String(document.get('college_id') ?? ''),
      branch: (document.get('branch') as string | null) ?? null,
      year: (document.get('year') as number | null) ?? null,
      gender: (document.get('gender') as string | null) ?? null,
      verification_status: String(document.get('verification_status') ?? 'pending'),
      is_active: document.get('is_active') !== false,
      profile_photos: Array.isArray(document.get('profile_photos'))
        ? (document.get('profile_photos') as string[])
        : [],
      suspension_reason: (document.get('suspension_reason') as string | null) ?? null,
      created_at: toDateString(document.get('created_at')),
      last_seen: toDateString(document.get('last_seen'), {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      }),
    })),
    cursor: docs.at(-1) ?? null,
    hasMore,
  };
}

export async function suspendUser(studentId: string, reason: string) {
  return unwrap<{ status: string }>(await suspendUserFn({ student_id: studentId, reason }));
}

export async function reinstateUser(studentId: string, notes?: string) {
  return unwrap<{ status: string }>(await reinstateUserFn({ student_id: studentId, notes }));
}

export async function sendAnnouncement(studentId: string, title: string, body: string) {
  return unwrap<{ push_delivered: boolean }>(
    await sendPushNotificationFn({ user_id: studentId, title, body }),
  );
}

export async function resendWelcomeEmail(to: string, name: string, collegeName: string) {
  return unwrap<{ delivered: boolean }>(
    await sendEmailFn({ to, template: 'welcome', params: { name, college_name: collegeName } }),
  );
}

// ── Colleges ──────────────────────────────────────────────────────────────────

export interface AdminCollege {
  id: string;
  name: string;
  short_name: string;
  domain: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  city: string;
  state: string;
  verified_status: string;
  student_count: number | null;
  created_at: string | null;
}

export async function getColleges(): Promise<AdminCollege[]> {
  const snapshot = await getDocs(query(collection(db, 'colleges'), orderBy('created_at', 'desc')));
  return snapshot.docs.map((document) => ({
    id: document.id,
    name: String(document.get('name') ?? '—'),
    short_name: String(document.get('short_name') ?? ''),
    domain: String(document.get('domain') ?? ''),
    logo_url: (document.get('logo_url') as string | null) || null,
    primary_color: (document.get('primary_color') as string | null) || null,
    secondary_color: (document.get('secondary_color') as string | null) || null,
    city: String(document.get('city') ?? ''),
    state: String(document.get('state') ?? ''),
    verified_status: String(document.get('verified_status') ?? 'pending'),
    student_count: (document.get('student_count') as number | null) ?? null,
    created_at: toDateString(document.get('created_at')),
  }));
}

export interface CreateCollegeInput {
  name: string;
  short_name: string;
  domain: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  city: string;
  state: string;
  student_count?: number;
}

export async function createCollege(input: CreateCollegeInput) {
  return unwrap<{ college_id: string }>(await createCollegeFn(input));
}

export async function approveCollege(
  collegeId: string,
  action: 'approve' | 'reject',
  reason?: string,
) {
  return unwrap<null>(await approveCollegeFn({ college_id: collegeId, action, reason }));
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface SafetyReport {
  id: string;
  reporter_id: string;
  reported_id: string;
  reporter_name: string;
  reported_name: string;
  reported_email: string;
  reported_status: string;
  category: string;
  reason: string;
  description: string | null;
  created_at: string | null;
}

export async function getReports(): Promise<SafetyReport[]> {
  const snapshot = await getDocs(query(
    collection(db, 'reports'),
    where('status', '==', 'pending'),
    orderBy('created_at', 'asc'),
    limit(100),
  ));

  const rows = snapshot.docs.map((document) => ({
    id: document.id,
    reporter_id: String(document.get('reporter_id') ?? ''),
    reported_id: String(document.get('reported_id') ?? ''),
    category: String(document.get('category') ?? 'other'),
    reason: String(document.get('reason') ?? 'other'),
    description: (document.get('description') as string | null) ?? null,
    created_at: toDateString(document.get('created_at'), {
      day: 'numeric', month: 'short', year: 'numeric',
    }),
  }));

  // Resolve names so moderators see people rather than truncated UIDs.
  const ids = rows.flatMap((row) => [row.reporter_id, row.reported_id]);
  const [names, details] = await Promise.all([
    resolveNames('students', ids, 'full_name'),
    resolveStudentDetails(rows.map((row) => row.reported_id)),
  ]);

  return rows.map((row) => ({
    ...row,
    reporter_name: names.get(row.reporter_id) ?? 'Unknown',
    reported_name: names.get(row.reported_id) ?? 'Unknown',
    reported_email: details.get(row.reported_id)?.email ?? '',
    reported_status: details.get(row.reported_id)?.status ?? 'unknown',
  }));
}

async function resolveStudentDetails(
  ids: string[],
): Promise<Map<string, { email: string; status: string }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const details = new Map<string, { email: string; status: string }>();
  if (unique.length === 0) return details;

  for (let index = 0; index < unique.length; index += 30) {
    const chunk = unique.slice(index, index + 30);
    const snapshot = await getDocs(
      query(collection(db, 'students'), where(documentId(), 'in', chunk)),
    );
    snapshot.docs.forEach((document) => {
      details.set(document.id, {
        email: String(document.get('college_email') ?? ''),
        status: String(document.get('verification_status') ?? 'unknown'),
      });
    });
  }

  return details;
}

export async function reviewReport(
  reportId: string,
  status: 'action_taken' | 'dismissed',
  actionNotes?: string,
) {
  return unwrap<{ status: string }>(
    await reviewReportFn({ report_id: reportId, status, action_notes: actionNotes }),
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface PlatformAnalytics {
  window_days: number;
  totals: {
    total_students: number;
    approved_students: number;
    pending_students: number;
    rejected_students: number;
    suspended_students: number;
    active_matches: number;
    total_matches: number;
    open_reports: number;
    resolved_reports: number;
    approved_colleges: number;
    pending_colleges: number;
    total_connect_requests: number;
    accepted_connect_requests: number;
  };
  rates: {
    verification_rate: number | null;
    acceptance_rate: number | null;
    signup_trend_pct: number | null;
    match_trend_pct: number | null;
  };
  daily: Array<{ date: string; signups: number; matches: number }>;
  verification_breakdown: Array<{ status: string; count: number }>;
  match_types: Array<{ type: string; count: number }>;
  top_colleges: Array<{ college_id: string; name: string; signups: number }>;
}

export async function getPlatformAnalytics(days = 30): Promise<PlatformAnalytics> {
  return unwrap<PlatformAnalytics>(await getPlatformAnalyticsFn({ days }));
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  target_id: string;
  target_collection: string;
  details: Record<string, unknown> | null;
  created_at: string | null;
}

export async function getAuditLog(pageSize = 50): Promise<AuditEntry[]> {
  const snapshot = await getDocs(query(
    collection(db, 'audit_logs'),
    orderBy('created_at', 'desc'),
    limit(pageSize),
  ));

  const rows = snapshot.docs.map((document) => ({
    id: document.id,
    admin_id: String(document.get('admin_id') ?? ''),
    action: String(document.get('action') ?? ''),
    target_id: String(document.get('target_id') ?? ''),
    target_collection: String(document.get('target_collection') ?? ''),
    details: (document.get('details') as Record<string, unknown> | null) ?? null,
    created_at: toDateString(document.get('created_at'), {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }),
  }));

  const names = await resolveNames('students', rows.map((row) => row.admin_id), 'full_name');

  return rows.map((row) => ({
    ...row,
    admin_name: names.get(row.admin_id) ?? row.admin_id.slice(0, 8),
  }));
}
