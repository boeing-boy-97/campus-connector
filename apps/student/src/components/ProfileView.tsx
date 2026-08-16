import { useState } from 'react';
import type { FormEvent } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import type { StudentProfile } from './Verification';
import { Avatar } from './Avatar';

interface ProfileViewProps {
  profile: StudentProfile | null;
  onProfileUpdated?: () => void;
}

export function ProfileView({ profile, onProfileUpdated }: ProfileViewProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Calculate completion percentage
  let completion = 0;
  if (profile) {
    if (profile.full_name) completion += 20;
    if (profile.branch) completion += 20;
    if (profile.bio) completion += 20;
    if (profile.interests && profile.interests.length > 0) completion += 20;
    if (profile.verification_status === 'approved') completion += 20;
  }

  const handleEditSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const interests = String(form.get('interests') || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    setBusy(true);
    setError('');
    try {
      const updateFn = httpsCallable(functions, 'updateProfile');
      await updateFn({
        bio: String(form.get('bio')).trim(),
        branch: String(form.get('branch')).trim(),
        year: Number(form.get('year')),
        interests,
      });
      setEditing(false);
      onProfileUpdated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profile.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you absolutely sure? This action cannot be undone.')) return;
    const reason = prompt('Please tell us why you are leaving (optional):') || '';
    setBusy(true);
    try {
      const deleteFn = httpsCallable(functions, 'deleteAccount');
      await deleteFn({ confirmation: 'DELETE MY ACCOUNT', reason: 'other', feedback: reason });
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete account.');
    } finally {
      setBusy(false);
    }
  };

  if (editing && profile) {
    return (
      <section className="profile-page">
        <div className="section-head">
          <div>
            <p className="eyebrow">EDIT PROFILE</p>
            <h1>Update your profile</h1>
          </div>
          <button className="text-button" onClick={() => setEditing(false)}>
            ← Cancel
          </button>
        </div>

        <form className="profile-form" onSubmit={handleEditSubmit}>
          <label>
            Branch / Course
            <input
              name="branch"
              minLength={2}
              maxLength={100}
              required
              defaultValue={profile.branch}
              placeholder="e.g. Computer Science"
            />
          </label>
          <label>
            Year of study
            <select name="year" defaultValue={String(profile.year || '1')}>
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
              defaultValue={profile.bio}
              placeholder="What are you looking to build, learn, or explore on campus?"
            />
          </label>
          <label>
            Interests
            <input
              name="interests"
              required
              defaultValue={profile.interests?.join(', ')}
              placeholder="Coding, photography, startups (comma separated)"
            />
          </label>

          {error && <p className="form-error-text" role="alert">{error}</p>}

          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'} <span>→</span>
          </button>
        </form>
      </section>
    );
  }

  if (showSettings) {
    return (
      <section className="profile-page">
        <div className="section-head">
          <div>
            <p className="eyebrow">ACCOUNT</p>
            <h1>Settings</h1>
          </div>
          <button className="text-button" onClick={() => setShowSettings(false)}>
            ← Back to profile
          </button>
        </div>

        <div className="profile-block">
          <p className="eyebrow">EMAIL</p>
          <p>{(profile as any)?.college_email || 'Not available'}</p>
        </div>

        <div className="profile-block">
          <p className="eyebrow">COLLEGE</p>
          <p>{(profile as any)?.college_id || 'Not linked'}</p>
        </div>

        <div className="profile-block">
          <p className="eyebrow">ACCOUNT STATUS</p>
          <p>
            <span className="verified">
              {profile?.verification_status === 'approved'
                ? '✓ Verified Student'
                : profile?.verification_status === 'pending'
                  ? '⏳ Verification Pending'
                  : `Status: ${profile?.verification_status}`}
            </span>
          </p>
        </div>

        <div className="profile-block" style={{ borderColor: '#fca5a5' }}>
          <p className="eyebrow" style={{ color: '#b91c1c' }}>DANGER ZONE</p>
          <p style={{ marginBottom: 16 }}>
            Permanently delete your account and all associated data. This action cannot be undone.
            Compliant with DPDP Act 2023.
          </p>
          <button
            className="delete-account-btn"
            onClick={handleDeleteAccount}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-page">
      <div className="profile-hero">
        <Avatar student={profile ?? undefined} size="large" />
        <div>
          <span className="verified">
            {profile?.verification_status === 'approved'
              ? '✓ VERIFIED STUDENT'
              : '⏳ VERIFICATION PENDING'}
          </span>
          <h1>{profile?.full_name || 'Campus Student'}</h1>
          <p>
            {profile?.branch}
            {profile?.year ? ` · Year ${profile.year}` : ''}
          </p>
        </div>
        <div className="profile-hero-actions">
          <button className="secondary" onClick={() => setEditing(true)}>
            Edit profile
          </button>
          <button className="text-button" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
        </div>
      </div>

      <div className="profile-completion-card">
        <div className="completion-header">
          <span>Profile Completion</span>
          <strong>{completion}%</strong>
        </div>
        <div className="completion-bar">
          <div className="completion-fill" style={{ width: `${completion}%` }} />
        </div>
      </div>

      <div className="profile-block">
        <p className="eyebrow">ABOUT</p>
        <p>{profile?.bio || 'Add a bio to help your campus community get to know you.'}</p>
      </div>

      <div className="profile-block">
        <p className="eyebrow">INTERESTS & SKILLS</p>
        <div className="tags">
          {profile?.interests && profile.interests.length > 0 ? (
            profile.interests.map((x) => <span key={x}>{x}</span>)
          ) : (
            <span>No interests added yet</span>
          )}
        </div>
      </div>

      <div className="profile-block">
        <p className="eyebrow">CONNECTION INTENTS</p>
        <div className="tags">
          {(profile as any)?.intent_flags
            ? Object.entries((profile as any).intent_flags)
                .filter(([, v]) => v)
                .map(([k]) => (
                  <span key={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                ))
            : <span>No intents set</span>}
        </div>
      </div>
    </section>
  );
}
