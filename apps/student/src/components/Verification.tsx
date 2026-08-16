import { useState } from 'react';
import type { FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { auth, functions, storage } from '../services/firebase';
import { formatErrorMessage } from '../utils/errors';

export type StudentProfile = {
  id: string;
  full_name: string;
  bio?: string;
  branch?: string;
  year?: number;
  interests?: string[];
  profile_photos?: string[];
  verification_status?: string;
  college_id?: string;
  college_email?: string;
  gender?: string;
  intent_flags?: Record<string, boolean>;
  date_of_birth?: unknown;
};

interface VerificationProps {
  profile: StudentProfile | null;
  onProfileUpdated?: () => void;
}

export function Verification({ profile, onProfileUpdated }: VerificationProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const interests = String(form.get('interests') || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    setBusy(true);
    setError('');

    try {
      const createProfileFn = httpsCallable(functions, 'createProfile');
      await createProfileFn({
        full_name: String(form.get('full_name')).trim(),
        date_of_birth: String(form.get('date_of_birth')),
        gender: form.get('gender'),
        bio: String(form.get('bio')).trim(),
        branch: String(form.get('branch')).trim(),
        year: Number(form.get('year')),
        interests,
        intent_flags: {
          dating: false,
          friendship: true,
          study: true,
          hackathon: false,
          project: false,
        },
        consent_given: true,
        consent_version: '1.0.0',
      });

      if (onProfileUpdated) {
        onProfileUpdated();
      } else {
        window.location.reload();
      }
    } catch (e) {
      setError(formatErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadVerification = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo || !auth.currentUser) return;

    setBusy(true);
    setError('');

    try {
      if (!photo.type.startsWith('image/') || photo.size > 8 * 1024 * 1024) {
        throw new Error('Please choose a JPG, PNG, or WebP image under 8 MB.');
      }

      const path = `verification_photos/${auth.currentUser.uid}/${crypto.randomUUID()}`;
      await uploadBytes(ref(storage, path), photo, { contentType: photo.type });

      const submitPhotoFn = httpsCallable(functions, 'submitVerificationPhoto');
      await submitPhotoFn({ storage_path: path });

      if (onProfileUpdated) {
        onProfileUpdated();
      } else {
        window.location.reload();
      }
    } catch (e) {
      setError(formatErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!profile) {
    return (
      <section className="onboarding">
        <p className="eyebrow">PROFILE SETUP</p>
        <h1>Tell your campus about you.</h1>
        <p className="intro">
          Your profile is only shared with verified students from your own college campus.
        </p>

        <form className="profile-form" onSubmit={submitProfile}>
          <label>
            Full name
            <input name="full_name" minLength={2} maxLength={60} required placeholder="e.g. Alex Sharma" />
          </label>
          <label>
            Date of birth
            <input name="date_of_birth" type="date" required />
          </label>
          <label>
            Gender
            <select name="gender" defaultValue="prefer_not_to_say">
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Branch / Course
            <input name="branch" minLength={2} required placeholder="e.g. Computer Science" />
          </label>
          <label>
            Year of study
            <select name="year" defaultValue="1">
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3</option>
              <option value="4">Year 4</option>
              <option value="5">Year 5</option>
              <option value="6">Year 6</option>
            </select>
          </label>
          <label>
            About you
            <textarea
              name="bio"
              minLength={10}
              maxLength={500}
              required
              placeholder="What are you looking to build, learn, or explore on campus?"
            />
          </label>
          <label>
            Interests
            <input name="interests" required placeholder="Coding, photography, startups (comma separated)" />
          </label>

          {error && <p className="form-error-text" role="alert">{error}</p>}

          <button className="primary" disabled={busy}>
            {busy ? 'Saving profile…' : 'Save profile'} <span>→</span>
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="onboarding">
      <p className="eyebrow">STUDENT VERIFICATION</p>
      <h1>
        Your profile is ready.<br />
        Verify to unlock campus access.
      </h1>
      <p className="intro">
        Upload a clear student ID card or a photo in your official college uniform. It is stored privately and reviewed by your college administrators.
      </p>

      <form className="profile-form" onSubmit={uploadVerification}>
        <label>
          Student ID or Uniform Photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            required
          />
        </label>

        {error && <p className="form-error-text" role="alert">{error}</p>}

        <button className="primary" disabled={busy || !photo}>
          {busy ? 'Uploading…' : 'Submit for review'} <span>→</span>
        </button>
      </form>
    </section>
  );
}
