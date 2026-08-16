import React from 'react';

interface StatsCardProps {
  label: string;
  value?: number | string;
  icon: string;
  color: string;
  change?: string;
  isLoading?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  label,
  value,
  icon,
  color,
  change,
  isLoading,
}) => {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: `${color}20` }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div>
        {isLoading ? (
          <div className="skeleton" style={{ width: 80, height: 32, borderRadius: 4 }} />
        ) : (
          <div className="stat-value">{typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}</div>
        )}
        <div className="stat-label">{label}</div>
        {change && <div className="stat-change up">{change}</div>}
      </div>
    </div>
  );
};
