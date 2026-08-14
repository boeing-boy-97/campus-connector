import { useEffect, useRef, useState, type FormEvent } from 'react';
import { signOut } from 'firebase/auth';
import { ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../services/firebase';
import { api, clearProfileCache, errorMessage } from '../services/api';
import { Avatar } from '../components/Avatar';
import { usePhotoUrl } from '../lib/usePhotoUrl';
import { Icon } from '../components/Icon';
import { EmptyState, FieldError, Spinner } from '../components/states';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToast } from '../lib/toast';
import { IntentPicker } from '../components/IntentPicker';
import { describeStudent, formatBytes, formatDate } from '../lib/format';
import {
  DELETION_REASONS,
  MATCH_TYPE_LABELS,
  type BlockedUser,
  type CollegeBranding,
  type IntentFlags,
  type MatchType,
  type Student,
} from '../types';

const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** A single photo tile in the gallery editor. */
function PhotoTile({
  path,
  index,
  onRemove,
  disabled,
}: {
  path: string;
  index: number;
  onRemove: () => void;
  disabled: boolean;
}) {
  const url = usePhotoUrl(path);

  return (
    <div className={`photo-slot${index === 0 ? ' is-primary' : ''}`}>
      {url ? (
        <img src={url} alt={`Profile photo ${index + 1}`} />
      ) : (
        <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <Spinner size={16} label="Loading photo" />
        </span>
      )}
      <button
        type="button"
        className="remove"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove photo ${index + 1}`}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}

/** Gallery editor: upload to Storage, then commit the ordered path list. */
function PhotoManager({ profile }: { profile: Student }) {
  const toast = useToast();
  const [paths, setPaths] = useState<string[]>(profile.profile_photos ?? []);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in sync when the realtime profile listener delivers a change.
  useEffect(() => {
    setPaths(profile.profile_photos ?? []);
  }, [profile.profile_photos]);

  const commit = async (next: string[]) => {
    setBusy(true);
    setError('');
    try {
      const result = await api.updateProfilePhotos(next);
      setPaths(result.profile_photos);
      toast.success('Photos updated.');
    } catch (caught) {
      setError(errorMessage(caught, 'We could not update your photos.'));
      setPaths(profile.profile_photos ?? []);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !auth.currentUser) return;
    const selected = [...files];

    if (paths.length + selected.length > MAX_PHOTOS) {
      setError(`You can have up to ${MAX_PHOTOS} photos. Remove one first.`);
      return;
    }

    for (const file of selected) {
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        setError(`“${file.name}” is not a JPEG, PNG or WebP image.`);
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError(`“${file.name}” is ${formatBytes(file.size)}. Each photo must be under 8 MB.`);
        return;
      }
    }

    setBusy(true);
    setError('');

    try {
      const uploaded: string[] = [];
      for (const [index, file] of selected.entries()) {
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `profile_photos/${auth.currentUser.uid}/${crypto.randomUUID()}.${extension}`;
        // `ownerId` metadata is required by the Storage rules and re-checked
        // server-side before the path is accepted into the profile.
        await uploadBytes(ref(storage, path), file, {
          contentType: file.type,
          customMetadata: { ownerId: auth.currentUser.uid },
        });
        uploaded.push(path);
        setProgress(Math.round(((index + 1) / selected.length) * 100));
      }
      await commit([...paths, ...uploaded]);
    } catch (caught) {
      setError(errorMessage(caught, 'We could not upload those photos.'));
      setBusy(false);
      setProgress(0);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Photos</h2>
        <span className="meta">{paths.length}/{MAX_PHOTOS}</span>
      </div>
      <p className="hint" style={{ marginBottom: 14 }}>
        The first photo is your main profile picture. Only verified students from your
        college can see these.
      </p>

      <div className="photo-grid">
        {paths.map((path, index) => (
          <PhotoTile
            key={path}
            path={path}
            index={index}
            disabled={busy}
            onRemove={() => void commit(paths.filter((item) => item !== path))}
          />
        ))}

        {paths.length < MAX_PHOTOS && (
          <label className="photo-add">
            {busy ? <Spinner size={18} label="Uploading" /> : <Icon name="camera" size={22} />}
            <span>{busy ? 'Uploading…' : 'Add photo'}</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(event) => void upload(event.target.files)}
            />
          </label>
        )}
      </div>

      {busy && progress > 0 && (
        <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/** Blocked-account list with the ability to unblock. */
function SafetyPanel() {
  const toast = useToast();
  const [items, setItems] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setError('');
    void api.getBlockedUsers()
      .then((result) => setItems(result.items))
      .catch((caught) => setError(errorMessage(caught, 'We could not load your blocked list.')));
  };

  useEffect(load, []);

  const unblock = async (blockedId: string, name: string) => {
    setBusyId(blockedId);
    try {
      await api.unblockUser(blockedId);
      setItems((current) => current?.filter((item) => item.blocked_id !== blockedId) ?? null);
      toast.success(`${name} has been unblocked.`);
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not unblock that student.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Blocked accounts</h2>
        {items && items.length > 0 && <span className="meta">{items.length}</span>}
      </div>

      {error && (
        <>
          <FieldError>{error}</FieldError>
          <button type="button" className="button secondary small" onClick={load}>
            <Icon name="refresh" size={15} /> Try again
          </button>
        </>
      )}

      {!error && items === null && <p className="muted"><Spinner size={14} /> Loading…</p>}

      {!error && items?.length === 0 && (
        <p className="muted">
          You have not blocked anyone. Blocking someone unmatches you and hides you from each other.
        </p>
      )}

      {!error && items && items.length > 0 && (
        <ul className="stack" style={{ gap: 10 }}>
          {items.map((item) => (
            <li className="row" key={item.blocked_id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{item.full_name}</strong>
                <p className="meta">Blocked {item.created_at ? formatDate(item.created_at) : 'recently'}</p>
              </div>
              <button
                type="button"
                className="button secondary small"
                onClick={() => void unblock(item.blocked_id, item.full_name)}
                disabled={busyId === item.blocked_id}
              >
                {busyId === item.blocked_id ? 'Unblocking…' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ProfileProps {
  profile: Student;
  branding: CollegeBranding | null;
}

export function Profile({ profile, branding }: ProfileProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [intents, setIntents] = useState<IntentFlags>(
    () => profile.intent_flags ?? {
      dating: false, friendship: true, study: false, hackathon: false, project: false,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (profile.intent_flags) setIntents(profile.intent_flags);
  }, [profile.intent_flags]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const bio = String(form.get('bio') ?? '').trim();
    const branch = String(form.get('branch') ?? '').trim();
    const interests = String(form.get('interests') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const linkedin = String(form.get('linkedin_url') ?? '').trim();
    const github = String(form.get('github_url') ?? '').trim();

    const errors: Record<string, string> = {};
    if (bio.length < 10) errors.bio = 'Your bio needs at least 10 characters.';
    if (bio.length > 500) errors.bio = 'Keep your bio under 500 characters.';
    if (branch.length < 2) errors.branch = 'Enter your branch or course.';
    if (interests.length === 0) errors.interests = 'Add at least one interest.';
    if (interests.length > 15) errors.interests = 'Add up to 15 interests.';
    if (!Object.values(intents).some(Boolean)) errors.intent = 'Keep at least one connection type enabled.';
    if (linkedin && !/^https:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(linkedin)) {
      errors.linkedin_url = 'Enter a full https://www.linkedin.com/… link, or leave it blank.';
    }
    if (github && !/^https:\/\/([a-z0-9-]+\.)*github\.com\//i.test(github)) {
      errors.github_url = 'Enter a full https://github.com/… link, or leave it blank.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError('');

    try {
      await api.updateProfile({
        bio,
        branch,
        year: Number(form.get('year')),
        interests,
        intent_flags: intents,
        linkedin_url: linkedin,
        github_url: github,
      });
      setEditing(false);
      toast.success('Profile updated.');
    } catch (caught) {
      setError(errorMessage(caught, 'We could not update your profile.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setBusy(true);
    try {
      await api.deleteAccount(
        String(form.get('reason') ?? '') || undefined,
        String(form.get('feedback') ?? '').trim() || undefined,
      );
      clearProfileCache();
      await signOut(auth);
    } catch (caught) {
      toast.error(errorMessage(caught, 'We could not delete your account.'));
      setBusy(false);
    }
  };

  const activeIntents = (Object.keys(intents) as MatchType[]).filter((key) => intents[key]);

  return (
    <section>
      <header className="page-head">
        <p className="eyebrow">Your account</p>
        <h1 className="display">Profile</h1>
      </header>

      <div className="profile-hero">
        <Avatar student={profile} size="xlarge" badge />
        <div className="profile-hero-copy">
          <span className="verified-tag"><Icon name="shield" size={12} /> Verified student</span>
          <h1>{profile.full_name}</h1>
          <p>{describeStudent(profile.branch, profile.year)}</p>
          {branding && <p className="meta" style={{ marginTop: 4 }}>{branding.name}</p>}
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => { setEditing((value) => !value); setError(''); setFieldErrors({}); }}
        >
          <Icon name={editing ? 'close' : 'settings'} size={16} />
          {editing ? 'Cancel' : 'Edit profile'}
        </button>
      </div>

      {editing ? (
        <form className="panel" onSubmit={save} noValidate>
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="edit-branch">Branch or course</label>
              <input
                id="edit-branch" name="branch" className="input"
                defaultValue={profile.branch} maxLength={100}
                aria-invalid={fieldErrors.branch ? 'true' : undefined}
                required
              />
              {fieldErrors.branch && <FieldError>{fieldErrors.branch}</FieldError>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="edit-year">Year of study</label>
              <select id="edit-year" name="year" className="select" defaultValue={profile.year ?? 1}>
                {[1, 2, 3, 4, 5, 6].map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>
            </div>

            <div className="field span-2">
              <label className="field-label" htmlFor="edit-bio">About you</label>
              <textarea
                id="edit-bio" name="bio" className="textarea"
                defaultValue={profile.bio} maxLength={500}
                aria-invalid={fieldErrors.bio ? 'true' : undefined}
                required
              />
              {fieldErrors.bio && <FieldError>{fieldErrors.bio}</FieldError>}
            </div>

            <div className="field span-2">
              <label className="field-label" htmlFor="edit-interests">Interests</label>
              <input
                id="edit-interests" name="interests" className="input"
                defaultValue={profile.interests?.join(', ')}
                aria-invalid={fieldErrors.interests ? 'true' : undefined}
                aria-describedby="edit-interests-hint"
                required
              />
              <span className="hint" id="edit-interests-hint">Separate with commas. Up to 15.</span>
              {fieldErrors.interests && <FieldError>{fieldErrors.interests}</FieldError>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="edit-linkedin">LinkedIn (optional)</label>
              <input
                id="edit-linkedin" name="linkedin_url" className="input" type="url"
                defaultValue={profile.linkedin_url}
                placeholder="https://www.linkedin.com/in/you"
                aria-invalid={fieldErrors.linkedin_url ? 'true' : undefined}
              />
              {fieldErrors.linkedin_url && <FieldError>{fieldErrors.linkedin_url}</FieldError>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="edit-github">GitHub (optional)</label>
              <input
                id="edit-github" name="github_url" className="input" type="url"
                defaultValue={profile.github_url}
                placeholder="https://github.com/you"
                aria-invalid={fieldErrors.github_url ? 'true' : undefined}
              />
              {fieldErrors.github_url && <FieldError>{fieldErrors.github_url}</FieldError>}
            </div>

            <IntentPicker
              value={intents}
              onChange={setIntents}
              legend="Connection types"
              hint="You only appear in Discover for people who enabled the same type."
            />
          </div>

          {error && <FieldError>{error}</FieldError>}

          <div className="row">
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? <><Spinner label="Saving" /> Saving…</> : <><Icon name="check" size={16} /> Save changes</>}
            </button>
            <button type="button" className="button ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="panel">
            <div className="panel-head"><h2>About</h2></div>
            <p className="lede">
              {profile.bio || 'Add a bio so your campus community can get to know you.'}
            </p>
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Interests</h2></div>
            {profile.interests?.length ? (
              <div className="tags">
                {profile.interests.map((item) => <span className="tag" key={item}>{item}</span>)}
              </div>
            ) : (
              <p className="muted">No interests added yet.</p>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Open to</h2></div>
            {activeIntents.length > 0 ? (
              <div className="tags">
                {activeIntents.map((type) => (
                  <span className="tag accent" key={type}>{MATCH_TYPE_LABELS[type]}</span>
                ))}
              </div>
            ) : (
              <p className="muted">No connection types enabled — you will not appear in Discover.</p>
            )}
          </div>

          {(profile.linkedin_url || profile.github_url) && (
            <div className="panel">
              <div className="panel-head"><h2>Links</h2></div>
              <div className="row">
                {profile.linkedin_url && (
                  <a className="button secondary small" href={profile.linkedin_url} target="_blank" rel="noreferrer noopener">
                    LinkedIn
                  </a>
                )}
                {profile.github_url && (
                  <a className="button secondary small" href={profile.github_url} target="_blank" rel="noreferrer noopener">
                    GitHub
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h2>Account details</h2></div>
            <dl className="detail-list">
              <div>
                <dt>College e-mail</dt>
                <dd>{profile.college_email ?? '—'}</dd>
              </div>
              <div>
                <dt>College</dt>
                <dd>{branding?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Verified on</dt>
                <dd>{profile.verified_at ? formatDate(profile.verified_at) : '—'}</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{profile.created_at ? formatDate(profile.created_at) : '—'}</dd>
              </div>
            </dl>
          </div>

          <PhotoManager profile={profile} />
          <SafetyPanel />

          <div className="panel">
            <div className="panel-head"><h2>Session</h2></div>
            <div className="row">
              <button type="button" className="button secondary" onClick={() => setSignOutOpen(true)}>
                <Icon name="logout" size={16} /> Sign out
              </button>
            </div>
          </div>

          <div className="panel" style={{ borderColor: 'rgb(163 43 43 / 30%)' }}>
            <div className="panel-head"><h2 className="danger-text">Delete account</h2></div>
            <p className="muted" style={{ marginBottom: 14 }}>
              Deleting your account anonymises your profile, ends every connection and
              signs you out permanently. This cannot be undone.
            </p>
            <button type="button" className="button danger" onClick={() => setDeleteOpen(true)}>
              <Icon name="trash" size={16} /> Delete my account
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You will need your college e-mail and a new verification code to sign back in."
        confirmLabel="Sign out"
        busy={busy}
        onConfirm={() => { clearProfileCache(); void signOut(auth); }}
        onCancel={() => setSignOutOpen(false)}
      />

      <Modal
        open={deleteOpen}
        title="Delete your account"
        description="This permanently anonymises your profile and ends all your connections."
        busy={busy}
        onClose={() => { setDeleteOpen(false); setConfirmText(''); }}
      >
        <form onSubmit={deleteAccount}>
          <p className="banner danger">
            <Icon name="alert" size={17} />
            <span>Your name, bio, photos and messages history become unrecoverable.</span>
          </p>

          <div className="field">
            <label className="field-label" htmlFor="delete-reason">Why are you leaving? (optional)</label>
            <select id="delete-reason" name="reason" className="select" defaultValue="">
              <option value="">Prefer not to say</option>
              {DELETION_REASONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="delete-feedback">Anything we could do better? (optional)</label>
            <textarea id="delete-feedback" name="feedback" className="textarea" maxLength={500} />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="delete-confirm">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id="delete-confirm"
              className="input"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              placeholder="DELETE"
            />
          </div>

          <div className="row">
            <button type="submit" className="button danger" disabled={busy || confirmText.trim() !== 'DELETE'}>
              {busy ? <><Spinner label="Deleting" /> Deleting…</> : 'Permanently delete my account'}
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => { setDeleteOpen(false); setConfirmText(''); }}
              disabled={busy}
            >
              Keep my account
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

/** Fallback for an unknown route inside the app shell. */
export function NotFound() {
  return (
    <EmptyState
      icon="alert"
      title="Page not found"
      description="That page does not exist. It may have moved, or the link may be out of date."
      action={<a className="button secondary" href="/discover"><Icon name="discover" size={16} /> Back to Discover</a>}
      compact={false}
    />
  );
}
