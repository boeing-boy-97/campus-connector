// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  admin/analytics.ts — Real platform analytics for the admin dashboard      ║
// ║                                                                          ║
// ║  Every number here is computed from Firestore. Counts use aggregation      ║
// ║  queries (billed per index scan, not per document) and the daily series    ║
// ║  reads only documents inside the requested window.                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as functions from 'firebase-functions/v1';
import { z } from 'zod';
import { db } from '../../config/firebase';
import { requireModerator } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { handleUnknownError } from '../../utils/errors';
import { COLLECTIONS } from '../../../../../shared/constants';
import {
  CollegeVerifiedStatus,
  MatchStatus,
  ReportStatus,
  VerificationStatus,
} from '../../../../../shared/enums';

const schema = z.object({
  /** Size of the daily trend window. */
  days: z.number().int().min(7).max(90).default(30),
});

/** Midnight UTC, `daysAgo` days before now. */
function startOfDayUtc(daysAgo: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Counts documents per UTC day from a timestamp field. */
function bucketByDay(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  field: string
): Map<string, number> {
  const buckets = new Map<string, number>();
  for (const document of docs) {
    const value = document.get(field);
    if (typeof value?.toDate !== 'function') continue;
    const key = dayKey(value.toDate());
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return buckets;
}

async function countOf(query: FirebaseFirestore.Query): Promise<number> {
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

export const getPlatformAnalytics = functions
  .region('asia-south1')
  .runWith({ memory: '512MB', timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
    try {
      requireModerator(context);
      const { days } = validate(schema, data ?? {});

      const students = db.collection(COLLECTIONS.STUDENTS);
      const matches = db.collection(COLLECTIONS.MATCHES);
      const reports = db.collection(COLLECTIONS.REPORTS);
      const colleges = db.collection(COLLECTIONS.COLLEGES);
      const requests = db.collection(COLLECTIONS.CONNECT_REQUESTS);
      const windowStart = startOfDayUtc(days - 1);

      const [
        totalStudents,
        approvedStudents,
        pendingStudents,
        rejectedStudents,
        suspendedStudents,
        activeMatches,
        totalMatches,
        openReports,
        resolvedReports,
        approvedColleges,
        pendingColleges,
        totalConnectRequests,
        acceptedConnectRequests,
        newStudentDocs,
        newMatchDocs,
        collegeDocs,
      ] = await Promise.all([
        countOf(students),
        countOf(students.where('verification_status', '==', VerificationStatus.APPROVED)),
        countOf(students.where('verification_status', '==', VerificationStatus.PENDING)),
        countOf(students.where('verification_status', '==', VerificationStatus.REJECTED)),
        countOf(students.where('verification_status', '==', VerificationStatus.SUSPENDED)),
        countOf(matches.where('status', '==', MatchStatus.ACTIVE)),
        countOf(matches),
        countOf(reports.where('status', '==', ReportStatus.PENDING)),
        countOf(reports.where('status', 'in', [ReportStatus.ACTION_TAKEN, ReportStatus.DISMISSED])),
        countOf(colleges.where('verified_status', '==', CollegeVerifiedStatus.APPROVED)),
        countOf(colleges.where('verified_status', '==', CollegeVerifiedStatus.PENDING)),
        countOf(requests),
        countOf(requests.where('status', '==', 'accepted')),
        students.where('created_at', '>=', windowStart).select('created_at', 'college_id').get(),
        matches.where('matched_at', '>=', windowStart).select('matched_at', 'match_type').get(),
        colleges.select('name', 'short_name').get(),
      ]);

      // ── Daily signup / match trend ────────────────────────────────────────
      const signupBuckets = bucketByDay(newStudentDocs.docs, 'created_at');
      const matchBuckets = bucketByDay(newMatchDocs.docs, 'matched_at');
      const daily: Array<{ date: string; signups: number; matches: number }> = [];
      for (let offset = days - 1; offset >= 0; offset -= 1) {
        const key = dayKey(startOfDayUtc(offset));
        daily.push({
          date: key,
          signups: signupBuckets.get(key) ?? 0,
          matches: matchBuckets.get(key) ?? 0,
        });
      }

      // ── Connection-type distribution over the window ──────────────────────
      const matchTypeCounts = new Map<string, number>();
      for (const document of newMatchDocs.docs) {
        const type = (document.get('match_type') as string) || 'unspecified';
        matchTypeCounts.set(type, (matchTypeCounts.get(type) ?? 0) + 1);
      }

      // ── Signups per college over the window ───────────────────────────────
      const collegeNames = new Map<string, string>();
      collegeDocs.docs.forEach((document) => {
        collegeNames.set(
          document.id,
          (document.get('short_name') as string) || (document.get('name') as string) || 'Unknown'
        );
      });
      const collegeCounts = new Map<string, number>();
      for (const document of newStudentDocs.docs) {
        const collegeId = (document.get('college_id') as string) || 'unknown';
        collegeCounts.set(collegeId, (collegeCounts.get(collegeId) ?? 0) + 1);
      }

      const halfway = Math.floor(daily.length / 2);
      const recentSignups = daily.slice(halfway).reduce((sum, day) => sum + day.signups, 0);
      const earlierSignups = daily.slice(0, halfway).reduce((sum, day) => sum + day.signups, 0);
      const recentMatches = daily.slice(halfway).reduce((sum, day) => sum + day.matches, 0);
      const earlierMatches = daily.slice(0, halfway).reduce((sum, day) => sum + day.matches, 0);

      /** Percentage change between the two halves of the window, or null. */
      const trend = (recent: number, earlier: number): number | null =>
        earlier === 0 ? null : Math.round(((recent - earlier) / earlier) * 100);

      return {
        success: true,
        data: {
          window_days: days,
          totals: {
            total_students: totalStudents,
            approved_students: approvedStudents,
            pending_students: pendingStudents,
            rejected_students: rejectedStudents,
            suspended_students: suspendedStudents,
            active_matches: activeMatches,
            total_matches: totalMatches,
            open_reports: openReports,
            resolved_reports: resolvedReports,
            approved_colleges: approvedColleges,
            pending_colleges: pendingColleges,
            total_connect_requests: totalConnectRequests,
            accepted_connect_requests: acceptedConnectRequests,
          },
          rates: {
            verification_rate: totalStudents === 0
              ? null
              : Math.round((approvedStudents / totalStudents) * 100),
            acceptance_rate: totalConnectRequests === 0
              ? null
              : Math.round((acceptedConnectRequests / totalConnectRequests) * 100),
            signup_trend_pct: trend(recentSignups, earlierSignups),
            match_trend_pct: trend(recentMatches, earlierMatches),
          },
          daily,
          verification_breakdown: [
            { status: VerificationStatus.APPROVED, count: approvedStudents },
            { status: VerificationStatus.PENDING, count: pendingStudents },
            { status: VerificationStatus.REJECTED, count: rejectedStudents },
            { status: VerificationStatus.SUSPENDED, count: suspendedStudents },
          ],
          match_types: [...matchTypeCounts.entries()]
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count),
          top_colleges: [...collegeCounts.entries()]
            .map(([collegeId, count]) => ({
              college_id: collegeId,
              name: collegeNames.get(collegeId) ?? 'Unknown',
              signups: count,
            }))
            .sort((a, b) => b.signups - a.signups)
            .slice(0, 8),
        },
      };
    } catch (error) {
      handleUnknownError(error, 'getPlatformAnalytics');
    }
  });
