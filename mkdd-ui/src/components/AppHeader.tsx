import { FaBars } from "react-icons/fa6";

type Props = {
  language: "ar" | "en";
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
 * "MKDD" and its tagline both always render in English regardless of
 * the app language, per explicit request - matches how a real brand
 * name/tagline doesn't get translated per-user, unlike the rest of the
 * app's UI text which does follow the selected language.
 *
 * BUGS_AND_FIXES.md #203: intentionally minimal now - the owner felt the
 * header had become cluttered (notifications, theme style, theme mode,
 * language, all as icon buttons crammed alongside the brand) and asked
 * for every control to move into the sidebar instead, with the logo and
 * company name enlarged to fill the resulting space. See Sidebar.tsx's
 * "Quick settings" section for where those controls now live.
 *
 * BUGS_AND_FIXES.md #207: the logo and menu button positions are always
 * fixed - logo on the left, menu button on the right - regardless of
 * language/RTL direction, per explicit request. The header enforces its
 * own LTR layout direction in App.css (independent of the rest of the
 * page's RTL/LTR, which still follows the selected language normally)
 * so this never flips with Arabic.
 */
export default function AppHeader({ language, onOpenSidebar }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-brand">
        <img src="/api/branding/logo" alt="MKDD" />
        <div>
          <span className="app-header-title">MKDD</span>
          <span className="app-header-subtitle">Design &amp; Development</span>
        </div>
      </div>

      <button
        className="app-header-menu"
        onClick={onOpenSidebar}
        aria-label={language === "ar" ? "القائمة" : "Menu"}
      >
        <FaBars />
      </button>
    </header>
  );
}
