import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

/**
 * What happens when something breaks on somebody else's phone.
 *
 * Without this, a thrown error unmounts the whole tree and the passenger gets a
 * white screen — on a train, with no signal, and no way to tell us what they
 * were doing. They close the app and never open it again, and we never find
 * out. That is the single most expensive bug class there is, because it is
 * invisible.
 *
 * So: catch it, say something human, keep the rest of the app reachable, and
 * write the stack somewhere the passenger can copy out and send us. There is no
 * error-reporting service behind this build, which makes the copy button the
 * whole mechanism rather than a nicety.
 */
interface Props { children: ReactNode; }
interface State { error: Error | null; info: string; copied: boolean; }

const LOG_KEY = "st.lasterror.v1";

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "", copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const report = [
      `Shosholoza Trail — error report`,
      `Build:  ${typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown"}`,
      `When:   ${new Date().toISOString()}`,
      `Page:   ${window.location.pathname}${window.location.search}`,
      `Screen: ${window.innerWidth}×${window.innerHeight}`,
      `Agent:  ${navigator.userAgent}`,
      ``,
      `${error.name}: ${error.message}`,
      error.stack ?? "(no stack)",
      ``,
      `Component trace:${info.componentStack ?? " (none)"}`,
    ].join("\n");

    this.setState({ info: report });
    try {
      window.localStorage.setItem(LOG_KEY, report);
    } catch {
      /* if storage is full or blocked, the on-screen copy is still there */
    }
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(this.state.info);
      this.setState({ copied: true });
    } catch {
      /* the details are visible on screen either way */
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="eb">
        <div className="eb__inner">
          <p className="eb__eyebrow">Something went wrong</p>
          <h1 className="eb__title">This screen stopped working.</h1>
          <p className="eb__body">
            Your journey and anything you have downloaded are still saved on this
            phone — nothing was lost. Reloading usually fixes it.
          </p>

          <div className="eb__actions">
            <button type="button" className="eb__reload" onClick={() => window.location.reload()}>
              Reload the app
            </button>
            <a className="eb__home" href="/">Go to the start</a>
          </div>

          <details className="eb__details">
            <summary>Technical details</summary>
            <pre>{this.state.info || String(this.state.error)}</pre>
            <button type="button" className="eb__copy" onClick={this.copy}>
              {this.state.copied ? "Copied" : "Copy these details"}
            </button>
            <p className="eb__ask">
              Sending these to us is the only way we find out this happened.
            </p>
          </details>
        </div>
      </div>
    );
  }
}
