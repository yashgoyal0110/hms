import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <AlertTriangle size={28} color="var(--warning)" />
        <h2 style={{ marginTop: 10 }}>This page could not be displayed</h2>
        <p className="muted" style={{ marginTop: 6 }}>An unexpected error occurred in Klinvo. Your data has not been affected.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn" onClick={() => window.history.back()}>Go back</button>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }
}
