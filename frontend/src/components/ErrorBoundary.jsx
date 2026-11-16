import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed:", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return (
      <div className="crash">
        <h2>Something broke in the UI</h2>
        <pre>{String(this.state.error?.message || this.state.error)}</pre>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
