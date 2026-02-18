import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass panel">
          <h3>Something went wrong</h3>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
