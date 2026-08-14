/**
 * Avatar with a real inline fallback.
 *
 * Pages previously pointed at `/avatar-placeholder.png`, but the admin app has
 * no `public/` directory — every user without a photo rendered a broken image.
 */
export interface AvatarProps {
  name?: string;
  src?: string | null;
  size?: number;
}

function initials(name?: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic hue from the name, so an avatar keeps its colour across views. */
function hueFor(name?: string): number {
  const source = name ?? '';
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 360;
  }
  return hash;
}

export function Avatar({ name, src, size = 36 }: AvatarProps) {
  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }

  const hue = hueFor(name);
  return (
    <span
      className="avatar avatar-fallback"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `hsl(${hue} 40% 26%)`,
        color: `hsl(${hue} 70% 84%)`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export default Avatar;
