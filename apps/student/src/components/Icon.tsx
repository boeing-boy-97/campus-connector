/**
 * Inline SVG icon set.
 *
 * The previous UI used decorative Unicode glyphs (⌕ ♧ ◌ ◉ ♢ ＋) as navigation
 * icons. Those render inconsistently or not at all depending on the platform
 * font, so they are replaced with real vector icons that also scale with
 * `currentColor` and carry proper accessibility semantics.
 */

export type IconName =
  | 'discover'
  | 'connections'
  | 'inbox'
  | 'profile'
  | 'bell'
  | 'send'
  | 'attach'
  | 'back'
  | 'close'
  | 'check'
  | 'refresh'
  | 'filter'
  | 'search'
  | 'shield'
  | 'clock'
  | 'alert'
  | 'trash'
  | 'block'
  | 'flag'
  | 'logout'
  | 'camera'
  | 'settings'
  | 'chevronDown'
  | 'spark'
  | 'menu';

const PATHS: Record<IconName, React.ReactNode> = {
  discover: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  connections: (
    <>
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </>
  ),
  inbox: (
    <>
      <path d="M21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6" />
      <path d="M3 12l2.5-7A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1L21 12h-5l-1 2H9l-1-2H3Z" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10.5 20a2 2 0 0 0 3 0" />
    </>
  ),
  send: <path d="M4 12 20 4l-7 16-2.5-6.5L4 12Z" />,
  attach: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  back: <path d="M15 19l-7-7 7-7" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v5h-5" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6l8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  block: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </>
  ),
  flag: (
    <>
      <path d="M5 21V4" />
      <path d="M5 5h11l-1.5 4L16 13H5" />
    </>
  ),
  logout: (
    <>
      <path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H10" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.5M12 18.5V21M4.9 7.5l2.2 1.3M16.9 15.2l2.2 1.3M4.9 16.5l2.2-1.3M16.9 8.8l2.2-1.3" />
    </>
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  spark: (
    <>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      <path d="m6.4 6.4 3 3M14.6 14.6l3 3M6.4 17.6l3-3M14.6 9.4l3-3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  /** Accessible label. Omit for purely decorative icons. */
  label?: string;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, label, className, strokeWidth = 1.7 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {label && <title>{label}</title>}
      {PATHS[name]}
    </svg>
  );
}
