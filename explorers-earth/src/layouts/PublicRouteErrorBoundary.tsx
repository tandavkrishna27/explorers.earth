import { Component, createRef, Fragment, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  children: ReactNode;
  contentRouteKey: string;
  usernameKey: string;
  shellRevealed: boolean;
  reportTerminal(contentRouteKey: string): void;
};

type State = {
  hasError: boolean;
  retryGeneration: number;
};

export default class PublicRouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retryGeneration: 0 };
  private readonly headingRef = createRef<HTMLHeadingElement>();
  private focusFrame?: number;

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Public route render failed", error, info);
    const caughtRouteKey = this.props.contentRouteKey;
    this.props.reportTerminal(caughtRouteKey);
    this.scheduleFocus();
  }

  componentDidUpdate(previousProps: Props) {
    if (!previousProps.shellRevealed && this.props.shellRevealed && this.state.hasError) {
      this.scheduleFocus();
    }
  }

  componentWillUnmount() {
    if (this.focusFrame !== undefined) cancelAnimationFrame(this.focusFrame);
  }

  private scheduleFocus = () => {
    if (!this.props.shellRevealed || this.focusFrame !== undefined) return;
    this.focusFrame = requestAnimationFrame(() => {
      this.focusFrame = undefined;
      if (this.state.hasError) this.headingRef.current?.focus();
    });
  };

  private retry = () => {
    if (this.focusFrame !== undefined) cancelAnimationFrame(this.focusFrame);
    this.focusFrame = undefined;
    this.setState((state) => ({ hasError: false, retryGeneration: state.retryGeneration + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return <section className="min-h-[50vh] flex flex-col items-center justify-center px-6 py-12 text-center">
        <h1 ref={this.headingRef} tabIndex={-1} className="text-xl font-semibold text-[var(--text-primary)] focus:outline-none">
          This section could not be displayed
        </h1>
        <p className="mt-3 max-w-md text-sm text-[var(--text-secondary)]">
          Try this section again, or return to the public profile.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={this.retry} className="min-h-11 rounded-lg bg-blue-600 px-5 py-2 text-white">
            Retry
          </button>
          <Link to={`/${this.props.usernameKey}`} className="inline-flex min-h-11 items-center rounded-lg border border-current px-5 py-2">
            Profile
          </Link>
        </div>
      </section>;
    }

    return <Fragment key={this.state.retryGeneration}>{this.props.children}</Fragment>;
  }
}
