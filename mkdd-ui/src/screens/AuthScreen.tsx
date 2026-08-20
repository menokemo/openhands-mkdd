import { useState } from "react";
import { setupFirstAccount, login } from "../api/client";

type Props = {
  mode: "setup" | "login";
  language: "ar" | "en";
  onAuthenticated: (username: string, avatarUrl: string | null) => void;
};

/**
 * Full-screen account setup (first run) or login (BUGS_AND_FIXES.md
 * #127). Rendered by AuthGate BEFORE the real app mounts at all - no
 * app data is ever fetched until this resolves successfully.
 */
export default function AuthScreen({ mode, language, onAuthenticated }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t =
    language === "ar"
      ? {
          setupTitle: "إعداد MKDD",
          setupDescription: "أول مرة تستخدم التطبيق؟ اعمل الحساب الرئيسي بتاعك.",
          loginTitle: "تسجيل الدخول",
          loginDescription: "سجّل دخولك عشان تكمل شغلك.",
          username: "اسم المستخدم",
          password: "كلمة السر",
          confirmPassword: "تأكيد كلمة السر",
          setupButton: "إنشاء الحساب",
          loginButton: "دخول",
          passwordMismatch: "كلمتا السر مش متطابقتين",
          usernameTaken: "اسم المستخدم ده مستخدَم بالفعل",
          passwordTooShort: "كلمة السر لازم تكون 8 حروف على الأقل",
          invalidCredentials: "اسم المستخدم أو كلمة السر غلط",
          genericError: "حصل خطأ، حاول تاني",
        }
      : {
          setupTitle: "Set up MKDD",
          setupDescription: "First time using the app? Create your main account.",
          loginTitle: "Login",
          loginDescription: "Log in to continue your work.",
          username: "Username",
          password: "Password",
          confirmPassword: "Confirm password",
          setupButton: "Create account",
          loginButton: "Login",
          passwordMismatch: "Passwords don't match",
          usernameTaken: "This username is already taken",
          passwordTooShort: "Password must be at least 8 characters",
          invalidCredentials: "Incorrect username or password",
          genericError: "Something went wrong, try again",
        };

  function errorMessage(code: string): string {
    if (code === "username_taken") return t.usernameTaken;
    if (code === "password_too_short") return t.passwordTooShort;
    if (code === "invalid_credentials") return t.invalidCredentials;
    return t.genericError;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "setup" && password !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === "setup"
          ? await setupFirstAccount(username, password)
          : await login(username, password);
      onAuthenticated(result.username, result.avatarUrl);
    } catch (err) {
      setError(errorMessage(err instanceof Error ? err.message : ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen" dir={language === "ar" ? "rtl" : "ltr"}>
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/api/branding/logo" alt="MKDD" className="auth-logo" />
        <h1>{mode === "setup" ? t.setupTitle : t.loginTitle}</h1>
        <p className="auth-description">
          {mode === "setup" ? t.setupDescription : t.loginDescription}
        </p>

        {error && <p className="modal-error">{error}</p>}

        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t.username}
          autoComplete="username"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.password}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          required
        />
        {mode === "setup" && (
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t.confirmPassword}
            autoComplete="new-password"
            required
          />
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "…" : mode === "setup" ? t.setupButton : t.loginButton}
        </button>
      </form>
    </div>
  );
}
