import {
  db,
  getVerificationQueueFn,
  reviewVerificationFn,
  reviewReportFn,
  createCollegeFn,
  approveCollegeFn,
} from './firebase';
import {
  collection, getDocs, query, where, orderBy,
  limit, Timestamp, getCountFromServer
} from 'firebase/firestore';

// ── Dashboard Stats ────────────────────────────────────────────────────────────
export async function getDashboardStats() {
  const [totalStudents, pendingVerification, verifiedStudents, activeMatches, totalColleges, openReports] =
    await Promise.all([
      getCountFromServer(collection(db, 'students')),
      getCountFromServer(query(collection(db, 'students'), where('verification_status', '==', 'pending'))),
      getCountFromServer(query(collection(db, 'students'), where('verification_status', '==', 'approved'))),
      getCountFromServer(query(collection(db, 'matches'), where('status', '==', 'active'))),
      getCountFromServer(query(collection(db, 'colleges'), where('verified_status', '==', 'approved'))),
      getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'pending'))),
    ]);

  // Recent verifications
  const recentSnap = await getDocs(
    query(
      collection(db, 'verification_requests'),
      where('review_status', '==', 'pending'),
      orderBy('submitted_at', 'asc'),
      limit(5)
    )
  );

  const recent_verifications = recentSnap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    submitted_at: (d.data().submitted_at as Timestamp)?.toDate()
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  }));

  return {
    total_students: totalStudents.data().count,
    pending_verification: pendingVerification.data().count,
    verified_students: verifiedStudents.data().count,
    active_matches: activeMatches.data().count,
    total_colleges: totalColleges.data().count,
    open_reports: openReports.data().count,
    recent_verifications,
  };
}

// ── Pending Counts (for nav badges) ───────────────────────────────────────────
export async function getPendingCounts() {
  const [verification, reports] = await Promise.all([
    getCountFromServer(query(collection(db, 'verification_requests'), where('review_status', '==', 'pending'))),
    getCountFromServer(query(collection(db, 'reports'), where('status', '==', 'pending'))),
  ]);

  return {
    verification: verification.data().count,
    reports: reports.data().count,
  };
}

// ── Verification Queue ─────────────────────────────────────────────────────────
interface VerificationQueueResponse {
  success: boolean;
  data: {
    items: Array<{
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
    }>;
  };
}

function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', options);
}

export async function getVerificationQueue() {
  const result = await getVerificationQueueFn();
  const response = result.data as VerificationQueueResponse;

  return response.data.items.map((item) => ({
    ...item,
    dob: formatDate(item.date_of_birth),
    submitted_at: formatDate(item.submitted_at, {
      day: 'numeric', month: 'short', year: 'numeric',
    }),
  }));
}

// ── Review Verification ────────────────────────────────────────────────────────
export async function reviewVerification(requestId: string, action: 'approve' | 'reject', notes?: string) {
  const result = await reviewVerificationFn({ request_id: requestId, action, notes });
  return result.data;
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function getUsers(statusFilter?: string) {
  let q = query(collection(db, 'students'), orderBy('created_at', 'desc'), limit(100));
  if (statusFilter) {
    q = query(collection(db, 'students'), where('verification_status', '==', statusFilter), orderBy('created_at', 'desc'), limit(100));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── Colleges ──────────────────────────────────────────────────────────────────
export async function getColleges() {
  const snap = await getDocs(query(collection(db, 'colleges'), orderBy('created_at', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createCollege(data: Record<string, unknown>) {
  const result = await createCollegeFn(data);
  return result.data;
}

export async function approveCollege(collegeId: string, action: 'approve' | 'reject', reason?: string) {
  const result = await approveCollegeFn({ college_id: collegeId, action, reason });
  return result.data;
}

// ── Reports ───────────────────────────────────────────────────────────────────
export interface SafetyReport {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason: string;
  description?: string;
  created_at?: Timestamp;
}

export async function getReports(): Promise<SafetyReport[]> {
  const snap = await getDocs(
    query(collection(db, 'reports'), where('status', '==', 'pending'), orderBy('created_at', 'asc'), limit(100))
  );
  return snap.docs.map((document) => {
    const report = document.data();
    return {
      id: document.id,
      reporter_id: String(report.reporter_id ?? ''),
      reported_id: String(report.reported_id ?? ''),
      reason: String(report.reason ?? 'other'),
      description: typeof report.description === 'string' ? report.description : undefined,
      created_at: report.created_at instanceof Timestamp ? report.created_at : undefined,
    };
  });
}

export async function updateReportStatus(
  reportId: string,
  status: 'action_taken' | 'dismissed',
  actionNotes?: string,
) {
  const result = await reviewReportFn({
    report_id: reportId,
    status,
    action_notes: actionNotes,
  });
  return result.data;
}
