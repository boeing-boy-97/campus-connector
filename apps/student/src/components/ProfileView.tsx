import type { StudentProfile } from './Verification';
import { Avatar } from './Avatar';

interface ProfileViewProps {
  profile: StudentProfile | null;
}

export function ProfileView({ profile }: ProfileViewProps) {
  // Calculate completion percentage
  let completion = 0;
  if (profile) {
    if (profile.full_name) completion += 20;
    if (profile.branch) completion += 20;
    if (profile.bio) completion += 20;
    if (profile.interests && profile.interests.length > 0) completion += 20;
    if (profile.verification_status === 'approved') completion += 20;
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
    </section>
  );
}
