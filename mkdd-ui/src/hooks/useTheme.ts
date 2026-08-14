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
  }, [theme]);

  return { theme, setTheme };
}
