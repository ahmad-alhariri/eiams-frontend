import { Component, type ErrorInfo, type ReactNode } from 'react'

import { ErrorState } from '@/shared/feedback/error-state'
import { Button } from '@/shared/ui/button'

type ErrorBoundaryFallback =
  ReactNode | ((error: Error, resetErrorBoundary: () => void) => ReactNode)

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ErrorBoundaryFallback
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

type ErrorBoundaryState = {
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  resetErrorBoundary = () => {
    this.setState({ error: null })
  }

  override render() {
    const { children, fallback } = this.props
    const { error } = this.state

    if (!error) {
      return children
    }

    if (typeof fallback === 'function') {
      return fallback(error, this.resetErrorBoundary)
    }

    if (fallback) {
      return fallback
    }

    return (
      <ErrorState
        action={
          <Button type="button" variant="outline" onClick={this.resetErrorBoundary}>
            إعادة المحاولة
          </Button>
        }
      />
    )
  }
}

export { ErrorBoundary, type ErrorBoundaryProps }
