import type { AgentProfile } from "../types";

type Props = {
  employees: AgentProfile[];
  language: "ar" | "en";
  onOpenEmployeeProfile: (employee: AgentProfile) => void;
  onClose: () => void;
};

/**
 * The actual employee list, opened from Sidebar.tsx's "Employees" item.
 * Clicking an employee opens EmployeeProfileModal (name/role/photo) -
 * this popup itself just lists them.
 */
export default function EmployeeListModal({
  employees,
  language,
  onOpenEmployeeProfile,
  onClose,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal list-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{language === "ar" ? "الموظفين" : "Employees"}</h2>

        <div className="list-modal-items">
          {employees.map((employee) => {
            const label =
              language === "ar" ? employee.displayNameAr : employee.displayNameEn;

            return (
              <button
                key={employee.id}
                className="sidebar-employee"
                onClick={() => {
                  onOpenEmployeeProfile(employee);
                  onClose();
                }}
              >
                <span className="sidebar-employee-avatar">
                  {employee.avatarUrl ? (
                    <img src={employee.avatarUrl} alt={label ?? employee.name} />
                  ) : (
                    (label?.slice(0, 1) ?? "?")
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {language === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
