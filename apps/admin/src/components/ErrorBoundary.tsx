import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary so a render-time exception cannot leave an
 * administrator on a blank page mid-moderation.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Browser error channel only — no user data, just the component stack.
    console.error('Unhandled admin UI error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  private reload = () => window.location.assign('/admin/');

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="full-center">
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ marginBottom: 10 }}>Something went wrong</h2>
          <p className="text-muted" style={{ lineHeight: 1.6, marginBottom: 16 }}>
            The admin panel hit an unexpected problem. No data was lost — you can retry
            or return to the dashboard.
          </p>

          {import.meta.env.DEV && (
            <pre className="error-detail">{error.message}</pre>
          )}

          <div className="action-row">
            <button type="button" className="btn btn-primary" onClick={this.reset}>
              Try again
            </button>
            <button type="button" className="btn btn-outline" onClick={this.reload}>
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
