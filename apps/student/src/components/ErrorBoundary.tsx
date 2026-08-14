import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary.
 *
 * Without one, any render-time exception unmounts the whole tree and leaves the
 * user staring at a blank white page. This shows a recoverable message and, in
 * development only, the underlying error — production users never see a stack
 * trace or internal detail.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept as console.error deliberately: this is the browser's error channel and
    // the only place an unexpected render failure can be observed in production.
    // No user data is included — just the component stack.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private reload = () => {
    window.location.assign('/');
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="config-screen">
        <section className="config-card">
          <h1>Something went wrong</h1>
          <p>
            The page ran into an unexpected problem. Your data is safe — you can retry,
            or return to the home screen.
          </p>

          {import.meta.env.DEV && (
            <code>{error.message}</code>
          )}

          <div className="row" style={{ marginTop: 18 }}>
            <button type="button" className="button primary" onClick={this.reset}>
              Try again
            </button>
            <button type="button" className="button secondary" onClick={this.reload}>
              Go to home
            </button>
          </div>
        </section>
      </main>
    );
  }
}
