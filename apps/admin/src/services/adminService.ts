import { db, reviewVerificationFn, createCollegeFn, approveCollegeFn } from './firebase';
import {
  collection, getDocs, getDoc, query, where, orderBy,
  limit, doc, updateDoc, Timestamp, getCountFromServer
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
export async function getVerificationQueue() {
  const snap = await getDocs(
    query(
      collection(db, 'verification_requests'),
      where('review_status', '==', 'pending'),
      orderBy('submitted_at', 'asc'),
      limit(50)
    )
  );

  // Enrich with student data
  const items = await Promise.all(
    snap.docs.map(async (d) => {
      const vr = d.data();
      const studentSnap = await getDoc(doc(db, 'students', vr.student_id));
      const student = studentSnap.data() || {};
      const collegeSnap = await getDoc(doc(db, 'colleges', vr.college_id));
      const college = collegeSnap.data() || {};

      return {
        id: d.id,
        student_id: vr.student_id,
        uniform_photo_url: vr.uniform_photo_url,
        id_card_photo_url: vr.id_card_photo_url,
        name: student.full_name,
        college_email: student.college_email,
        college_name: college.name,
        branch: student.branch,
        year: student.year,
        gender: student.gender,
        dob: student.date_of_birth
          ? (student.date_of_birth as Timestamp).toDate().toLocaleDateString('en-IN')
          : null,
        intent_flags: student.intent_flags,
        profile_photos: student.profile_photos,
        submitted_at: (vr.submitted_at as Timestamp)?.toDate()
          .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      };
    })
  );

  return items;
}

// ── Review Verification ────────────────────────────────────────────────────────
export async function reviewVerification(requestId: string, action: 'approve' | 'reject', notes?: string) {
  // The backend function expects student_id, not request_id
  // We need to look up the student_id from the verification request
  const vrSnap = await getDoc(doc(db, 'verification_requests', requestId));
  const studentId = vrSnap.data()?.student_id || requestId;

  const result = await reviewVerificationFn({ student_id: studentId, action, notes });
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
export async function getReports() {
  const snap = await getDocs(
    query(collection(db, 'reports'), where('status', '==', 'pending'), orderBy('created_at', 'asc'), limit(100))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateReportStatus(reportId: string, status: string, actionNotes?: string) {
  await updateDoc(doc(db, 'reports', reportId), {
    status,
    action_taken: actionNotes || null,
  });
}
