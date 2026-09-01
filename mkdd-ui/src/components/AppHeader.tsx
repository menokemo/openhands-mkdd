import { useState } from "react";
import {
  FaBars,
  FaSun,
  FaMoon,
  FaBell,
  FaBellSlash,
  FaCheck,
  FaWhatsapp,
  FaTelegram,
} from "react-icons/fa6";
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
  // BUGS_AND_FIXES.md #198: 4 themes now, so the old simple dark/light
  // toggle became a small selector menu instead.
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

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

        <div className="theme-selector">
          <button
            className="app-header-icon-button"
            onClick={() => setIsThemeMenuOpen((open) => !open)}
            aria-label={language === "ar" ? "اختيار الثيم" : "Choose theme"}
          >
            {theme === "light" ? (
              <FaSun />
            ) : theme === "dark" ? (
              <FaMoon />
            ) : theme === "whatsapp" ? (
              <FaWhatsapp />
            ) : (
              <FaTelegram />
            )}
          </button>

          {isThemeMenuOpen && (
            <>
              <div
                className="theme-selector-backdrop"
                onClick={() => setIsThemeMenuOpen(false)}
              />
              <div className="theme-selector-menu">
                {[
                  { value: "dark" as const, icon: <FaMoon />, ar: "داكن", en: "Dark" },
                  { value: "light" as const, icon: <FaSun />, ar: "فاتح", en: "Light" },
                  {
                    value: "whatsapp" as const,
                    icon: <FaWhatsapp />,
                    ar: "واتساب",
                    en: "WhatsApp",
                  },
                  {
                    value: "telegram" as const,
                    icon: <FaTelegram />,
                    ar: "تيليجرام",
                    en: "Telegram",
                  },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="theme-selector-option"
                    onClick={() => {
                      setTheme(option.value);
                      setIsThemeMenuOpen(false);
                    }}
                  >
                    {option.icon}
                    <span>{language === "ar" ? option.ar : option.en}</span>
                    {theme === option.value && (
                      <FaCheck className="theme-selector-check" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

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
