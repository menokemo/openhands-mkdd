import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "whatsapp" | "telegram";

const VALID_THEMES: Theme[] = ["dark", "light", "whatsapp", "telegram"];

// BUGS_AND_FIXES.md #198: matches each theme's real page background
// color (--mkdd-page in App.css) - kept in sync with those values so
// the browser/PWA chrome color always genuinely matches what's on
// screen, not just light-vs-dark.
const THEME_COLORS: Record<Theme, string> = {
  light: "#5b53d0",
  dark: "#325be4",
  whatsapp: "#111b21",
  telegram: "#0e1621",
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("mkdd-theme");
    return VALID_THEMES.includes(saved as Theme) ? (saved as Theme) : "dark";
  });

  useEffect(() => {
    localStorage.setItem("mkdd-theme", theme);
    // The official token file (MKDD_Color_System_Light_Dark_AR_RTL.docx)
    // defines light as the bare :root default and dark as an explicit
    // [data-theme="dark"] override. We always set the attribute
    // explicitly either way (rather than relying on the bare :root
    // fallback for light), so the app's actual default - dark, unless
    // the user has chosen light - is never ambiguous.
    document.documentElement.setAttribute("data-theme", theme);

    // Keep the browser/PWA chrome color in sync with the actual theme
    // (BUGS_AND_FIXES.md #115) - index.html's inline script sets this
    // correctly at initial load, but a mid-session toggle via this hook
    // needs the same update, or the status bar/PWA color would stay
    // stuck on whatever it was when the page first loaded.
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    themeColorMeta?.setAttribute("content", THEME_COLORS[theme]);
  }, [theme]);

  return { theme, setTheme };
}
