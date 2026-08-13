import { useEffect, useState } from "react";
import { translations, type Language } from "./translations";

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("mkdd-language");
    return saved === "en" ? "en" : "ar";
  });

  useEffect(() => {
    localStorage.setItem("mkdd-language", language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  return {
    language,
    setLanguage,
    t: translations[language],
  };
}
