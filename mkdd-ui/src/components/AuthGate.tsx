import { useEffect, useState } from "react";
import { fetchAuthStatus } from "../api/client";
import AuthScreen from "../screens/AuthScreen";
import App from "../App";
import { useLanguage } from "../i18n/useLanguage";

export type CurrentUser = { username: string; avatarUrl: string | null };

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
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetchAuthStatus()
      .then((data) => {
        if (data.setupRequired) setStatus("setup");
        else if (data.loggedIn) {
          setUser({ username: data.username ?? "", avatarUrl: data.avatarUrl });
          setStatus("authenticated");
        } else setStatus("login");
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
        onAuthenticated={(username, avatarUrl) => {
          setUser({ username, avatarUrl });
          setStatus("authenticated");
        }}
      />
    );
  }

  return (
    user && (
      <App
        currentUser={user}
        onAvatarChange={(avatarUrl) => setUser({ ...user, avatarUrl })}
      />
    )
  );
}
