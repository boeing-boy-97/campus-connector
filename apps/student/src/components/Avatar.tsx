import type { StudentProfile } from './Verification';

interface AvatarProps {
  student?: Partial<StudentProfile>;
  size?: 'small' | 'normal' | 'large';
}

export function Avatar({ student, size = 'normal' }: AvatarProps) {
  const photo = student?.profile_photos?.[0];
  const initial = student?.full_name?.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <div className={`avatar ${size}`}>
      {photo ? (
        <img src={photo} alt={student?.full_name || 'Student avatar'} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
