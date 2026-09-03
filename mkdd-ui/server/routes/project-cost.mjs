import {
  fetchAllConversations,
  findAllProjectConversations,
} from "../lib/authorize-conversation.mjs";
import { normalizeConversation } from "../lib/normalize-conversation.mjs";
import {
  getProjectBudget,
  setProjectBudget,
  listProjectsWithBudget,
} from "../lib/project-metadata.mjs";
import { readJsonBody } from "../lib/read-json-body.mjs";

/**
 * GET /api/projects/{projectSlug}/total-cost — the real sum across
 * every conversation ever created for this project (across all
 * employees, including any superseded by "start new conversation"),
 * computed via ONE exhaustive scan of /api/conversations/search
 * filtered by project (BUGS_AND_FIXES.md #65).
 *
 * Deliberately a separate, standalone endpoint rather than bundled
 * into the per-employee /api/conversation route: that route is polled
 * every 5 seconds for all 14 employees and must stay on the cheap,
 * short-circuiting conversation lookup. This exhaustive scan belongs
 * on its own, much-less-frequent refresh schedule instead.
 *
 * BUGS_AND_FIXES.md #216: also returns the owner's own optional
 * per-project budget alongside the real cost, so the frontend can show
 * both together (e.g. a progress bar) from one request.
 */
export async function handleProjectTotalCost(req, res) {
  const match = req.url?.match(/^\/api\/projects\/([^/]+)\/total-cost$/);
  if (!(req.method === "GET" && match)) return false;

  const projectSlug = decodeURIComponent(match[1]);
  const project = `/projects/${projectSlug}`;

  const allConversations = await fetchAllConversations();
  const conversations = findAllProjectConversations(project, allConversations);

  const totalCost = conversations.reduce((sum, conversation) => {
    const normalized = normalizeConversation(conversation);
    return sum + (normalized?.cost?.accumulatedCost ?? 0);
  }, 0);

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ totalCost, budget: getProjectBudget(project) }));
  return true;
}

/**
 * POST /api/projects/{projectSlug}/budget — the owner sets (or clears,
 * with budget: null) their own real per-project cost budget in USD
 * (BUGS_AND_FIXES.md #216). Deliberately per-project, never a single
 * global number - the owner explicitly rejected one fixed figure for
 * every project, since project size/scope genuinely varies. No budget
 * set means no cost alerting for that project, not a silent zero.
 */
export async function handleSetProjectBudget(req, res) {
  const match = req.url?.match(/^\/api\/projects\/([^/]+)\/budget$/);
  if (!(req.method === "POST" && match)) return false;

  const projectSlug = decodeURIComponent(match[1]);
  const project = `/projects/${projectSlug}`;
  const { budget } = await readJsonBody(req);

  try {
    const saved = setProjectBudget(project, budget);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ budget: saved }));
  } catch (error) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
  return true;
}

/**
 * GET /api/internal/budget-status — scans every project that has a
 * real owner-set budget (BUGS_AND_FIXES.md #216) and returns its real
 * total cost alongside that budget, for health-check.sh to alert on.
 * Projects with no budget set are skipped entirely - no alerting for
 * them, per the owner's explicit "every project is a different size"
 * requirement.
 */
export async function handleBudgetStatus(req, res) {
  if (!(req.method === "GET" && req.url === "/api/internal/budget-status")) {
    return false;
  }

  const budgeted = listProjectsWithBudget();
  if (budgeted.length === 0) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ projects: [] }));
    return true;
  }

  const allConversations = await fetchAllConversations();

  const projects = budgeted.map(({ project, budget }) => {
    const conversations = findAllProjectConversations(project, allConversations);
    const totalCost = conversations.reduce((sum, conversation) => {
      const normalized = normalizeConversation(conversation);
      return sum + (normalized?.cost?.accumulatedCost ?? 0);
    }, 0);
    return { project, budget, totalCost };
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ projects }));
  return true;
}
