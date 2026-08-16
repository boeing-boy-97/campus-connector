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

      return (
        <div className="error-boundary-fallback">
          <div className="brand-mark">C</div>
          <h2>Something went wrong</h2>
          <p>
            An unexpected error occurred. This has been logged and we're looking into it.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="error-details">{this.state.error.message}</pre>
          )}
          <div className="error-actions">
            <button className="primary" onClick={this.handleReset} style={{ width: 'auto' }}>
              Try again
            </button>
            <button
              className="secondary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
