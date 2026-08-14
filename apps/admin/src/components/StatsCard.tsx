import { TrendingDown, TrendingUp, Minus } from 'lucide-react';

export interface StatsCardProps {
  label: string;
  value?: number | string;
  icon: string;
  color: string;
  change?: string;
  /** Controls the colour and glyph of the change line. */
  direction?: 'up' | 'down' | 'flat';
  isLoading?: boolean;
}

/**
 * Metric tile. Previously this component existed but every page inlined its own
 * copy of the markup, so fixes had to be made in several places.
 */
export function StatsCard({
  label,
  value,
  icon,
  color,
  change,
  direction = 'flat',
  isLoading,
}: StatsCardProps) {
  const TrendIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;

  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}26`, color }} aria-hidden="true">
        <span>{icon}</span>
      </div>
      <div className="stat-body">
        {isLoading ? (
          <div className="skeleton" style={{ width: 76, height: 30, borderRadius: 4 }} />
        ) : (
          <div className="stat-value">
            {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
          </div>
        )}
        <div className="stat-label">{label}</div>
        {change && !isLoading && (
          <div className={`stat-change ${direction}`}>
            <TrendIcon size={13} aria-hidden="true" />
            <span>{change}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsCard;
