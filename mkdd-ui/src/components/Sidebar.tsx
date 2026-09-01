import { useState } from "react";
import {
  FaFolderOpen,
  FaHourglassHalf,
  FaCircleCheck,
  FaUsers,
  FaGear,
  FaHeartPulse,
  FaXmark,
  FaChevronLeft,
  FaChevronRight,
  FaRightFromBracket,
  FaSun,
  FaMoon,
  FaBell,
  FaBellSlash,
  FaPalette,
  FaWhatsapp,
  FaTelegram,
  FaCheck,
} from "react-icons/fa6";
import RestartModal from "./RestartModal";
import SystemHealthModal from "./SystemHealthModal";
import OwnerAvatarUpload from "./OwnerAvatarUpload";
import type { CurrentUser } from "./AuthGate";
import type { ThemeStyle, ThemeMode } from "../hooks/useTheme";
import { isLocalAccess } from "../utils/isLocalAccess";
import { logout } from "../api/client";
import {
  isPushSupported,
  getNotificationPermission,
  enablePushNotifications,
} from "../utils/pushNotifications";

type SidebarMenuKey = "active" | "nearCompletion" | "completed" | "employees";

type Props = {
  open: boolean;
  language: "ar" | "en";
  languageLabel: string;
  setLanguage: (language: "ar" | "en") => void;
  themeStyle: ThemeStyle;
  setThemeStyle: (style: ThemeStyle) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  onClose: () => void;
  onSelect: (key: SidebarMenuKey) => void;
  currentUser: CurrentUser;
  onAvatarChange: (avatarUrl: string | null) => void;
};

const MENU_ITEMS: {
  key: SidebarMenuKey;
  icon: React.ReactNode;
  ar: string;
  en: string;
}[] = [
  {
    key: "active",
    icon: <FaFolderOpen />,
    ar: "المشاريع الحالية",
    en: "Active Projects",
  },
  {
    key: "nearCompletion",
    icon: <FaHourglassHalf />,
    ar: "قربت تخلص",
    en: "Near Completion",
  },
  { key: "completed", icon: <FaCircleCheck />, ar: "خلصت", en: "Completed" },
  { key: "employees", icon: <FaUsers />, ar: "الموظفين", en: "Employees" },
];

/**
 * The sidebar is navigation ONLY - a menu of buttons, per explicit
 * correction from the user ("مش مطلوب هو نفسه يعرض البيانات"). Each item
 * opens a separate popup (see App.tsx's activeSidebarMenu state +
 * ProjectListModal/EmployeeListModal) that holds the actual data - the
 * sidebar itself never renders project or employee lists directly.
 *
 * Settings (BUGS_AND_FIXES.md #111 - moved here from AppHeader per
 * explicit request) is the one exception: its modal is fully self-
 * contained and doesn't need App.tsx-level coordination, so it manages
 * its own open/close state locally rather than going through onSelect.
 */
export default function Sidebar({
  open,
  language,
  languageLabel,
  setLanguage,
  themeStyle,
  setThemeStyle,
  themeMode,
  setThemeMode,
  onClose,
  onSelect,
  currentUser,
  onAvatarChange,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  // BUGS_AND_FIXES.md #203: moved here from AppHeader, along with the
  // theme style/mode and language controls below.
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    getNotificationPermission() === "granted",
  );

  async function handleEnableNotifications() {
    const success = await enablePushNotifications();
    setNotificationsEnabled(success);
  }

  return (
    <>
      {open && (
        <div className="sidebar-backdrop" onClick={onClose}>
          <aside
            className="sidebar"
            dir={language === "ar" ? "rtl" : "ltr"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="sidebar-close"
              onClick={onClose}
              aria-label={language === "ar" ? "إغلاق" : "Close"}
            >
              <FaXmark />
            </button>

            <div className="sidebar-profile">
              <OwnerAvatarUpload
                username={currentUser.username}
                avatarUrl={currentUser.avatarUrl}
                language={language}
                onAvatarChange={onAvatarChange}
              />
              <strong className="sidebar-profile-name">{currentUser.username}</strong>
            </div>

            {/* BUGS_AND_FIXES.md #203: moved out of AppHeader entirely
                per explicit request - the header felt cluttered with
                these as icon buttons crammed alongside the brand. */}
            <div className="sidebar-quick-settings">
              <div className="sidebar-quick-row">
                <button
                  type="button"
                  className="sidebar-quick-button"
                  onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
                >
                  {themeMode === "dark" ? <FaSun /> : <FaMoon />}
                  {themeMode === "dark"
                    ? language === "ar"
                      ? "الوضع الفاتح"
                      : "Light mode"
                    : language === "ar"
                      ? "الوضع الداكن"
                      : "Dark mode"}
                </button>

                <button
                  type="button"
                  className="sidebar-quick-button"
                  onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
                >
                  {languageLabel}
                </button>
              </div>

              <div className="sidebar-quick-theme-selector">
                {[
                  { value: "mkdd" as const, icon: <FaPalette />, ar: "MKDD", en: "MKDD" },
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
                    className={`sidebar-quick-theme-option${
                      themeStyle === option.value ? " selected" : ""
                    }`}
                    onClick={() => setThemeStyle(option.value)}
                  >
                    {option.icon}
                    <span>{language === "ar" ? option.ar : option.en}</span>
                    {themeStyle === option.value && <FaCheck />}
                  </button>
                ))}
              </div>

              {isPushSupported() && !notificationsEnabled && (
                <button
                  type="button"
                  className="sidebar-quick-button sidebar-quick-button-full"
                  onClick={handleEnableNotifications}
                >
                  <FaBellSlash />
                  {language === "ar" ? "تفعيل الإشعارات" : "Enable notifications"}
                </button>
              )}

              {isPushSupported() && notificationsEnabled && (
                <div className="sidebar-quick-button sidebar-quick-button-full sidebar-quick-active">
                  <FaBell />
                  {language === "ar" ? "الإشعارات مفعّلة" : "Notifications on"}
                </div>
              )}
            </div>

            <nav className="sidebar-menu">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.key}
                  className="sidebar-menu-item"
                  onClick={() => {
                    onSelect(item.key);
                    onClose();
                  }}
                >
                  <span className="sidebar-menu-icon">{item.icon}</span>
                  {language === "ar" ? item.ar : item.en}
                  <span className="sidebar-menu-arrow">
                    {language === "ar" ? <FaChevronLeft /> : <FaChevronRight />}
                  </span>
                </button>
              ))}

              <button
                className="sidebar-menu-item"
                onClick={() => {
                  setHealthOpen(true);
                  onClose();
                }}
              >
                <span className="sidebar-menu-icon">
                  <FaHeartPulse />
                </span>
                {language === "ar" ? "صحة النظام" : "System Health"}
                <span className="sidebar-menu-arrow">
                  {language === "ar" ? <FaChevronLeft /> : <FaChevronRight />}
                </span>
              </button>

              {isLocalAccess() && (
                <button
                  className="sidebar-menu-item"
                  onClick={() => {
                    setSettingsOpen(true);
                    onClose();
                  }}
                >
                  <span className="sidebar-menu-icon">
                    <FaGear />
                  </span>
                  {language === "ar" ? "الإعدادات" : "Settings"}
                  <span className="sidebar-menu-arrow">
                    {language === "ar" ? <FaChevronLeft /> : <FaChevronRight />}
                  </span>
                </button>
              )}

              <button
                className="sidebar-menu-item"
                onClick={() => {
                  logout().finally(() => window.location.reload());
                }}
              >
                <span className="sidebar-menu-icon">
                  <FaRightFromBracket />
                </span>
                {language === "ar" ? "تسجيل الخروج" : "Log out"}
                <span className="sidebar-menu-arrow">
                  {language === "ar" ? <FaChevronLeft /> : <FaChevronRight />}
                </span>
              </button>
            </nav>
          </aside>
        </div>
      )}

      {settingsOpen && (
        <RestartModal language={language} onClose={() => setSettingsOpen(false)} />
      )}

      {healthOpen && (
        <SystemHealthModal language={language} onClose={() => setHealthOpen(false)} />
      )}
    </>
  );
}

export type { SidebarMenuKey };
