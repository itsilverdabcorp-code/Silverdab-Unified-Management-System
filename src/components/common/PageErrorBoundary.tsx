import React from "react";
import PlaceholderPage from "../../app/Modules/PlaceholderPage";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = { hasError: boolean };

export default class PageErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Page render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <PlaceholderPage
          title={this.props.title ?? "Page unavailable"}
          description="This page ran into a problem on mobile. Please try again or use the web app."
        />
      );
    }
    return this.props.children;
  }
}