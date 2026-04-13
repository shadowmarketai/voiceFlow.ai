import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-danger-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-danger-500" />
        </div>
        <h2 className="text-lg font-display font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-6 max-w-md">
          {this.state.error?.message || 'An unexpected error occurred. Please try refreshing.'}
        </p>
        <button
          className="btn btn-primary"
          onClick={() => this.setState({ hasError: false, error: null })}
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    )
  }
}
