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
 * BUGS_AND_FIXES.md #210: three genuinely separate elements in a single
 * row - sidebar button, company name, then logo, in that fixed DOM
 * order - with no forced direction (per #209's revert), so this row
 * naturally flips with the page's RTL/LTR: in Arabic, right to left
 * reads button -> name -> logo; in English, left to right reads
 * button -> name -> logo (the mirror image), per explicit request.
 * The name always ends up visually between the button and the logo.
 */
export default function AppHeader({ language, onOpenSidebar }: Props) {
  return (
    <header className="app-header">
      <button
        className="app-header-menu"
        onClick={onOpenSidebar}
        aria-label={language === "ar" ? "القائمة" : "Menu"}
      >
        <FaBars />
      </button>

      <div className="app-header-name">
        <span className="app-header-title">MKDD</span>
        <span className="app-header-subtitle">Design &amp; Development</span>
      </div>

      <img className="app-header-logo" src="/api/branding/logo" alt="MKDD" />
    </header>
  );
}
