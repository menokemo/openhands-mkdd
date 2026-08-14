export const translations = {
  ar: {
    projects: "المشاريع",
    project: "مشروع MKDD",
    loadingProjects: "جاري تحميل المشاريع...",
    noProjects: "لا توجد مشاريع حاليًا.",
    back: "رجوع",
    model: "الموديل",
    language: "English",
    newProject: "+ مشروع جديد",
    newProjectTitle: "إنشاء مشروع جديد",
    newProjectNamePlaceholder: "اسم المشروع",
    newProjectNameHint:
      "يفضّل استخدام حروف/أرقام إنجليزية في الاسم (لتسمية المجلد على القرص).",
    newProjectColorLabel: "لون غلاف الكارت",
    create: "إنشاء",
    cancel: "إلغاء",
    creatingProject: "جاري الإنشاء...",
    projectCreationFailed: "فشل إنشاء المشروع. حاول مرة أخرى.",
  },
  en: {
    projects: "Projects",
    project: "MKDD Project",
    loadingProjects: "Loading projects...",
    noProjects: "No projects yet.",
    back: "Back",
    model: "Model",
    language: "العربية",
    newProject: "+ New Project",
    newProjectTitle: "Create New Project",
    newProjectNamePlaceholder: "Project name",
    newProjectNameHint:
      "Prefer English letters/numbers (used for the folder name on disk).",
    newProjectColorLabel: "Card cover color",
    create: "Create",
    cancel: "Cancel",
    creatingProject: "Creating...",
    projectCreationFailed: "Failed to create project. Please try again.",
  },
} as const;

export type Language = keyof typeof translations;
