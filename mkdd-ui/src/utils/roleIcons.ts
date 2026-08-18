import {
  FaClipboardList,
  FaChartLine,
  FaPalette,
  FaCompassDrafting,
  FaCode,
  FaPlug,
  FaClipboardCheck,
  FaVial,
  FaCodeBranch,
  FaShieldHalved,
  FaServer,
  FaPen,
  FaRocket,
  FaLanguage,
} from "react-icons/fa6";

/**
 * Maps each employee's stable id (AgentProfile.id, e.g. "architect") to
 * an icon representing their role. Single source of truth - used by
 * both the team strip (ProjectHomeScreen) and the chat screen's role
 * badge (ChatScreen), so a role's icon can't silently drift between
 * the two places it's shown.
 */
export const ROLE_ICONS: Record<string, React.ComponentType> = {
  "product-manager": FaClipboardList,
  "business-analyst": FaChartLine,
  "ui-ux": FaPalette,
  architect: FaCompassDrafting,
  implementation: FaCode,
  "integration-engineer": FaPlug,
  qa: FaClipboardCheck,
  "test-automation": FaVial,
  "code-review": FaCodeBranch,
  "security-review": FaShieldHalved,
  devops: FaServer,
  "technical-writer": FaPen,
  "release-manager": FaRocket,
  "content-writer": FaLanguage,
};
