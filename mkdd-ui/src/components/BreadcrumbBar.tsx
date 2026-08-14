type Props = {
  projectName: string;
  employeeName?: string | null;
  onBack: () => void;
  backLabel: string;
};

/**
 * Screen-specific back-navigation, deliberately NOT part of AppHeader
 * (see AppHeader.tsx). Rendered below the header only when there's
 * somewhere to go back to (a project, or a project + employee).
 */
export default function BreadcrumbBar({
  projectName,
  employeeName,
  onBack,
  backLabel,
}: Props) {
  return (
    <div className="breadcrumb-bar">
      <button className="breadcrumb-back" onClick={onBack} aria-label={backLabel}>
        ←
      </button>

      <div className="breadcrumb-path">
        <span>{projectName}</span>
        {employeeName && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span>{employeeName}</span>
          </>
        )}
      </div>
    </div>
  );
}
