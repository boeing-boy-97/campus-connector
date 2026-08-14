import { usePhotoUrl } from '../lib/usePhotoUrl';
import { initials } from '../lib/format';
import type { StudentPublicProfile } from '../types';

export interface AvatarProps {
  student?: Partial<StudentPublicProfile>;
  size?: 'small' | 'normal' | 'large' | 'xlarge';
  /** Shows an online/verified indicator dot. */
  badge?: boolean;
}

export function Avatar({ student, size = 'normal', badge = false }: AvatarProps) {
  const url = usePhotoUrl(student?.profile_photos?.[0]);
  const name = student?.full_name;

  return (
    <span className={`avatar ${size}`}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      {badge && <span className="avatar-badge" aria-hidden="true" />}
    </span>
  );
}
