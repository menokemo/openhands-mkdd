import { useEffect, useState } from "react";
import { fetchAuthStatus } from "../api/client";
import AuthScreen from "../screens/AuthScreen";
import App from "../App";
import { useLanguage } from "../i18n/useLanguage";

/**
 * BUGS_AND_FIXES.md #127: gates the entire app behind authentication.
 * Deliberately a separate component wrapping <App />, not logic
 * inside App itself - App already has many hooks that start fetching
 * data immediately on mount, and conditionally skipping them based on
 * auth state would violate the Rules of Hooks. This way, App's hooks
 * simply never run at all until authentication is confirmed.
 */
export default function AuthGate() {
  const { language } = useLanguage();
  const [status, setStatus] = useState<"loading" | "setup" | "login" | "authenticated">(
    "loading",
  );

  useEffect(() => {
    fetchAuthStatus()
      .then((data) => {
        if (data.setupRequired) setStatus("setup");
        else if (data.loggedIn) setStatus("authenticated");
        else setStatus("login");
      })
      .catch(() => setStatus("login"));
  }, []);

  if (status === "loading") {
    return <div className="auth-loading" />;
  }

  if (status === "setup" || status === "login") {
    return (
      <AuthScreen
        mode={status}
        language={language}
        onAuthenticated={() => setStatus("authenticated")}
      />
    );
  }

  return <App />;
}
