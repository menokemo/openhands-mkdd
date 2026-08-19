import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("mkdd-theme");
    return saved === "light" ? "light" : "dark";
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
    themeColorMeta?.setAttribute("content", theme === "light" ? "#5b53d0" : "#325be4");
  }, [theme]);

  return { theme, setTheme };
}
