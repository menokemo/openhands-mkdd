export const translations = {
  ar: {
    projects: "المشاريع",
    project: "مشروع MKDD",
    loadingProjects: "جاري تحميل المشاريع...",
    noProjects: "لا توجد مشاريع حاليًا.",
    back: "رجوع",
    model: "الموديل",
    language: "English",
  },
  en: {
    projects: "Projects",
    project: "MKDD Project",
    loadingProjects: "Loading projects...",
    noProjects: "No projects yet.",
    back: "Back",
    model: "Model",
    language: "العربية",
  },
} as const;

export type Language = keyof typeof translations;
