import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle size={56} strokeWidth={1.2} className="text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-neutral-700">
            Une erreur inattendue s'est produite
          </h3>
          <p className="mt-3 max-w-[420px] text-[15px] leading-relaxed text-neutral-500">
            L'application a rencontré un problème. Vous pouvez recharger la page ou revenir au tableau de bord.
          </p>
          {this.state.error && (
            <pre className="mt-4 max-w-[500px] truncate rounded-lg bg-neutral-50 px-4 py-2 text-xs text-neutral-400">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-8 flex gap-3">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700"
            >
              <RefreshCw size={16} />
              Recharger la page
            </button>
            <button
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Home size={16} />
              Tableau de bord
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
