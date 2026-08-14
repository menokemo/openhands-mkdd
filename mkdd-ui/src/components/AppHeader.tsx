type Props = {
  language: "ar" | "en";
  languageLabel: string;
  setLanguage: (language: "ar" | "en") => void;
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
  onOpenSidebar,
}: Props) {
  return (
    <header className="app-header">
      <button
        className="app-header-menu"
        onClick={onOpenSidebar}
        aria-label={language === "ar" ? "القائمة" : "Menu"}
      >
        <span />
        <span />
        <span />
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

      <button
        className="lang-toggle"
        onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
      >
        {languageLabel}
      </button>
    </header>
  );
}
