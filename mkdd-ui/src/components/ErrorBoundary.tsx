import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  language: "ar" | "en";
};

type State = {
  error: Error | null;
};

/**
 * Catches rendering errors that would otherwise silently blank the
 * entire screen with zero visible trace (BUGS_AND_FIXES.md #178) -
 * discovered while diagnosing a real incident where a conversation
 * appeared completely empty despite the backend being confirmed
 * healthy (35 real events returned successfully via direct testing).
 * No error boundary existed anywhere in the app before this, so any
 * exception during rendering (a malformed event shape, an unexpected
 * null, etc.) had no visible symptom at all - a serious stability gap
 * beyond this one incident, per README's Data Stability Principle.
 *
 * Deliberately shows the real error message and stack (not a generic
 * "something went wrong") - this is a diagnostic tool for a small
 * internal team, not a consumer product hiding technical details.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console -- deliberate: this is the
    // only trace of an otherwise-silent crash.
    console.error("MKDD rendering error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const { language } = this.props;
      return (
        <div className="error-boundary-screen" dir={language === "ar" ? "rtl" : "ltr"}>
          <h2>{language === "ar" ? "حصل خطأ في العرض" : "A rendering error occurred"}</h2>
          <p>
            {language === "ar"
              ? "الشاشة كانت هتفضل فاضية بدون أي تفسير - النص ده بيوضح السبب الحقيقي."
              : "The screen would have stayed blank with no explanation - this shows the real cause."}
          </p>
          <pre className="error-boundary-detail">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
          <button type="button" onClick={() => window.location.reload()}>
            {language === "ar" ? "أعِد تحميل الصفحة" : "Reload the page"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
