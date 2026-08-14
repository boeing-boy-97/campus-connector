/**
 * Campus Connect — Seed Data Script
 * Seeds Firestore with sample colleges and test data for development
 *
 * Usage: npx ts-node seed.ts
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var or Firebase emulator running
 */

import * as admin from 'firebase-admin';

// Run against emulator by default
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';

admin.initializeApp({ projectId: 'campus-connect-dev' });
const db = admin.firestore();

// ── Seed Data ─────────────────────────────────────────────────────────────────

const colleges = [
  {
    name: 'JD College of Engineering and Management',
    short_name: 'JD College',
    domain: 'jdcollege.edu.in',
    logo_url: 'https://firebasestorage.googleapis.com/placeholder/jd-college-logo.png',
    primary_color: '#1A237E',
    secondary_color: '#E91E63',
    city: 'Nagpur',
    state: 'Maharashtra',
    verified_status: 'approved',
    student_count: 3000,
  },
  {
    name: 'Visvesvaraya National Institute of Technology',
    short_name: 'VNIT Nagpur',
    domain: 'student.vnit.ac.in',
    logo_url: 'https://firebasestorage.googleapis.com/placeholder/vnit-logo.png',
    primary_color: '#0D47A1',
    secondary_color: '#FF6F00',
    city: 'Nagpur',
    state: 'Maharashtra',
    verified_status: 'approved',
    student_count: 5000,
  },
  {
    name: 'Demo College (Pending Approval)',
    short_name: 'Demo College',
    domain: 'demo.edu.in',
    logo_url: '',
    primary_color: '#6C63FF',
    secondary_color: '#E91E63',
    city: 'Mumbai',
    state: 'Maharashtra',
    verified_status: 'pending',
    student_count: 1000,
  },
];

const branches = ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical', 'Civil', 'Electrical'];
const interests = ['Coding', 'Music', 'Cricket', 'Photography', 'Gaming', 'Art', 'Dance', 'Reading', 'Travel', 'Cooking'];

async function seedColleges() {
  console.log('🏫 Seeding colleges...');
  const collegeIds: Record<string, string> = {};

  for (const college of colleges) {
    const docRef = await db.collection('colleges').add({
      ...college,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    collegeIds[college.domain] = docRef.id;
    console.log(`  ✅ ${college.short_name}: ${docRef.id}`);
  }

  return collegeIds;
}

async function seedStudents(collegeIds: Record<string, string>) {
  console.log('👥 Seeding test students...');

  const jdCollegeId = collegeIds['jdcollege.edu.in'];
  if (!jdCollegeId) return;

  const testStudents = [
    {
      full_name: 'Aarav Sharma',
      college_email: 'aarav.sharma@jdcollege.edu.in',
      college_id: jdCollegeId,
      branch: 'Computer Science',
      year: 3,
      gender: 'male',
      bio: 'Passionate about AI and building impactful products. Love cricket on weekends! 🏏',
      verification_status: 'approved',
      intent_flags: { dating: true, friendship: true, study: false, hackathon: true, project: true },
      interests: ['Coding', 'Cricket', 'Gaming'],
      is_active: true,
      is_profile_complete: true,
      profile_photos: [],
    },
    {
      full_name: 'Priya Patel',
      college_email: 'priya.patel@jdcollege.edu.in',
      college_id: jdCollegeId,
      branch: 'Information Technology',
      year: 2,
      gender: 'female',
      bio: 'UI/UX enthusiast & photography lover 📸 Looking for hackathon teammates!',
      verification_status: 'approved',
      intent_flags: { dating: false, friendship: true, study: true, hackathon: true, project: true },
      interests: ['Photography', 'Art', 'Coding'],
      is_active: true,
      is_profile_complete: true,
      profile_photos: [],
    },
    {
      full_name: 'Rohan Desai',
      college_email: 'rohan.desai@jdcollege.edu.in',
      college_id: jdCollegeId,
      branch: 'Electronics',
      year: 4,
      gender: 'male',
      bio: 'Final year ETC student. Into robotics, IOT and music. 🎸',
      verification_status: 'pending',
      intent_flags: { dating: true, friendship: true, study: false, hackathon: false, project: false },
      interests: ['Music', 'Coding'],
      is_active: true,
      is_profile_complete: true,
      profile_photos: [],
    },
  ];

  for (const student of testStudents) {
    const uid = `test_${student.full_name.toLowerCase().replace(' ', '_')}`;
    await db.collection('students').doc(uid).set({
      ...student,
      id: uid,
      date_of_birth: admin.firestore.Timestamp.fromDate(new Date('2002-06-15')),
      consent_given_at: admin.firestore.FieldValue.serverTimestamp(),
      consent_version: '1.0.0',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`  ✅ ${student.full_name}`);
  }
}

async function main() {
  console.log('🌱 Campus Connect Seed Script');
  console.log('================================');
  console.log(`📡 Firestore: ${process.env.FIRESTORE_EMULATOR_HOST}`);

  try {
    const collegeIds = await seedColleges();
    await seedStudents(collegeIds);
    console.log('\n✅ Seeding complete!');
    console.log('Open Firebase Emulator UI at http://localhost:4000');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

main();
