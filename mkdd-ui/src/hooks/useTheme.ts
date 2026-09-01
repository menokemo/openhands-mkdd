import { useEffect, useState } from "react";

// BUGS_AND_FIXES.md #200: split into an independent "style" (which app's
// look) and "mode" (dark/light) - the owner correctly pointed out that
// each style needs both a dark and light variant, not one flat theme
// per style. The combined data-theme attribute value is `${style}-${mode}`.
export type ThemeStyle = "mkdd" | "whatsapp" | "telegram";
export type ThemeMode = "dark" | "light";

const VALID_STYLES: ThemeStyle[] = ["mkdd", "whatsapp", "telegram"];
const VALID_MODES: ThemeMode[] = ["dark", "light"];

// BUGS_AND_FIXES.md #198/#200: matches each style+mode combination's
// real page background color (--mkdd-page in App.css) - kept in sync
// with those values so the browser/PWA chrome color always genuinely
// matches what's on screen.
const THEME_COLORS: Record<ThemeStyle, Record<ThemeMode, string>> = {
  mkdd: { dark: "#325be4", light: "#5b53d0" },
  whatsapp: { dark: "#111b21", light: "#ece5dd" },
  telegram: { dark: "#0e1621", light: "#ffffff" },
};

export function useTheme() {
  const [style, setStyle] = useState<ThemeStyle>(() => {
    const saved = localStorage.getItem("mkdd-theme-style");
    return VALID_STYLES.includes(saved as ThemeStyle) ? (saved as ThemeStyle) : "mkdd";
  });
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("mkdd-theme-mode");
    return VALID_MODES.includes(saved as ThemeMode) ? (saved as ThemeMode) : "dark";
  });

  useEffect(() => {
    localStorage.setItem("mkdd-theme-style", style);
    localStorage.setItem("mkdd-theme-mode", mode);
    // The official token file (MKDD_Color_System_Light_Dark_AR_RTL.docx)
    // defines light as the bare :root default and dark as an explicit
    // override - the app's actual default (mkdd style, dark mode) is
    // always set explicitly here, never ambiguous.
    document.documentElement.setAttribute("data-theme", `${style}-${mode}`);

    // Keep the browser/PWA chrome color in sync with the actual theme
    // (BUGS_AND_FIXES.md #115) - index.html's inline script sets this
    // correctly at initial load, but a mid-session toggle via this hook
    // needs the same update, or the status bar/PWA color would stay
    // stuck on whatever it was when the page first loaded.
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    themeColorMeta?.setAttribute("content", THEME_COLORS[style][mode]);
  }, [style, mode]);

  return { style, setStyle, mode, setMode };
}
