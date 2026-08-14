import {
  FaFolderOpen,
  FaHourglassHalf,
  FaCircleCheck,
  FaUsers,
  FaXmark,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa6";

type SidebarMenuKey = "active" | "nearCompletion" | "completed" | "employees";

type Props = {
  open: boolean;
  language: "ar" | "en";
  onClose: () => void;
  onSelect: (key: SidebarMenuKey) => void;
};

const MENU_ITEMS: {
  key: SidebarMenuKey;
  icon: React.ReactNode;
  ar: string;
  en: string;
}[] = [
  {
    key: "active",
    icon: <FaFolderOpen />,
    ar: "المشاريع الحالية",
    en: "Active Projects",
  },
  {
    key: "nearCompletion",
    icon: <FaHourglassHalf />,
    ar: "قربت تخلص",
    en: "Near Completion",
  },
  { key: "completed", icon: <FaCircleCheck />, ar: "خلصت", en: "Completed" },
  { key: "employees", icon: <FaUsers />, ar: "الموظفين", en: "Employees" },
];

/**
 * The sidebar is navigation ONLY - a menu of buttons, per explicit
 * correction from the user ("مش مطلوب هو نفسه يعرض البيانات"). Each item
 * opens a separate popup (see App.tsx's activeSidebarMenu state +
 * ProjectListModal/EmployeeListModal) that holds the actual data - the
 * sidebar itself never renders project or employee lists directly.
 */
export default function Sidebar({ open, language, onClose, onSelect }: Props) {
  if (!open) return null;

  return (
    <div className="sidebar-backdrop" onClick={onClose}>
      <aside
        className="sidebar"
        dir={language === "ar" ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="sidebar-close"
          onClick={onClose}
          aria-label={language === "ar" ? "إغلاق" : "Close"}
        >
          <FaXmark />
        </button>

        <nav className="sidebar-menu">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              className="sidebar-menu-item"
              onClick={() => {
                onSelect(item.key);
                onClose();
              }}
            >
              <span className="sidebar-menu-icon">{item.icon}</span>
              {language === "ar" ? item.ar : item.en}
              <span className="sidebar-menu-arrow">
                {language === "ar" ? <FaChevronLeft /> : <FaChevronRight />}
              </span>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}

export type { SidebarMenuKey };
