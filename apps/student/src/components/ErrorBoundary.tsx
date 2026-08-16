import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const msg = this.state.error?.message || '';
      const isConfigError =
        msg.includes('Missing Firebase config') || msg.includes('VITE_FIREBASE');

      return (
        <div className="error-boundary-fallback">
          <div className="brand-mark">C</div>
          <h2>{isConfigError ? 'Configuration Error' : 'Something went wrong'}</h2>
          <p>
            {isConfigError
              ? msg
              : 'An unexpected error occurred. This has been logged and we\'re looking into it.'}
          </p>
          {!isConfigError && import.meta.env.DEV && this.state.error && (
            <pre className="error-details">{this.state.error.message}</pre>
          )}
          {isConfigError && (
            <p style={{ maxWidth: 560, fontSize: 14, opacity: 0.85, textAlign: 'center' }}>
              Add the <code>VITE_FIREBASE_*</code> variables in Vercel → Settings → Environment
              Variables and redeploy. See <code>apps/student/README.md</code>.
            </p>
          )}
          <div className="error-actions">
            {!isConfigError && (
              <button className="primary" onClick={this.handleReset} style={{ width: 'auto' }}>
                Try again
              </button>
            )}
            <button className="secondary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
