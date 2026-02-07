"use client";

import * as React from "react";

import { isFunction } from "@simplex/shared";

interface ErrorBoundaryState {
  didCatch: boolean;
  error: unknown;
}

export interface ErrorBoundaryFallbackRender {
  (error: unknown, reset: () => void): React.ReactNode;
}

export interface ErrorBoundaryProps {
  children?: React.ReactNode;
  fallback?: React.ReactNode | ErrorBoundaryFallbackRender;
  onError?(error: unknown, errorInfo: React.ErrorInfo): void;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = { didCatch: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { didCatch: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ didCatch: false, error: null });
  };

  render() {
    const { didCatch, error } = this.state;
    const { children, fallback } = this.props;

    if (didCatch) {
      if (isFunction(fallback)) {
        return fallback(error, this.reset);
      }

      return fallback;
    }

    return children;
  }
}
