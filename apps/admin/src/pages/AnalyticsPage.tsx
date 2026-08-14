export default function AnalyticsPage() {
  return (
    <div className="page">
      <div className="admin-header">
        <h1>Analytics</h1>
        <span className="badge badge-info">Live Data</span>
      </div>
      <div style={{ padding: 24 }}>
        <div className="card" style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📊</div>
          <h2 style={{ marginBottom: 8 }}>Analytics Dashboard</h2>
          <p className="text-muted">
            Charts for signups, matches, verifications, and engagement metrics will appear here.
            Uses Recharts connected to Firestore aggregations.
          </p>
        </div>
      </div>
    </div>
  );
}
