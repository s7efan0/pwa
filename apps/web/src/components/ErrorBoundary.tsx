import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Without this, any render-time throw unmounts the whole tree and leaves a
 * blank white page with no way back. React has no hook equivalent — an error
 * boundary must be a class.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground text-sm">
          The page failed to render. Reloading usually fixes it.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
        {/* Details stay collapsed: useful when marking, not shouted at users. */}
        <details className="w-full text-left">
          <summary className="text-muted-foreground cursor-pointer text-xs">
            Technical details
          </summary>
          <pre className="text-muted-foreground mt-2 overflow-x-auto text-xs">
            {error.message}
          </pre>
        </details>
      </div>
    );
  }
}
