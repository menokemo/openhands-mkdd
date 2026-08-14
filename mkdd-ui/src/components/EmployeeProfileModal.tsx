import type { AgentProfile } from "../types";
import EmployeeAvatarUpload from "./EmployeeAvatarUpload";

type Props = {
  employee: AgentProfile;
  language: "ar" | "en";
  onClose: () => void;
  onUploadAvatar: (employeeSlug: string, imageDataUrl: string) => Promise<void>;
};

/**
 * A globally-accessible employee profile, reachable from the Sidebar's
 * employee list regardless of which project (if any) is currently open -
 * agent profiles aren't project-scoped, so this view isn't either.
 * Reuses EmployeeAvatarUpload (the same photo-upload control already used
 * on Project Home's employee cards) so there's exactly one implementation
 * of "change an employee's photo," not two.
 */
export default function EmployeeProfileModal({
  employee,
  language,
  onClose,
  onUploadAvatar,
}: Props) {
  const label = language === "ar" ? employee.displayNameAr : employee.displayNameEn;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal employee-profile-modal" onClick={(e) => e.stopPropagation()}>
        <EmployeeAvatarUpload
          employee={employee}
          label={label}
          language={language}
          onUpload={onUploadAvatar}
        />

        <h2>{label}</h2>
        <p className="employee-profile-role">{employee.role}</p>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {language === "ar" ? "إغلاق" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
