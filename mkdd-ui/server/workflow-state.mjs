import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const STATE_FILE = path.join(STATE_DIR, "workflow-state.json");

const GATES = ["requirements", "ui_ux", "architecture", "production"];

const REVIEW_ROLES = ["qa", "test_automation", "code_review", "security_review"];

function emptyReviews() {
  return Object.fromEntries(
    REVIEW_ROLES.map((role) => [
      role,
      {
        status: "pending",
        reviewedBy: null,
        completedAt: null,
      },
    ]),
  );
}

function normalizeProjectState(project, state) {
  const base = emptyProjectState(project);

  return {
    ...base,
    ...state,
    project,
    gates: {
      ...base.gates,
      ...(state?.gates ?? {}),
    },
    approvals: Array.isArray(state?.approvals) ? state.approvals : [],
    blockers: Array.isArray(state?.blockers) ? state.blockers : [],
    findings: Array.isArray(state?.findings) ? state.findings : [],
    reviews: {
      ...emptyReviews(),
      ...(state?.reviews ?? {}),
    },
  };
}

function emptyProjectState(project) {
  return {
    project,
    currentGate: "requirements",
    gates: {
      requirements: { status: "pending", approvedAt: null },
      ui_ux: { status: "locked", approvedAt: null },
      architecture: { status: "locked", approvedAt: null },
      production: { status: "locked", approvedAt: null },
    },
    approvals: [],
    blockers: [],
    findings: [],
    reviews: emptyReviews(),
    updatedAt: new Date().toISOString(),
  };
}

function readStore() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : { projects: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { projects: {} };
    throw error;
  }
}

function writeStore(store) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
  fs.renameSync(temp, STATE_FILE);
}

export function getWorkflowState(project) {
  const store = readStore();
  return normalizeProjectState(project, store.projects?.[project]);
}

export function updateWorkflowState(project, updater) {
  const store = readStore();

  if (!store.projects || typeof store.projects !== "object") {
    store.projects = {};
  }

  const current = normalizeProjectState(project, store.projects[project]);
  const next = updater(structuredClone(current));

  if (!next || typeof next !== "object") {
    throw new Error("invalid_workflow_state");
  }

  if (!GATES.includes(next.currentGate)) {
    throw new Error("invalid_current_gate");
  }

  next.project = project;
  next.updatedAt = new Date().toISOString();
  store.projects[project] = next;
  writeStore(store);

  return next;
}

export { GATES, REVIEW_ROLES };
