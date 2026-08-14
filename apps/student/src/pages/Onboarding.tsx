import { useMemo, useState, type FormEvent } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { auth, storage } from '../services/firebase';
import { api, errorMessage } from '../services/api';
import { Icon } from '../components/Icon';
import { FieldError, Spinner } from '../components/states';
import { usePhotoUrl } from '../lib/usePhotoUrl';
import { IntentPicker } from '../components/IntentPicker';
import { formatBytes } from '../lib/format';
import { type IntentFlags, type Student } from '../types';

const CONSENT_VERSION = '1.0.0';
const MAX_VERIFICATION_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const NAME_PATTERN = /^[a-zA-Z\s.'-]+$/;

/** Years of study offered in the selects. */
const YEARS = [1, 2, 3, 4, 5, 6];

function emptyIntents(): IntentFlags {
  return { dating: false, friendship: true, study: true, hackathon: false, project: false };
}

/** Age in whole years, used for the client-side 18+ gate. */
function ageFrom(dateOfBirth: string): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

/** Step 1 — create the profile document. */
function ProfileForm({ onDone }: { onDone: () => void }) {
  const [intents, setIntents] = useState<IntentFlags>(emptyIntents);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // 18+ is enforced server-side too; this bound just prevents an obvious
  // round-trip failure and gives the date picker a sensible ceiling.
  const maxDob = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return date.toISOString().slice(0, 10);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const fullName = String(form.get('full_name') ?? '').trim();
    const dateOfBirth = String(form.get('date_of_birth') ?? '');
    const bio = String(form.get('bio') ?? '').trim();
    const branch = String(form.get('branch') ?? '').trim();
    const interests = String(form.get('interests') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const errors: Record<string, string> = {};
    if (fullName.length < 2 || fullName.length > 60) {
      errors.full_name = 'Enter your full name (2–60 characters).';
    } else if (!NAME_PATTERN.test(fullName)) {
      errors.full_name = 'Names may only contain letters, spaces, apostrophes, hyphens and periods.';
    }

    const age = ageFrom(dateOfBirth);
    if (age === null) errors.date_of_birth = 'Enter a valid date of birth.';
    else if (age < 18) errors.date_of_birth = 'You must be at least 18 years old to use Campus Connector.';
    else if (age > 100) errors.date_of_birth = 'Enter a valid date of birth.';

    if (branch.length < 2) errors.branch = 'Enter your branch or course.';
    if (bio.length < 10) errors.bio = 'Write at least 10 characters so people know who you are.';
    if (bio.length > 500) errors.bio = 'Keep your bio under 500 characters.';
    if (interests.length === 0) errors.interests = 'Add at least one interest.';
    if (interests.length > 15) errors.interests = 'Add up to 15 interests.';
    if (interests.some((item) => item.length > 50)) errors.interests = 'Each interest must be under 50 characters.';
    if (!Object.values(intents).some(Boolean)) errors.intent = 'Select at least one connection type.';

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError('');

    try {
      await api.createProfile({
        full_name: fullName,
        date_of_birth: dateOfBirth,
        gender: form.get('gender'),
        bio,
        branch,
        year: Number(form.get('year')),
        interests,
        intent_flags: intents,
        consent_given: true,
        consent_version: CONSENT_VERSION,
      });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught, 'We could not save your profile.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="page-head">
        <p className="eyebrow">Step 1 of 2 · Profile</p>
        <h1 className="display">Tell your campus about you.</h1>
        <p className="lede">
          Your profile is only ever shown to verified students from your own college.
        </p>
      </header>

      <form className="panel" onSubmit={submit} noValidate>
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="full_name">Full name</label>
            <input
              id="full_name" name="full_name" className="input"
              autoComplete="name" maxLength={60}
              aria-invalid={fieldErrors.full_name ? 'true' : undefined}
              required
            />
            {fieldErrors.full_name && <FieldError>{fieldErrors.full_name}</FieldError>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="date_of_birth">Date of birth</label>
            <input
              id="date_of_birth" name="date_of_birth" className="input" type="date"
              max={maxDob}
              aria-invalid={fieldErrors.date_of_birth ? 'true' : undefined}
              aria-describedby="dob-hint"
              required
            />
            <span className="hint" id="dob-hint">Campus Connector is strictly 18+.</span>
            {fieldErrors.date_of_birth && <FieldError>{fieldErrors.date_of_birth}</FieldError>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="gender">Gender</label>
            <select id="gender" name="gender" className="select" defaultValue="prefer_not_to_say">
              <option value="prefer_not_to_say">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="year">Year of study</label>
            <select id="year" name="year" className="select" defaultValue="1">
              {YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </div>

          <div className="field span-2">
            <label className="field-label" htmlFor="branch">Branch or course</label>
            <input
              id="branch" name="branch" className="input"
              placeholder="e.g. Computer Science" maxLength={100}
              aria-invalid={fieldErrors.branch ? 'true' : undefined}
              required
            />
            {fieldErrors.branch && <FieldError>{fieldErrors.branch}</FieldError>}
          </div>

          <div className="field span-2">
            <label className="field-label" htmlFor="bio">About you</label>
            <textarea
              id="bio" name="bio" className="textarea"
              maxLength={500}
              placeholder="What are you looking to build, learn or explore this year?"
              aria-invalid={fieldErrors.bio ? 'true' : undefined}
              required
            />
            {fieldErrors.bio && <FieldError>{fieldErrors.bio}</FieldError>}
          </div>

          <div className="field span-2">
            <label className="field-label" htmlFor="interests">Interests</label>
            <input
              id="interests" name="interests" className="input"
              placeholder="Design, football, startups"
              aria-invalid={fieldErrors.interests ? 'true' : undefined}
              aria-describedby="interests-hint"
              required
            />
            <span className="hint" id="interests-hint">Separate with commas. Up to 15.</span>
            {fieldErrors.interests && <FieldError>{fieldErrors.interests}</FieldError>}
          </div>

          <IntentPicker value={intents} onChange={setIntents} />
        </div>

        {error && <FieldError>{error}</FieldError>}

        <button type="submit" className="button primary large" disabled={busy}>
          {busy ? <><Spinner label="Saving" /> Saving…</> : <>Save and continue <Icon name="send" size={17} /></>}
        </button>
      </form>
    </section>
  );
}

/** Step 2 — upload verification evidence. */
function VerificationForm({ profile }: { profile: Student }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (file: File | undefined) => {
    setError('');
    if (!file) {
      setPhoto(null);
      setPreview(undefined);
      return;
    }

    // Validate before upload so the user is not left waiting for a rejection.
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP image.');
      setPhoto(null);
      setPreview(undefined);
      return;
    }
    if (file.size > MAX_VERIFICATION_BYTES) {
      setError(`That image is ${formatBytes(file.size)}. Please choose one under 8 MB.`);
      setPhoto(null);
      setPreview(undefined);
      return;
    }

    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo || !auth.currentUser) return;

    setBusy(true);
    setError('');

    try {
      const extension = photo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `verification_photos/${auth.currentUser.uid}/${crypto.randomUUID()}.${extension}`;

      // `ownerId` metadata is required by the Storage rules.
      await uploadBytes(ref(storage, path), photo, {
        contentType: photo.type,
        customMetadata: { ownerId: auth.currentUser.uid },
      });

      await api.submitVerificationPhoto(path);
      setPhoto(null);
      setPreview(undefined);
      // The realtime profile listener flips this screen to "pending review".
    } catch (caught) {
      setError(errorMessage(caught, 'We could not submit your verification photo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <header className="page-head">
        <p className="eyebrow">Step 2 of 2 · Verification</p>
        <h1 className="display">Your profile is ready.<br />Verify it to join.</h1>
        <p className="lede">
          Upload a clear photo of your student ID card, or a photo of yourself in your official
          college uniform. It is stored privately, is never shown to other students, and is
          reviewed only by authorised campus administrators.
        </p>
      </header>

      {profile.verification_status === 'rejected' && (
        <p className="banner danger">
          <Icon name="alert" size={17} />
          <span>
            <strong>Your previous submission was not approved.</strong>
            {profile.rejection_reason ? ` ${profile.rejection_reason}` : ''} Please upload a new photo.
          </span>
        </p>
      )}

      <form className="panel" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="verification-photo">Student ID or uniform photo</label>
          <input
            id="verification-photo"
            className="input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => pick(event.target.files?.[0])}
            aria-describedby="verification-hint"
            required
          />
          <span className="hint" id="verification-hint">
            JPEG, PNG or WebP, up to 8 MB. Make sure your name and college are readable.
          </span>
        </div>

        {preview && (
          <div className="photo-grid" style={{ maxWidth: 200, marginBottom: 16 }}>
            <div className="photo-slot">
              <img src={preview} alt="Selected verification photo preview" />
              <button
                type="button"
                className="remove"
                onClick={() => pick(undefined)}
                aria-label="Remove selected photo"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          </div>
        )}

        {error && <FieldError>{error}</FieldError>}

        <div className="row">
          <button type="submit" className="button primary large" disabled={busy || !photo}>
            {busy ? <><Spinner label="Uploading" /> Uploading…</> : <>Submit for review <Icon name="shield" size={17} /></>}
          </button>
          <button type="button" className="button ghost" onClick={() => void signOut(auth)} disabled={busy}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      </form>
    </section>
  );
}

/** Waiting state after evidence has been submitted. */
function PendingReview({ profile }: { profile: Student }) {
  const photoUrl = usePhotoUrl(profile.profile_photos?.[0]);

  return (
    <section className="state-panel" style={{ minHeight: 380 }}>
      <div className="state-icon" aria-hidden="true"><Icon name="clock" size={24} /></div>
      <p className="eyebrow">Review in progress</p>
      <h2>Your verification is pending.</h2>
      <p>
        A campus administrator is reviewing your private photo. This usually takes a few hours,
        and this page updates automatically the moment a decision is made.
      </p>
      {photoUrl && <img src={photoUrl} alt="" style={{ display: 'none' }} />}
      <button type="button" className="button secondary" onClick={() => void signOut(auth)}>
        <Icon name="logout" size={16} /> Sign out
      </button>
    </section>
  );
}

/** Terminal state for suspended or deleted accounts. */
function AccountUnavailable({ profile }: { profile: Student }) {
  const suspended = profile.verification_status === 'suspended';

  return (
    <section className="state-panel" style={{ minHeight: 380 }}>
      <div className="state-icon danger" aria-hidden="true"><Icon name="alert" size={24} /></div>
      <h2>{suspended ? 'Account suspended' : 'Account closed'}</h2>
      <p>
        {suspended
          ? 'Your account has been suspended following a safety review.'
          : 'This account has been deleted and is no longer available.'}
        {suspended && profile.suspension_reason ? ` Reason: ${profile.suspension_reason}.` : ''}
        {' '}If you believe this is a mistake, contact your campus administrator at{' '}
        <a href="mailto:support@campusconnect.app">support@campusconnect.app</a>.
      </p>
      <button type="button" className="button secondary" onClick={() => void signOut(auth)}>
        <Icon name="logout" size={16} /> Sign out
      </button>
    </section>
  );
}

export interface OnboardingProps {
  profile: Student | null;
  onProfileCreated: () => void;
}

/**
 * Routes the pre-approval states: create profile → upload evidence →
 * pending review, plus the terminal suspended/deleted states.
 */
export function Onboarding({ profile, onProfileCreated }: OnboardingProps) {
  if (!profile) return <ProfileForm onDone={onProfileCreated} />;

  if (profile.verification_status === 'suspended' || profile.verification_status === 'deleted') {
    return <AccountUnavailable profile={profile} />;
  }

  if (profile.verification_status === 'pending' && profile.verification_submitted_at) {
    return <PendingReview profile={profile} />;
  }

  return <VerificationForm profile={profile} />;
}
