import fs from "node:fs";
import path from "node:path";

const STATE_DIR = process.env.MKDD_DATA_DIR ?? "/mkdd-data";
const STATE_FILE = path.join(STATE_DIR, "workflow-state.json");
const LOCK_FILE = `${STATE_FILE}.lock`;

/**
 * BUGS_AND_FIXES.md #238: a real live incident showed a workflow-state
 * update silently losing prior real data (project approvals vanished
 * after adding a single finding) - readStore/writeStore's
 * read-modify-write cycle had no protection against a concurrent
 * write landing in between, from any source (another request, a
 * container restart mid-write, etc). This is a real OS-level exclusive
 * lock file (not just an in-process queue, which would do nothing to
 * protect against a second OS process/container writing the same
 * file) - any writer must acquire it before touching STATE_FILE, and
 * any writer that can't acquire it retries briefly rather than
 * proceeding with a stale read.
 */
function withFileLock(fn) {
  const maxAttempts = 50;
  const retryDelayMs = 20;
  let fd = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fd = fs.openSync(LOCK_FILE, "wx");
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      // Someone else holds the lock - a genuinely concurrent writer
      // this time, not a hypothetical. Wait briefly and retry rather
      // than reading a state that's about to be overwritten.
      const until = Date.now() + retryDelayMs;
      while (Date.now() < until) {
        /* busy-wait briefly - this function is intentionally
           synchronous end-to-end, matching readStore/writeStore, so a
           real async sleep isn't available here without turning every
           call site of updateWorkflowState into an async chain. */
      }
    }
  }

  if (fd === null) {
    throw new Error("workflow_state_lock_timeout");
  }

  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(LOCK_FILE);
  }
}

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
        // BUGS_AND_FIXES.md #212: real supporting evidence for the
        // completion claim, not just a status flag - see
        // routes/workflow.mjs's MIN_EVIDENCE_LENGTH enforcement.
        evidence: null,
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
    reports: Array.isArray(state?.reports) ? state.reports : [],
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
    reports: [],
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

/**
 * Returns a lightweight {project: {currentGate, productionApproved}} map
 * for every project that has ANY persisted workflow state. Used by the
 * sidebar to group projects into active (gates 1-3) / near-completion
 * (reached the production gate but not yet approved) / completed
 * (production gate approved), without fetching each project's full
 * workflow state one request at a time.
 *
 * A project with no persisted state at all (brand new, never touched its
 * workflow) is NOT included here - the frontend treats "not present"
 * the same as the real default (currentGate: "requirements"), since
 * that's exactly what getWorkflowState() would return for it anyway.
 */
export function listWorkflowSummaries() {
  const store = readStore();
  const summaries = {};

  for (const [project, state] of Object.entries(store.projects ?? {})) {
    const normalized = normalizeProjectState(project, state);
    summaries[project] = {
      currentGate: normalized.currentGate,
      productionApproved: normalized.gates.production.status === "approved",
    };
  }

  return summaries;
}

export function updateWorkflowState(project, updater) {
  return withFileLock(() => {
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
  });
}

export { GATES, REVIEW_ROLES };
