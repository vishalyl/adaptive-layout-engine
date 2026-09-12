// Minimal React error boundary that catches rendering errors in the demo
// area (stage, panels, etc.) and shows a friendly fallback instead of
// the red React error overlay.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class DemoErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  // React's type declarations declare this static method but TS <5.4
  // does not support override on static methods. We silence the
  // "must have override" error here; the method is called by React
  // at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getDerivedStateFromError(error: Error): any {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[Demo Error Boundary]', error, info);
  }

  override render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 'var(--sp-8)',
          textAlign: 'center',
          background: 'var(--ink-900)',
          color: 'var(--text-hi)',
        }}>
          <h2 style={{ marginBottom: 'var(--sp-3)' }}>Something went wrong</h2>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-xs)',
            maxWidth: '480px',
            color: 'var(--text-mid)',
            background: 'var(--ink-800)',
            padding: 'var(--sp-4)',
            borderRadius: 'var(--r-md)',
            wordBreak: 'break-word',
          }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 'var(--sp-4)',
              padding: 'var(--sp-3) var(--sp-5)',
              background: 'var(--accent-surface)',
              color: 'var(--ink-900)',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
