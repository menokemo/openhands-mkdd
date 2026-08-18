import { useState } from "react";
import { FaBars, FaSun, FaMoon, FaBell, FaBellSlash } from "react-icons/fa6";
import type { Theme } from "../hooks/useTheme";
import {
  isPushSupported,
  getNotificationPermission,
  enablePushNotifications,
} from "../utils/pushNotifications";

type Props = {
  language: "ar" | "en";
  languageLabel: string;
  setLanguage: (language: "ar" | "en") => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onOpenSidebar: () => void;
};

/**
 * The single header used on every screen (Projects, Project Home, Chat) -
 * intentionally identical everywhere, per an explicit product requirement
 * ("الهيدر المفروض يكون ثابت في اي مكان مفيش اي تغير خالص فيه"). Screen-
 * specific navigation (back button, current project/employee name) lives
 * in a separate BreadcrumbBar rendered below this, NOT inside the header
 * itself, so the header truly never changes shape or content.
 *
 * "MKDD" always renders in English regardless of the app language, per
 * the same requirement - only the tagline and the rest of the UI follow
 * the selected language.
 */
export default function AppHeader({
  language,
  languageLabel,
  setLanguage,
  theme,
  setTheme,
  onOpenSidebar,
}: Props) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    getNotificationPermission() === "granted",
  );

  async function handleEnableNotifications() {
    const success = await enablePushNotifications();
    setNotificationsEnabled(success);
  }

  return (
    <header className="app-header">
      <button
        className="app-header-menu"
        onClick={onOpenSidebar}
        aria-label={language === "ar" ? "القائمة" : "Menu"}
      >
        <FaBars />
      </button>

      <div className="app-header-brand">
        <img src="/api/branding/logo" alt="MKDD" />
        <div>
          <span className="app-header-title">MKDD</span>
          <span className="app-header-subtitle">
            {language === "ar" ? "تصميم وتطوير" : "Design & Development"}
          </span>
        </div>
      </div>

      <div className="app-header-actions">
        {isPushSupported() && !notificationsEnabled && (
          <button
            className="app-header-icon-button"
            onClick={handleEnableNotifications}
            aria-label={language === "ar" ? "تفعيل الإشعارات" : "Enable notifications"}
          >
            <FaBellSlash />
          </button>
        )}

        {isPushSupported() && notificationsEnabled && (
          <span
            className="app-header-icon-button app-header-icon-active"
            aria-label={language === "ar" ? "الإشعارات مفعّلة" : "Notifications on"}
          >
            <FaBell />
          </span>
        )}

        <button
          className="app-header-icon-button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={
            theme === "dark"
              ? language === "ar"
                ? "الوضع الفاتح"
                : "Light mode"
              : language === "ar"
                ? "الوضع الداكن"
                : "Dark mode"
          }
        >
          {theme === "dark" ? <FaSun /> : <FaMoon />}
        </button>

        <button
          className="lang-toggle"
          onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
        >
          {languageLabel}
        </button>
      </div>
    </header>
  );
}
