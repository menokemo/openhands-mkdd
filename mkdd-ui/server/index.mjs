import http from "node:http";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { getWorkflowState, updateWorkflowState, GATES, REVIEW_ROLES } from "./workflow-state.mjs";

const OPENHANDS = process.env.OPENHANDS_URL;

function sessionKey() {
  for (const id of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(id)) continue;
    try {
      const args = fs.readFileSync(`/proc/${id}/cmdline`, "utf8").split("\0");
      if (!args.some(x => x.includes("static-server.mjs"))) continue;
      const i = args.indexOf("--session-api-key");
      if (i >= 0 && args[i + 1]) return args[i + 1];
    } catch {}
  }
  throw new Error("OpenHands session key not found");
}

async function openhands(path) {
  return fetch(OPENHANDS + path, {
    headers: {"X-Session-API-Key": sessionKey()}
  });
}

function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== "object") return null;
  const metrics = conversation.stats?.usage_to_metrics?.default;
  const tokens = metrics?.accumulated_token_usage;
  return {
    id: conversation.id,
    execution_status: conversation.execution_status ?? null,
    tags: {
      ...(typeof conversation.tags?.mkddproject === "string" ? {mkddproject: conversation.tags.mkddproject} : {}),
      ...(typeof conversation.tags?.mkddemployee === "string" ? {mkddemployee: conversation.tags.mkddemployee} : {})
    },
    cost: metrics && typeof metrics === "object" ? {
      modelName: typeof metrics.model_name === "string" ? metrics.model_name : null,
      accumulatedCost: typeof metrics.accumulated_cost === "number" ? metrics.accumulated_cost : 0,
      tokens: tokens && typeof tokens === "object" ? {
        prompt: typeof tokens.prompt_tokens === "number" ? tokens.prompt_tokens : 0,
        completion: typeof tokens.completion_tokens === "number" ? tokens.completion_tokens : 0,
        cacheRead: typeof tokens.cache_read_tokens === "number" ? tokens.cache_read_tokens : 0,
        cacheWrite: typeof tokens.cache_write_tokens === "number" ? tokens.cache_write_tokens : 0,
        reasoning: typeof tokens.reasoning_tokens === "number" ? tokens.reasoning_tokens : 0
      } : null
    } : null
  };
}

http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/branding/logo") {
      const file = "/mkdd-data/branding/mkdd-logo.png";
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, {"content-type":"image/png"});
      return fs.createReadStream(file).pipe(res);
    }

    if (req.url === "/api/health") {
      const r = await fetch(OPENHANDS + "/ready");
      res.writeHead(r.status, {"content-type":"application/json"});
      return res.end(await r.text());
    }

    if (req.url?.startsWith("/api/workflow?")) {
      const url = new URL(req.url, "http://mkdd.local");
      const project = url.searchParams.get("project");

      if (!project) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({error:"project_required"}));
      }

      const workflow = getWorkflowState(project);
      res.writeHead(200, {"content-type":"application/json"});
      return res.end(JSON.stringify({workflow}));
    }

    if (req.method === "POST" && req.url === "/api/workflow/approve-gate") {
      let body = "";
      for await (const chunk of req) body += chunk;

      const { project, gate, approvedBy } = JSON.parse(body || "{}");

      if (!project || !gate || !approvedBy) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({error:"project_gate_approvedBy_required"}));
      }

      const workflow = updateWorkflowState(project, (state) => {
        if (!GATES.includes(gate)) {
          throw new Error("invalid_gate");
        }

        if (state.currentGate !== gate) {
          throw new Error("gate_not_current");
        }

        if (state.blockers.some((item) => item.status === "open")) {
          throw new Error("open_blockers_exist");
        }

        if (state.findings.some((item) => item.status !== "verified")) {
          throw new Error("unverified_findings_exist");
        }

        if (
          gate === "production" &&
          REVIEW_ROLES.some(
            (reviewRole) => state.reviews?.[reviewRole]?.status !== "complete"
          )
        ) {
          throw new Error("mandatory_reviews_incomplete");
        }

        const index = GATES.indexOf(gate);
        const approvedAt = new Date().toISOString();

        state.gates[gate] = {
          status: "approved",
          approvedAt
        };

        state.approvals.push({
          gate,
          approvedBy,
          approvedAt
        });

        const nextGate = GATES[index + 1] ?? null;

        if (nextGate) {
          state.currentGate = nextGate;
          state.gates[nextGate] = {
            ...state.gates[nextGate],
            status: "pending"
          };
        }

        return state;
      });

      res.writeHead(200, {"content-type":"application/json"});
      return res.end(JSON.stringify({workflow}));
    }

    if (req.method === "POST" && req.url === "/api/workflow/blockers") {
      let body = "";
      for await (const chunk of req) body += chunk;

      const { project, action, blockerId, title, createdBy, resolvedBy } =
        JSON.parse(body || "{}");

      if (!project || !action) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({error:"project_action_required"}));
      }

      const workflow = updateWorkflowState(project, (state) => {
        if (action === "add") {
          if (!title?.trim() || !createdBy?.trim()) {
            throw new Error("title_createdBy_required");
          }

          state.blockers.push({
            id: randomUUID(),
            title: title.trim(),
            status: "open",
            createdBy: createdBy.trim(),
            createdAt: new Date().toISOString(),
            resolvedBy: null,
            resolvedAt: null
          });

          return state;
        }

        if (action === "resolve") {
          if (!blockerId || !resolvedBy?.trim()) {
            throw new Error("blockerId_resolvedBy_required");
          }

          const blocker = state.blockers.find(
            (item) => item.id === blockerId
          );

          if (!blocker) {
            throw new Error("blocker_not_found");
          }

          if (blocker.status === "resolved") {
            throw new Error("blocker_already_resolved");
          }

          blocker.status = "resolved";
          blocker.resolvedBy = resolvedBy.trim();
          blocker.resolvedAt = new Date().toISOString();

          return state;
        }

        throw new Error("invalid_blocker_action");
      });

      res.writeHead(200, {"content-type":"application/json"});
      return res.end(JSON.stringify({workflow}));
    }

    if (req.method === "POST" && req.url === "/api/workflow/reviews") {
      let body = "";
      for await (const chunk of req) body += chunk;

      const {
        project,
        action,
        reviewRole,
        reviewedBy
      } = JSON.parse(body || "{}");

      if (!project || !action || !reviewRole || !reviewedBy) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({
          error:"project_action_reviewRole_reviewedBy_required"
        }));
      }

      if (!REVIEW_ROLES.includes(reviewRole)) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({
          error:"invalid_review_role"
        }));
      }

      const workflow = updateWorkflowState(project, (state) => {
        const review = state.reviews[reviewRole];

        if (action === "complete") {
          review.status = "complete";
          review.reviewedBy = reviewedBy;
          review.completedAt = new Date().toISOString();
          return state;
        }

        if (action === "reopen") {
          review.status = "pending";
          review.reviewedBy = null;
          review.completedAt = null;
          return state;
        }

        throw new Error("invalid_review_action");
      });

      res.writeHead(200, {"content-type":"application/json"});
      return res.end(JSON.stringify({workflow}));
    }

    if (req.method === "POST" && req.url === "/api/workflow/findings") {
      let body = "";
      for await (const chunk of req) body += chunk;

      const {
        project,
        action,
        findingId,
        title,
        reviewer,
        fixedBy,
        verifiedBy
      } = JSON.parse(body || "{}");

      if (!project || !action) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({error:"project_action_required"}));
      }

      const workflow = updateWorkflowState(project, (state) => {
        if (action === "add") {
          if (!title?.trim() || !reviewer?.trim()) {
            throw new Error("title_reviewer_required");
          }

          state.findings.push({
            id: randomUUID(),
            title: title.trim(),
            reviewer: reviewer.trim(),
            status: "open",
            createdAt: new Date().toISOString(),
            fixedBy: null,
            fixedAt: null,
            verifiedBy: null,
            verifiedAt: null
          });

          return state;
        }

        const finding = state.findings.find(
          (item) => item.id === findingId
        );

        if (!finding) {
          throw new Error("finding_not_found");
        }

        if (action === "mark-fixed") {
          if (!fixedBy?.trim()) {
            throw new Error("fixedBy_required");
          }

          if (fixedBy.trim() === finding.reviewer) {
            throw new Error("reviewer_cannot_fix_own_finding");
          }

          if (finding.status !== "open") {
            throw new Error("finding_not_open");
          }

          finding.status = "fixed_pending_verification";
          finding.fixedBy = fixedBy.trim();
          finding.fixedAt = new Date().toISOString();

          return state;
        }

        if (action === "verify") {
          if (!verifiedBy?.trim()) {
            throw new Error("verifiedBy_required");
          }

          if (verifiedBy.trim() !== finding.reviewer) {
            throw new Error("same_reviewer_must_verify");
          }

          if (finding.status !== "fixed_pending_verification") {
            throw new Error("finding_not_ready_for_verification");
          }

          finding.status = "verified";
          finding.verifiedBy = verifiedBy.trim();
          finding.verifiedAt = new Date().toISOString();

          return state;
        }

        throw new Error("invalid_finding_action");
      });

      res.writeHead(200, {"content-type":"application/json"});
      return res.end(JSON.stringify({workflow}));
    }

    if (req.url === "/api/projects") {
      const r = await openhands("/api/workspaces");
      res.writeHead(r.status, {"content-type":"application/json"});
      return res.end(await r.text());
    }

    if (req.url === "/api/employees") {
      const r = await openhands("/api/agent-profiles");
      res.writeHead(r.status, {"content-type":"application/json"});
      const data = await r.json();
      const allowed = new Set(
        fs.readdirSync("/company-agents-definitions")
          .filter(name => name.endsWith(".md") && name !== "company-orchestrator.md")
          .map(name => name.replace(/\.md$/, ""))
      );
      data.profiles = (data.profiles ?? [])
        .filter(p => allowed.has(p.name))
        .map(profile => {
          const file = `/company-agents-definitions/${profile.name}.md`;
          const text = fs.readFileSync(file, "utf8");

          const read = (label) => {
            const m = text.match(new RegExp(`^- ${label}:\\s*(.+)$`, "m"));
            return m ? m[1].trim() : null;
          };

          return {
            ...profile,
            displayNameEn: read("Name"),
            displayNameAr: read("Arabic Name"),
            role: read("Role"),
            avatarUrl: `/avatars/${profile.name}.webp`,
            order: Number((text.match(/^order:\s*(\d+)$/m) || [])[1] || 999)
          };
        })
        .sort((a, b) => a.order - b.order);

      return res.end(JSON.stringify(data));
    }


    if (req.url?.startsWith("/api/conversation?")) {
      const url = new URL(req.url, "http://mkdd.local");
      const project = url.searchParams.get("project");
      const employeeId = url.searchParams.get("employeeId");
      const employeeName = url.searchParams.get("employeeName");

      if (!project || !employeeId || !employeeName) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({
          error:"project_employee_required"
        }));
      }

      let pageId = null;

      do {
        const qs = new URLSearchParams({limit:"100"});
        if (pageId) qs.set("page_id", pageId);

        const r = await openhands(`/api/conversations/search?${qs}`);
        const data = await r.json();

        const found = (data.items ?? []).find((conversation) =>
          conversation.tags?.mkddproject === project &&
          (
            conversation.tags?.mkddemployeeid === employeeId ||
            (
              !conversation.tags?.mkddemployeeid &&
              conversation.tags?.mkddemployee === employeeName
            )
          )
        );

        if (found) {
          res.writeHead(200, {"content-type":"application/json"});
          return res.end(JSON.stringify({
            conversation: normalizeConversation(found)
          }));
        }

        pageId = data.next_page_id ?? null;
      } while (pageId);

      res.writeHead(200, {"content-type":"application/json"});
      return res.end(JSON.stringify({conversation:null}));
    }
    if (req.method === "POST" && req.url === "/api/chat/send") {
      let body = "";
      for await (const chunk of req) body += chunk;

      const {project, employeeId, employeeName, message} = JSON.parse(body || "{}");

      if (!project || !employeeId || !employeeName || !message?.trim()) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({error:"invalid_request"}));
      }

      let conversation = null;
      let pageId = null;

      do {
        const qs = new URLSearchParams({limit:"100"});
        if (pageId) qs.set("page_id", pageId);

        const r = await openhands(`/api/conversations/search?${qs}`);
        const data = await r.json();

        conversation = (data.items ?? []).find((candidate) =>
          candidate.tags?.mkddproject === project &&
          (
            candidate.tags?.mkddemployeeid === employeeId ||
            (
              !candidate.tags?.mkddemployeeid &&
              candidate.tags?.mkddemployee === employeeName
            )
          )
        ) ?? null;

        pageId = conversation ? null : (data.next_page_id ?? null);
      } while (!conversation && pageId);

      if (!conversation) {
        const r = await fetch(OPENHANDS + "/api/conversations", {
          method: "POST",
          headers: {
            "X-Session-API-Key": sessionKey(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            workspace: {
              working_dir: project,
              kind: "LocalWorkspace"
            },
            agent_profile_id: employeeId,
            autotitle: false,
            tags: {
              mkddproject: project,
              mkddemployee: employeeName,
              mkddemployeeid: employeeId
            },
            initial_message: {
              role: "user",
              content: [{type:"text", text:message}],
              run: true
            }
          })
        });

        conversation = await r.json();

        res.writeHead(r.status, {"content-type":"application/json"});
        return res.end(JSON.stringify({conversation}));
      }

      const r = await fetch(
        OPENHANDS + `/api/conversations/${conversation.id}/events`,
        {
          method: "POST",
          headers: {
            "X-Session-API-Key": sessionKey(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            role: "user",
            content: [{type:"text", text:message}],
            run: true
          })
        }
      );

      const result = await r.json();

      res.writeHead(r.status, {"content-type":"application/json"});
      return res.end(JSON.stringify({
        conversation_id: conversation.id,
        result
      }));
    }


    if (req.url?.startsWith("/api/chat/events?")) {
      const url = new URL(req.url, "http://mkdd.local");
      const conversationId = url.searchParams.get("conversation");
      const project = url.searchParams.get("project");
      const employeeId = url.searchParams.get("employeeId");
      const employeeName = url.searchParams.get("employeeName");

      if (!conversationId || !project || !employeeId || !employeeName) {
        res.writeHead(400, {"content-type":"application/json"});
        return res.end(JSON.stringify({
          error:"conversation_project_employee_required"
        }));
      }

      let authorizedConversation = null;
      let pageId = null;

      do {
        const qs = new URLSearchParams({limit:"100"});
        if (pageId) qs.set("page_id", pageId);

        const searchResponse = await openhands(
          `/api/conversations/search?${qs}`
        );
        const searchData = await searchResponse.json();

        authorizedConversation = (searchData.items ?? []).find((conversation) =>
          conversation.id === conversationId &&
          conversation.tags?.mkddproject === project &&
          (
            conversation.tags?.mkddemployeeid === employeeId ||
            (
              !conversation.tags?.mkddemployeeid &&
              conversation.tags?.mkddemployee === employeeName
            )
          )
        ) ?? null;

        pageId = authorizedConversation
          ? null
          : (searchData.next_page_id ?? null);
      } while (!authorizedConversation && pageId);

      if (!authorizedConversation) {
        res.writeHead(403, {"content-type":"application/json"});
        return res.end(JSON.stringify({
          error:"conversation_employee_mismatch"
        }));
      }

      let eventsPageId = null;
      let eventsStatus = 200;
      let data = { items: [], next_page_id: null };
      const allEventItems = [];

      do {
        const eventQs = new URLSearchParams({ limit: "100" });
        if (eventsPageId) eventQs.set("page_id", eventsPageId);

        const eventsResponse = await openhands(
          `/api/conversations/${conversationId}/events/search?${eventQs}`
        );

        eventsStatus = eventsResponse.status;
        const pageData = await eventsResponse.json();

        if (!eventsResponse.ok) {
          data = pageData;
          break;
        }

        allEventItems.push(...(pageData.items ?? []));
        eventsPageId = pageData.next_page_id ?? null;
        data = pageData;
      } while (eventsPageId);

      if (eventsStatus >= 200 && eventsStatus < 300) {
        const uniqueEvents = new Map();

        for (const event of allEventItems) {
          if (event?.id) uniqueEvents.set(event.id, event);
        }

        data = {
          ...data,
          items: Array.from(uniqueEvents.values()).sort((a, b) => {
            const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
            const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
            return aTime - bTime;
          }),
          next_page_id: null
        };
      }

      const textContent = (content) =>
        Array.isArray(content)
          ? content
              .filter(item =>
                item &&
                item.type === "text" &&
                typeof item.text === "string"
              )
              .map(item => ({type:"text", text:item.text}))
          : [];

      const normalizeEvent = (event) => {
        const base = {
          id: event.id,
          kind: event.kind,
          source: event.source,
          ...(event.timestamp ? {timestamp:event.timestamp} : {})
        };

        switch (event.kind) {
          case "MessageEvent":
            return {
              ...base,
              llm_message: {
                content: textContent(event.llm_message?.content)
              }
            };

          case "ActionEvent":
            return {
              ...base,
              ...(typeof event.summary === "string"
                ? {summary:event.summary}
                : {}),
              ...(typeof event.tool_name === "string"
                ? {tool_name:event.tool_name}
                : {})
            };

          case "ObservationEvent":
            return {
              ...base,
              ...(typeof event.action_id === "string"
                ? {action_id:event.action_id}
                : {}),
              ...(typeof event.tool_name === "string"
                ? {tool_name:event.tool_name}
                : {}),
              content: textContent(event.observation?.content),
              is_error: event.observation?.is_error === true,
              ...(event.tool_name === "task_tracker" &&
              (event.observation?.command === "view" ||
                event.observation?.command === "plan") &&
              Array.isArray(event.observation?.task_list)
                ? {
                    task_tracker: {
                      command: event.observation.command,
                      task_list: event.observation.task_list
                        .filter(task =>
                          task &&
                          typeof task.title === "string" &&
                          (task.status === "todo" ||
                            task.status === "in_progress" ||
                            task.status === "done")
                        )
                        .map(task => ({
                          title: task.title,
                          notes:
                            typeof task.notes === "string" ? task.notes : "",
                          status: task.status
                        }))
                    }
                  }
                : {})
            };

          case "AgentErrorEvent":
            return {
              ...base,
              ...(typeof event.error === "string"
                ? {error:event.error}
                : {}),
              ...(typeof event.tool_name === "string"
                ? {tool_name:event.tool_name}
                : {})
            };

          case "PauseEvent":
          case "InterruptEvent":
            return base;

          case "UserRejectObservation":
            return {
              ...base,
              ...(typeof event.rejection_reason === "string"
                ? {rejection_reason:event.rejection_reason}
                : {}),
              ...(event.rejection_source === "user" ||
                  event.rejection_source === "hook"
                ? {rejection_source:event.rejection_source}
                : {}),
              ...(typeof event.action_id === "string"
                ? {action_id:event.action_id}
                : {}),
              ...(typeof event.tool_name === "string"
                ? {tool_name:event.tool_name}
                : {})
            };

          case "HookExecutionEvent":
            return {
              ...base,
              ...(typeof event.hook_event_type === "string"
                ? {hook_event_type:event.hook_event_type}
                : {}),
              ...(typeof event.tool_name === "string"
                ? {tool_name:event.tool_name}
                : {}),
              ...(typeof event.success === "boolean"
                ? {success:event.success}
                : {}),
              ...(typeof event.blocked === "boolean"
                ? {blocked:event.blocked}
                : {}),
              ...(typeof event.exit_code === "number"
                ? {exit_code:event.exit_code}
                : {}),
              ...(typeof event.reason === "string"
                ? {reason:event.reason}
                : {}),
              ...(typeof event.error === "string"
                ? {error:event.error}
                : {})
            };

          default:
            return null;
        }
      };

      data.items = (data.items ?? [])
        .map(normalizeEvent)
        .filter(Boolean);

      const latestTracker = [...data.items].reverse().find(event => event.kind === "ObservationEvent" && event.tool_name === "task_tracker" && event.task_tracker)?.task_tracker ?? null;
      const tasks = latestTracker?.task_list ?? [];
      if (tasks.length === 0) {
        data.work_plan = null;
      } else {
        const counts = {
          total: tasks.length,
          todo: tasks.filter(task => task.status === "todo").length,
          inProgress: tasks.filter(task => task.status === "in_progress").length,
          done: tasks.filter(task => task.status === "done").length
        };
        data.work_plan = {
          tasks,
          counts,
          progressPercent: Math.round((counts.done / counts.total) * 100)
        };
      }
      res.writeHead(eventsStatus, {"content-type":"application/json"});
      return res.end(JSON.stringify(data));
    }

    res.writeHead(404, {"content-type":"application/json"});
    res.end(JSON.stringify({error:"not_found"}));
  } catch (e) {
    const workflowErrors = new Set([
      "invalid_gate",
      "gate_not_current",
      "open_blockers_exist",
      "unverified_findings_exist",
    "mandatory_reviews_incomplete",
      "title_createdBy_required",
      "blockerId_resolvedBy_required",
      "blocker_not_found",
      "blocker_already_resolved",
      "invalid_blocker_action",
      "title_reviewer_required",
      "finding_not_found",
      "fixedBy_required",
      "reviewer_cannot_fix_own_finding",
      "finding_not_open",
      "verifiedBy_required",
      "same_reviewer_must_verify",
      "finding_not_ready_for_verification",
      "invalid_finding_action",
      "invalid_workflow_state",
      "invalid_current_gate"
    ]);

    const status = workflowErrors.has(e.message) ? 409 : 502;

    res.writeHead(status, {"content-type":"application/json"});
    res.end(JSON.stringify({error:e.message}));
  }
}).listen(8787, "0.0.0.0", () => console.log("MKDD backend ready on 8787"));
