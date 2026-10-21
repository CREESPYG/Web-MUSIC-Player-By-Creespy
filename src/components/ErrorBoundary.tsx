import React from "react";

interface Props {
  children: React.ReactNode;
  /** Shown in the fallback panel + console tag. */
  label: string;
}

interface State {
  error: Error | null;
}

/** Keeps one crashing section from blanking the entire app. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="screen-surface m-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 p-8 text-center">
          <div className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[var(--ink)]">
            {this.props.label} hit an error
          </div>
          <p className="max-w-sm text-xs text-[var(--dim)]">
            {this.state.error.message || "Something went wrong rendering this section."}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-xl bg-[var(--acc0)] px-4 py-2 font-tmono text-[10px] font-bold uppercase tracking-[0.14em] text-black hover:brightness-110"
          >
            try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
