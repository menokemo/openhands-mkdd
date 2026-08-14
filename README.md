# MKDD × OpenHands Agent Canvas

> **Project status:** Active development / internal platform prototype  
> **Snapshot date:** 2026-08-13  
> **Primary runtime:** Docker Compose on Linux  
> **Frontend:** React 19 + TypeScript + Vite  
> **Backend integration layer:** Node.js 22  
> **Agent runtime:** Customized OpenHands Agent Canvas / Agent Server

---

## 1. Executive Summary

MKDD is an internal AI software-company operating system built on top of **OpenHands Agent Canvas**.

The project is not intended to replace OpenHands. OpenHands remains the agent runtime, conversation engine, workspace execution environment, tool interface, and low-level agent platform. MKDD adds a company-oriented product layer around it:

- Projects instead of raw workspaces.
- Named AI employees instead of anonymous agent sessions.
- A fixed software-delivery workflow.
- Approval gates.
- Mandatory review roles.
- Per-project, per-employee conversations.
- Team status, work plans, activity, cost, blockers, findings, reviews, and approvals.
- A mobile-first daily operating UI that hides OpenHands implementation complexity from normal company workflow.

The product goal is that a human owner can run an AI software company from one UI while OpenHands performs the actual agent work underneath.

```text
MKDD
  ↓
Company workflow / identity / governance / project UI
  ↓
OpenHands Agent Canvas / Agent Server
  ↓
Agent execution / conversations / tools / workspace
  ↓
Project repository / GitHub
```

A core architectural principle is:

> **GitHub is the source of truth for project code. OpenHands is the execution engine. MKDD is the company/workflow layer.**

---

## 2. Why This Project Exists

OpenHands provides a capable general-purpose software-agent environment, but MKDD needs a higher-level operating model that behaves like a structured software company.

The desired experience is not:

```text
OpenHands → start a generic conversation → ask an agent to do everything
```

It is:

```text
Project
  ├── Product Manager
  ├── Business Analyst
  ├── UI/UX
  ├── Architect
  ├── Implementation
  ├── Integration
  ├── QA
  ├── Test Automation
  ├── Code Review
  ├── Security Review
  ├── DevOps/SRE
  ├── Technical Writer
  └── Release Manager
```

Each employee has:

- A stable identity.
- A role.
- Role-specific instructions.
- A dedicated Agent Profile.
- A dedicated conversation for each project.
- Independent work/activity/status.
- Role-specific responsibility in the delivery workflow.

MKDD adds governance around these agents so that software work follows an explicit process instead of relying on a single unrestricted conversation.

---

## 3. Product Model

### 3.1 Project

The intended mapping is:

```text
1 MKDD Project
=
1 OpenHands Workspace
=
1 GitHub repository
```

A project is the main business-level unit visible to the user.

The normal navigation is:

```text
Projects
  ↓
Project Home
  ↓
Employee Chat
```

### 3.2 Employee

An MKDD employee is a named software role backed by an OpenHands Agent Profile.

The 13 primary employees are:

| # | Employee | Role ID | Responsibility |
|---|---|---|---|
| 1 | Bagosh | `product-manager` | Product Manager |
| 2 | Mina | `business-analyst` | Business Analyst |
| 3 | Mariam | `ui-ux` | UI/UX |
| 4 | Shenouda | `architect` | Software Architect |
| 5 | Kirollos | `implementation` | Implementation Engineer |
| 6 | Marina | `integration-engineer` | Integration Engineer |
| 7 | Fady | `qa` | QA |
| 8 | George | `test-automation` | Test Automation |
| 9 | Verena | `code-review` | Code Review |
| 10 | Mikhail | `security-review` | Security Review |
| 11 | Antonious | `devops` | DevOps / SRE |
| 12 | Nader | `technical-writer` | Technical Writer |
| 13 | Abanoub | `release-manager` | Release Manager |

The runtime assets also currently contain:

```text
company-agents-definitions/company-orchestrator.md
```

That definition exists in the project assets, but its final product-level role should remain explicit rather than silently counting it as one of the 13 primary visible employees.

---

## 4. Company Workflow

MKDD intentionally imposes a gated software-delivery process.

The four gates are:

1. **Requirements**
2. **UI/UX**
3. **Architecture**
4. **Production**

### 4.1 Mandatory workflow rules

The current design rules are:

- No implementation/coding before the Architecture gate is approved.
- No production release before the Production gate is approved.
- QA review is mandatory.
- Test Automation review is mandatory.
- Code Review is mandatory.
- Security Review is mandatory.
- A reviewer must not fix their own finding.
- When a finding is fixed, the same reviewer who created the finding must verify it.
- A merge must not happen without explicit owner approval.
- Open blockers prevent gate advancement.
- Unverified findings prevent gate advancement where applicable.
- Mandatory reviews must be complete before Production approval.

These are product rules, not suggestions.

---

## 5. Workflow Persistence

Workflow state is handled by the MKDD backend.

Relevant implementation:

```text
server/workflow-state.mjs
```

The runtime is designed to persist workflow state under:

```text
/mkdd-data
```

with the Docker mount:

```yaml
./mkdd-data:/mkdd-data
```

The workflow store is intentionally separate from OpenHands conversation history because workflow gates, findings, blockers, approvals, and business governance belong to MKDD rather than to the agent runtime.

---

## 6. Main User Experience

### 6.1 Projects Screen

The Projects screen is the user's entry point.

Its responsibility is to present MKDD projects without exposing unnecessary OpenHands internals.

### 6.2 Project Home

Project Home is intended to be the operational dashboard for one software project.

It should expose:

- Project identity.
- Current workflow gate.
- Gate state.
- Approval state.
- Mandatory reviews.
- Blockers.
- Findings.
- Team members.
- Which employee is currently working.
- What each employee is working on.
- Execution status.
- Work plan.
- Cost/usage.
- Activity.
- Project progress.
- Owner actions.

The current UI contains a working baseline for several of these sections, but final visual design and interaction polish are not complete.

### 6.3 Employee Chat

Clicking an employee opens that employee's dedicated conversation for the selected project.

There is intentionally **no group chat**.

The isolation unit is:

```text
project + employee
```

This prevents one employee conversation from becoming a shared unstructured workspace for the whole company.

---

## 7. Conversation Isolation

MKDD conversations are tagged in OpenHands.

Current tags include:

```text
mkddproject
mkddemployee
mkddemployeeid
```

The intended matching rule is:

1. Match by project.
2. Match by stable employee ID.
3. Support exact employee-name fallback only for legacy conversations that do not yet contain `mkddemployeeid`.

This is important because display names can change while IDs should remain stable.

### Security note

Current isolation is primarily **application-level conversation isolation**.

It must not be described as complete authenticated multi-user authorization yet.

At the current stage:

- `employeeId` and `employeeName` originate from the client.
- There is no complete authenticated actor/owner identity model yet.
- Backend validation checks that a requested conversation belongs to the requested MKDD project/employee combination.
- A stronger user authentication and authorization layer is still required before treating this as a hardened multi-user production system.

---

## 8. OpenHands Integration

### 8.1 Responsibility boundary

OpenHands remains responsible for:

- Agent conversations.
- Agent execution.
- Tool calls.
- Workspace access.
- Runtime events.
- Conversation execution status.
- Usage/cost metrics.
- Task tracker events.
- Agent Server APIs.

MKDD is responsible for:

- Employee identity.
- Company workflow.
- Project-level navigation.
- Business approvals.
- Review policy.
- Safe normalization of OpenHands data for the MKDD UI.
- Hiding implementation details that are not useful to the owner.

### 8.2 Current OpenHands service

Docker Compose currently uses:

```yaml
image: mkdd/agent-canvas:1.12.0-mkdd2
```

Container:

```text
openhands-agent-canvas
```

Exposed ports:

```text
3000
8000
```

MKDD talks to the Agent Server internally through:

```text
http://agent-canvas:8000
```

using:

```yaml
OPENHANDS_URL: http://agent-canvas:8000
```

---

## 9. Customized OpenHands Agent Canvas Source

Customized source tree:

```text
/opt/openhands-mkdd-src
```

Observed Git state at this snapshot:

```text
Branch: mkdd-agent-profile-instructions
HEAD:   4d0fe4983
```

Current uncommitted working-tree modification:

```text
src/components/features/settings/agent-profiles/agent-profiles-local-view.tsx
```

The active customization is related to Agent Profile instructions, specifically exposing/editing a profile-level system message suffix in the Agent Profiles UI.

The working file currently contains state handling such as:

```text
systemMessageSuffix
```

and loads/saves the profile's:

```text
system_message_suffix
```

This allows MKDD employee identity/instructions to be associated with OpenHands Agent Profiles instead of injecting ad-hoc identity text into every user message.

### Why this matters

Employee identity should belong to the employee's Agent Profile.

It should not depend on:

- Repeating a role prompt in every conversation.
- User-visible chat text.
- Hard-coded frontend prompt prefixes.
- A generic single-agent profile shared by all employees.

The target is a clean model:

```text
Employee definition
  ↓
OpenHands Agent Profile
  ↓
system_message_suffix / profile instructions
  ↓
Dedicated project conversation
```

---

## 10. Company Agent Definitions

Agent definition files currently exist under:

```text
company-agents-definitions/
```

Observed files:

```text
architect.md
business-analyst.md
code-review.md
company-orchestrator.md
devops.md
implementation.md
integration-engineer.md
product-manager.md
qa.md
release-manager.md
security-review.md
technical-writer.md
test-automation.md
ui-ux.md
```

Docker mounts them into Agent Canvas as:

```yaml
/opt/openhands/company-agents-definitions:/home/openhands/.agents/agents
```

These files are part of the product's behavioral configuration and should be version controlled.

---

## 11. Company Skills

Role-specific skills live under:

```text
company-skills/
```

Observed role skill folders:

```text
architect/
business-analyst/
code-review/
devops/
implementation/
integration-engineer/
product-manager/
qa/
release-manager/
security-review/
technical-writer/
test-automation/
ui-ux/
```

Each currently contains:

```text
SKILL.md
```

Docker mounts the skills read-only:

```yaml
/opt/openhands/company-skills:/home/openhands/.agents/skills:ro
```

The separation between agent definitions and skills is intentional:

- **Agent definition:** identity and responsibility.
- **Skill:** reusable role capability/instructions.

---

## 12. MKDD UI Technology

Application directory:

```text
/opt/openhands/projects/mkdd-ui
```

Main stack:

- React 19
- React DOM 19
- TypeScript
- Vite
- React Markdown
- Node.js 22 backend
- Docker
- `ws` package added for the planned secure WebSocket proxy

The application container exposes:

```text
5173  → Vite UI
8787  → MKDD Node backend
```

Current Dockerfile:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 5173 8787
CMD ["sh","-lc","node server/index.mjs & npm run dev -- --host 0.0.0.0"]
```

This is currently a development-style runtime, not a final production web-server layout.

A production packaging pass is still required.

---

## 13. Current Runtime Composition

The current Docker Compose model is:

```text
agent-canvas
    ↕
mkdd-ui
```

Important details:

### Agent Canvas

```yaml
container_name: openhands-agent-canvas
restart: unless-stopped
ports:
  - "8000:8000"
  - "3000:3000"
```

### MKDD

```yaml
container_name: mkdd-ui
restart: unless-stopped
environment:
  OPENHANDS_URL: http://agent-canvas:8000
ports:
  - "5173:5173"
  - "8787:8787"
```

### Shared PID namespace

MKDD currently uses:

```yaml
pid: "service:agent-canvas"
```

This exists because the current backend discovers the OpenHands session API key by inspecting process command lines in `/proc`.

That mechanism is functional, but it is **technical debt**.

It should not be considered the final authentication architecture.

---

## 14. Current Session-Key Mechanism

The MKDD backend currently has a helper that scans `/proc`, looks for the Agent Canvas static-server process, locates:

```text
--session-api-key
```

and reads the following process argument.

The key is then used server-side with:

```text
X-Session-API-Key
```

when making Agent Server REST requests.

### Positive property

The normalized conversation API does **not** intentionally return the session API key to the browser.

### Problem

The current discovery method is fragile because it depends on:

- Shared PID namespace.
- Process command-line shape.
- A particular launcher/process name.
- Runtime implementation details outside the MKDD API contract.

### Target

The key should remain server-side, but key acquisition should eventually use a stable supported configuration/secret mechanism instead of `/proc` inspection.

---

## 15. Backend API Layer

The backend lives primarily in:

```text
server/index.mjs
```

It acts as a security and normalization layer between the browser and OpenHands.

Important responsibilities include:

- Project lookup.
- Employee lookup.
- Conversation lookup.
- Conversation ownership validation.
- Sending messages.
- Fetching conversation events.
- Normalizing safe event fields.
- Deriving work-plan data.
- Returning cost/status information.
- Workflow APIs.
- Branding.

Key chat-related routes currently include:

```text
GET  /api/conversation
POST /api/chat/send
GET  /api/chat/events
```

The backend must not become a raw OpenHands-event passthrough.

---

## 16. Safe Event Normalization

One important security rule is:

> MKDD must expose only the data needed by its UI.

The backend currently normalizes selected OpenHands event types.

Supported/safe categories include:

- `MessageEvent`
- `ActionEvent`
- `ObservationEvent`
- `AgentErrorEvent`
- `PauseEvent`
- `InterruptEvent`
- `UserRejectObservation`
- `HookExecutionEvent`

The UI must not expose hidden chain-of-thought or blindly proxy raw internal agent state.

### Activity panel principle

User-visible agent activity is allowed and useful.

Hidden model reasoning is not required for the product and should not be surfaced.

The Activity UI should show safe operational facts such as:

- Tool name.
- Action summary.
- Error state.
- Pause/interrupt state.
- Task tracker changes.
- User rejection.
- Hook execution result.

---

## 17. Work Plan

Work Plan data is intentionally derived from real OpenHands `task_tracker` activity.

It must not be fabricated.

MKDD looks for task-tracker observation events with commands such as:

```text
view
plan
```

and valid task statuses:

```text
todo
in_progress
done
```

The UI derives:

- Total tasks.
- Todo.
- In progress.
- Done.
- Progress percentage.

The percentage is an MKDD UI calculation from real task states, not an OpenHands-provided official project completion metric.

---

## 18. Cost / Usage

Employee cost data comes from real conversation statistics.

The normalized MKDD model includes data such as:

- Model name.
- Accumulated cost.
- Prompt tokens.
- Completion tokens.
- Cache-read tokens.
- Cache-write tokens.
- Reasoning-token accounting when present.

The product rule is:

> Never display invented cost numbers.

If metrics are unavailable, the UI should show unavailable/unknown rather than fabricate values.

---

## 19. Execution Status

The current known execution status model includes:

```text
idle
running
paused
waiting_for_confirmation
finished
error
stuck
deleting
```

Expected UX:

- `running` → employee may show a green busy/working pulse.
- `waiting_for_confirmation` → owner action required; should not be represented as ordinary active work.
- `paused` → distinct paused state.
- `error` / `stuck` → visible attention state.

Status should come from OpenHands, not from frontend guesses.

---

## 20. Data Stability Principle

A major product requirement discovered during testing is:

> **Confirmed data must not disappear just because a refresh request temporarily fails.**

The UI should behave like a reliable messaging/productivity app:

- Keep last-known-good data visible.
- Refresh in the background.
- Merge updates into existing state.
- Do not replace valid data with blank/null during transient API failures.
- Only show full loading state when no confirmed data exists yet.
- Avoid screen flicker caused by periodic refreshes.

This principle applies to:

- Workflow state.
- Current gate.
- Team status.
- Messages.
- Activity.
- Work Plan.
- Cost.
- Execution status.
- Reviews.
- Findings.
- Blockers.

---

## 21. Stability Work Already Done

### 21.1 Workflow flicker

The Project Home workflow hook was changed to use last-known-good behavior.

The earlier behavior toggled loading on every periodic refresh, causing gate information such as `Pending` to disappear and reappear.

The updated design:

- Loads visibly only on initial fetch.
- Refreshes silently in the background.
- Keeps last successful workflow state after transient errors.
- Avoids overlapping refresh calls.

This fixed the observed gate flicker.

### 21.2 Team status

`useProjectTeamStatus` was also refactored toward last-known-good behavior.

The goal is to preserve previous employee state if one background request fails rather than replacing an employee card with empty values.

However, intermittent employee-information disappearance is **not fully solved yet** and remains an active issue.

---

## 22. Current Chat Architecture

The current MKDD chat implementation is still transitionary.

At the moment it uses REST event history requests and repeated polling.

The current hook has used:

- Initial conversation lookup.
- REST event history load.
- Background event polling.
- Additional polling after sending a message.
- Merge-by-event-ID behavior.

This is better than replacing the entire event list blindly, but it is not the intended final realtime architecture.

### Why it is a problem

Repeated full history retrieval is expensive and introduces unnecessary delay.

Observed behavior:

- User messages now often appear.
- Agent replies can appear significantly later in MKDD than in the real OpenHands Agent Canvas UI.
- Conversation content can still sometimes disappear.
- Employee information can still intermittently disappear.
- Refreshing the browser does not always immediately restore missing information.

This confirms that the current polling architecture is not sufficient.

---

## 23. Important Chat Bugs Found

### 23.1 Events response status regression — fixed

After adding full event pagination, the route accidentally attempted to use an outdated response variable when returning the final event payload.

That could cause the backend to successfully fetch events and then fail while sending the response.

This regression was fixed and deployed.

After that fix, chat behavior improved: messages began appearing more often.

### 23.2 Health response status regression — fixed

The health route accidentally referenced the chat event status variable.

It was changed back to the health request's own response status.

### 23.3 Message content normalization mismatch — identified, not yet completed

Current MKDD normalization accepts message content when it is an array of text-content objects.

OpenHands Agent Canvas code also supports message content that arrives directly as a string.

The current MKDD helper still needs to be refactored so both formats are normalized:

```text
string
or
[{ type: "text", text: "..." }]
```

A refactor attempt was started but intentionally stopped after the scripted edit failed to find the exact source anchor.

The file was not blindly patched after that failure.

This remains a known pending fix.

---

## 24. Realtime Architecture Target

The target should match the architecture pattern used by Agent Canvas:

```text
Initial history
    ↓ REST
Browser state
    ↓
Live events
    ↓ WebSocket
Merge by event ID
    ↓
Reconnect / recovery
```

The desired MKDD implementation is:

```text
Browser
  │
  │ WebSocket to MKDD
  ▼
MKDD backend
  │
  │ authenticated WebSocket
  ▼
OpenHands Agent Server
```

### Why proxy through MKDD

The browser should **not** receive the OpenHands session API key.

The backend should:

1. Validate the requested project.
2. Validate employee identity.
3. Validate that the requested conversation belongs to that project/employee.
4. Open the OpenHands event WebSocket.
5. Authenticate upstream server-side.
6. Normalize events.
7. Forward only safe MKDD event payloads to the browser.
8. Reconnect/recover when required.

---

## 25. WebSocket Work Already Prepared

The `ws` dependency has been added to the MKDD project.

`package.json` and `package-lock.json` are therefore currently modified.

Vite has also been prepared with a WebSocket proxy entry for:

```text
/ws
```

targeting:

```text
ws://localhost:8787
```

with WebSocket proxying enabled.

### Not implemented yet

The MKDD backend WebSocket server/proxy itself has **not** been completed yet.

The frontend has also not yet been switched from polling to the final live WebSocket model.

Therefore:

> The presence of the `ws` package and Vite `/ws` proxy does not mean realtime chat is complete.

---

## 26. Planned Chat Refactor

The clean refactor path is:

### Phase A — shared normalization

Move:

```text
textContent
normalizeEvent
```

out of the REST route and make them top-level reusable backend helpers.

The same helper must be used by:

- REST history.
- WebSocket live events.

This prevents REST and WebSocket behavior from drifting.

### Phase B — fix string message content

Support both string and structured text content.

### Phase C — secure backend WebSocket bridge

Add a dedicated WebSocket server to the existing Node HTTP server.

### Phase D — frontend live subscription

`useConversation` should:

- Load history once.
- Establish live connection.
- Merge events by ID.
- Reconnect with backoff.
- Keep last-known-good state.
- Use REST only for recovery/fallback.

### Phase E — optimistic user message

A sent user message should be visible immediately and then reconciled with the server echo.

### Phase F — remove aggressive polling

Once live event transport is proven reliable, repeated full-history polling should no longer be the primary transport.

---

## 27. Current Employee-Information Disappearance

This is still an unresolved issue.

Observed symptom:

- Employee information sometimes disappears.
- It can remain missing across browser refreshes.
- The behavior feels linked to timing/state rather than permanent data deletion.

Known areas to investigate:

1. Background team-status polling behavior.
2. Transient conversation lookup failures.
3. State replacement with partial responses.
4. React hook dependencies that may restart data loading when object identity changes.
5. Inconsistent representation of “no value” versus “request failed”.
6. Conversation metadata timing while an OpenHands run is active.
7. Execution-state updates arriving independently from conversation history.

### Important design rule for the fix

A failed request and a legitimate empty value must be represented differently.

For example:

```text
fetch failed
≠
employee has no current work plan
```

If both become `null`, the UI cannot know whether it should preserve the old value or intentionally clear it.

This should be fixed using explicit success/error/update semantics rather than more UI conditionals.

---

## 28. Frontend Hooks

Important hooks currently include:

```text
src/hooks/useConversation.ts
src/hooks/useProjectNavigation.ts
src/hooks/useProjectTeamStatus.ts
src/hooks/useProjectWorkflow.ts
```

### `useConversation`

Responsible for:

- Conversation lookup.
- Event history.
- Messages.
- Activity.
- Work Plan.
- Sending messages.
- Current polling/recovery behavior.

This is a major current refactor target.

### `useProjectTeamStatus`

Responsible for aggregated per-employee status on Project Home.

It has already moved toward last-known-good updates but still requires hardening.

### `useProjectWorkflow`

Introduced to separate workflow loading from main screen rendering.

It now keeps valid workflow information visible during background refreshes.

---

## 29. Frontend Screens

Current main screens:

```text
src/screens/ProjectsScreen.tsx
src/screens/ProjectHomeScreen.tsx
src/screens/ChatScreen.tsx
```

Additional important components:

```text
src/components/EmployeeInsightsPanel.tsx
src/components/WorkPlanPanel.tsx
```

The app intentionally moved away from keeping every concern inside `App.tsx`.

This separation should continue.

---

## 30. UI Direction

The current Project Home has a dark, mobile-first baseline.

Current intent:

- Compact project summary.
- Horizontally scrollable gates on small screens.
- Review cards.
- Team cards.
- Employee status.
- Mobile-first layout.
- Desktop enhancement rather than desktop-only design.

The current visual design is **not considered final**.

Reliability and data architecture currently have higher priority than further visual polish.

---

## 31. Branding

Current branding asset:

```text
mkdd-data/branding/mkdd-logo.png
```

The backend exposes the logo through a branding endpoint rather than hard-coding image data into the React bundle.

---

## 32. Language

The UI is intended to support both:

- Arabic
- English

Relevant frontend area:

```text
src/i18n/
```

Current files include:

```text
translations.ts
useLanguage.ts
```

The project should remain portable and avoid language-specific hard-coding inside business logic.

---

## 33. Current Repository State — MKDD UI

At the documented snapshot, `mkdd-ui` has uncommitted work.

Observed modified files:

```text
package-lock.json
package.json
server/index.mjs
server/workflow-state.mjs
src/App.css
src/App.tsx
src/api/client.ts
src/hooks/useConversation.ts
src/hooks/useProjectTeamStatus.ts
src/screens/ProjectHomeScreen.tsx
vite.config.ts
```

Observed new/untracked file:

```text
src/hooks/useProjectWorkflow.ts
```

This means the current working tree contains important development state that must be preserved before any reset/rebase/cleanup.

---

## 34. Known MKDD Development Milestones

Known development checkpoints include:

```text
0603ec6  work plan
88ea121  cost/activity
9dac98c  project team dashboard
2473c01  persist workflow state and isolate employee chats
```

These are useful historical anchors but should not be treated as the complete changelog.

There is additional uncommitted work after these milestones.

---

## 35. Current Repository State — Customized Agent Canvas

Path:

```text
/opt/openhands-mkdd-src
```

Observed state:

```text
Branch: mkdd-agent-profile-instructions
HEAD: 4d0fe4983
```

Current uncommitted file:

```text
src/components/features/settings/agent-profiles/agent-profiles-local-view.tsx
```

A stray accidental file named:

```text
udo git diff --check
```

was discovered during cleanup and removed. It is not part of the project.

---

## 36. Runtime File Layout

The operational VM currently uses:

```text
/opt/openhands/
├── compose.yml
├── manage-openhands.sh
├── company-agents-definitions/
├── company-skills/
├── mkdd-data/
├── projects/
│   └── mkdd-ui/
└── ...
```

Customized OpenHands source is currently separate:

```text
/opt/openhands-mkdd-src
```

For a GitHub backup bundle, a clean repository layout could be:

```text
mkdd-openhands/
├── README.md
├── compose.yml
├── manage-openhands.sh
├── company-agents-definitions/
├── company-skills/
├── mkdd-data/
│   └── branding/
├── mkdd-ui/
└── openhands-mkdd-src/
```

If the full OpenHands source is included inside the same GitHub repository, do **not** carry its nested `.git` directory into the parent repository.

A cleaner long-term approach may be a dedicated OpenHands fork/submodule, but the immediate priority is preserving the complete current source state.

---

## 37. Docker Volumes and Data

Current Agent Canvas persistent volume:

```yaml
openhands_state:
  name: openhands_agent_canvas_state
```

Mounted as:

```text
/home/openhands/.openhands
```

This volume may contain runtime settings, provider configuration, credentials, conversation-related state, or other private environment data.

### Do not publish this volume

It should **not** be copied into a public GitHub repository.

Source/config that belongs in Git:

```text
compose.yml
manage-openhands.sh
mkdd-ui/
company-agents-definitions/
company-skills/
branding assets intended for the product
customized OpenHands source
```

Runtime/private data does not belong in Git.

---

## 38. GitHub / Backup Exclusions

The source archive should normally exclude:

```text
.git/
node_modules/
dist/
build caches
Python __pycache__/
temporary local backups
session keys
provider secrets
runtime OpenHands state
Docker volume contents
logs
temporary test artifacts
```

The current MKDD project also contains:

```text
.local-backups/
```

Those files are useful locally during development but should not be part of the canonical GitHub source unless intentionally archived elsewhere.

---

## 39. OpenHands Source Size

The customized OpenHands source directory was observed at approximately:

```text
1.5 GB
```

That size includes more than the minimal source changes and may include repository history and/or build artifacts.

Before uploading as a normal GitHub directory, it should be exported cleanly.

Do not simply zip the entire directory blindly.

Potential GitHub problems include:

- Large repository size.
- Nested `.git`.
- Build output.
- Cached dependencies.
- Upstream history duplication.
- Files that belong to upstream rather than MKDD.
- License boundaries.

---

## 40. Licensing Note

OpenHands is an upstream open-source project and its license files must be preserved.

If the complete upstream source is redistributed, the repository must retain applicable upstream licensing notices.

Also review any upstream directories with licensing terms different from the main open-source code before publishing a full source mirror.

A fork is often cleaner than copying an upstream repository into an unrelated repository.

---

## 41. `manage-openhands.sh`

Current management script:

```bash
#!/usr/bin/env bash
set -e
cd /opt/openhands
case "${1:-status}" in
  start)   docker compose up -d ;;
  stop)    docker compose stop ;;
  restart) docker compose restart ;;
  status)  docker compose ps ;;
  logs)    docker compose logs -f --tail=150 ;;
  update)
    docker compose pull
    docker compose up -d
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|update}"
    exit 1
    ;;
esac
```

It does not currently contain visible embedded credentials.

---

## 42. Build and Validation

The host VM does not need a local Node.js installation for MKDD validation.

A Node 22 Docker image is used for reproducible checks.

Typical frontend build validation:

```bash
cd /opt/openhands/projects/mkdd-ui
sudo docker run --rm \
  -v "$PWD":/app \
  -w /app \
  node:22-alpine \
  sh -lc 'npm ci >/dev/null && npm run build'
```

Backend syntax validation:

```bash
cd /opt/openhands/projects/mkdd-ui
sudo docker run --rm \
  -v "$PWD":/app \
  -w /app \
  node:22-alpine \
  node --check server/index.mjs
```

Deployment of the MKDD container:

```bash
cd /opt/openhands
sudo docker compose build mkdd-ui
sudo docker compose up -d mkdd-ui
```

---

## 43. Current Access

Current VM LAN address used during development:

```text
192.168.2.18
```

MKDD UI:

```text
http://192.168.2.18:5173
```

This address is environment-specific and should not be hard-coded into application logic.

---

## 44. Current Compose Reproducibility Gap

The current Compose file references:

```text
mkdd/agent-canvas:1.12.0-mkdd2
```

as an image.

It does not currently define a build context for that custom Agent Canvas image.

Therefore a clean machine cannot necessarily reproduce the full environment from `compose.yml` alone unless that image:

- already exists locally, or
- is available from an accessible image registry.

### Required future improvement

Document and automate the custom Agent Canvas image build from:

```text
openhands-mkdd-src
```

A clean restore should eventually be possible using only:

1. Git clone.
2. Environment/secret setup.
3. Image build.
4. `docker compose up`.

---

## 45. Production Readiness Gaps

The project is not production-ready yet.

Major remaining areas include:

### Realtime

- Complete secure WebSocket proxy.
- Replace aggressive chat polling.
- Realtime execution-state updates.
- Reconnection and recovery.

### Stability

- Eliminate employee-data disappearance.
- Distinguish fetch failure from real empty/null values.
- Remove remaining state reset/flicker paths.

### Authentication / Authorization

- Authenticated owner/user identity.
- Server-side authorization based on actor identity.
- Do not rely only on client-supplied `employeeId`/`employeeName`.

### Security review

Review response exposure from:

```text
/api/chat/send
/api/employees
/api/projects
```

and ensure only intended normalized data is returned.

### Runtime secrets

Replace `/proc` session-key discovery with a supported secret/configuration mechanism.

### Packaging

- Production frontend build.
- Production static server/reverse proxy.
- Health checks.
- Better container process supervision.
- Automated custom Agent Canvas image build.

### Testing

- Backend API tests.
- Conversation isolation tests.
- Workflow transition tests.
- Review-rule tests.
- WebSocket tests.
- Frontend state/reconnect tests.
- End-to-end project/employee chat tests.

### CI

- Build.
- Lint.
- Tests.
- Secret scanning.
- Dependency checks.

### PWA

PWA work is intentionally deferred until the application architecture and production packaging are stable.

---

## 46. Security Principles

MKDD should follow these rules as development continues:

1. Never expose the OpenHands session API key to the browser.
2. Never persist secrets in Git.
3. Never log secrets.
4. Never proxy raw internal OpenHands event objects without normalization.
5. Never expose hidden chain-of-thought.
6. Authorize project/employee conversation access on the backend.
7. Use stable employee IDs as the primary identity.
8. Keep GitHub/project code as the source of truth.
9. Keep workflow state under explicit MKDD control.
10. Treat current PID-based session-key discovery as temporary.
11. Treat client-supplied identity fields as untrusted until real authentication exists.

---

## 47. Data Integrity Principles

The UI should never invent data to look complete.

### Do not fabricate

- Work plans.
- Cost.
- Progress.
- Agent status.
- Review results.
- Findings.
- Approval identity.
- Activity.

### Display only

- Real OpenHands task tracker data.
- Real OpenHands usage metrics.
- Real execution status.
- Persisted MKDD workflow state.
- Explicit reviews/findings/blockers.
- Explicit owner approvals.

---

## 48. Architectural Direction

The desired production architecture is:

```text
                    ┌─────────────────────────┐
                    │       MKDD Browser      │
                    │ React / TypeScript UI   │
                    └────────────┬────────────┘
                                 │
                      REST + MKDD WebSocket
                                 │
                    ┌────────────▼────────────┐
                    │      MKDD Backend       │
                    │ auth / workflow /       │
                    │ validation / normalize  │
                    └────────────┬────────────┘
                                 │
                      REST + authenticated WS
                                 │
                    ┌────────────▼────────────┐
                    │ OpenHands Agent Server  │
                    │ conversations / events │
                    │ tools / execution       │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ Project Workspace / Git │
                    └─────────────────────────┘
```

MKDD should depend on supported OpenHands APIs and event contracts, not on internal implementation details wherever avoidable.

---

## 49. Why Realtime Must Be Event-Driven

The user experience target is comparable to a modern messaging app:

- Existing messages remain visible.
- New messages arrive immediately.
- Agent replies appear as soon as OpenHands produces them.
- Connection interruptions do not wipe the conversation.
- Reconnect merges missed events instead of reloading the entire UI.
- Status changes update in place.
- Background refresh does not flash blank states.

Repeated full-history polling does not meet that standard.

This is why the current priority is a secure OpenHands-event WebSocket integration rather than further increasing polling frequency.

---

## 50. Current Exact Development Blocker

At the time of this snapshot, development is paused at the backend event-normalization/WebSocket refactor.

The intended next technical steps are:

1. Locate exact current source anchors for:
   - `textContent`
   - `normalizeEvent`
   - REST `data.items` normalization
2. Move the normalizer to reusable top-level helpers.
3. Add string-content handling.
4. Validate backend syntax.
5. Add MKDD WebSocket server using the installed `ws` package.
6. Reuse the same project/employee/conversation authorization logic.
7. Connect upstream to the OpenHands event socket.
8. Authenticate upstream server-side.
9. Forward only normalized safe events.
10. Update `useConversation` to REST-history + live-events.
11. Remove primary full-history polling.
12. Harden employee team-state updates.

No blind large scripted replacement should be applied if source anchors do not match.

---

## 51. Current Observed Product State

### Working / substantially implemented

- Projects UI.
- Project Home.
- Employee-specific navigation.
- 13 employee model.
- Dedicated project/employee conversations.
- Conversation tagging/isolation.
- Workflow gates.
- Persistent workflow state.
- Mandatory review roles.
- Blockers/findings model.
- Real Work Plan extraction.
- Real conversation cost/usage extraction.
- Safe activity normalization.
- Team status dashboard.
- Mobile-first baseline UI.
- Arabic/English structure.
- Last-known-good workflow loading.
- Improved team-state persistence.
- Event history pagination.
- Chat status-response regression fixes.
- Vite WebSocket proxy preparation.
- `ws` dependency preparation.

### Partially working

- Chat synchronization.
- Agent reply timing.
- Employee state reliability.
- Activity live updates.
- Execution status freshness.
- Work Plan freshness.
- Cost freshness.

### Not complete

- MKDD backend WebSocket proxy.
- Final realtime frontend subscription.
- Strong authenticated user/owner model.
- Production packaging.
- Full CI/test suite.
- Final UI/UX.
- Clean-machine custom Agent Canvas image build.
- PWA.
- Final security hardening.

---

## 52. Development Priorities

Recommended order:

### P0 — Data correctness and realtime

- Finish event normalizer.
- Finish secure WebSocket bridge.
- Make chat realtime.
- Stop destructive/expensive polling.
- Fix disappearing employee state.

### P1 — Authorization and workflow integrity

- Add authenticated actor/owner identity.
- Enforce approvals server-side.
- Harden endpoint data exposure.
- Test project/employee isolation.

### P2 — Production architecture

- Stable secrets mechanism.
- Production container/process model.
- Reproducible custom Agent Canvas build.
- CI and automated tests.

### P3 — UX completion

- Owner action controls.
- Better status visualization.
- Activity drawer refinement.
- Error/reconnect states.
- Final responsive visual design.

### P4 — PWA / distribution

Only after P0–P3 are stable.

---

## 53. What Must Be Preserved During Refactors

Do not lose these decisions:

- Project = Workspace = Git repository.
- Dedicated employee conversation per project.
- Stable employee ID is primary identity.
- No group chat.
- Four workflow gates.
- Mandatory QA/Test Automation/Code Review/Security Review.
- Reviewer cannot fix own finding.
- Same reviewer verifies their finding.
- No merge without owner approval.
- No implementation before Architecture approval.
- No production before Production approval.
- Work Plan comes from task tracker.
- Cost comes from real metrics.
- Activity is safe operational activity, not hidden reasoning.
- Realtime must be event-driven.
- Transient errors must not erase confirmed UI data.
- OpenHands secrets remain server-side.
- GitHub remains project source of truth.

---

## 54. Suggested Clean Repository Structure

For long-term maintainability, consider:

```text
mkdd/
├── README.md
├── deploy/
│   ├── compose.yml
│   └── manage-openhands.sh
├── mkdd-ui/
├── agents/
│   ├── definitions/
│   └── skills/
├── branding/
└── openhands/
    ├── README-MKDD-PATCH.md
    └── <fork/submodule/patch strategy>
```

This is cleaner than coupling product source directly to VM-specific `/opt/...` paths.

The current paths can remain deployment defaults while application code becomes portable.

---

## 55. OpenHands Upstream References

The project should continue to be checked against the current OpenHands Agent Canvas / Agent Server implementation before implementing integration behavior from memory.

Useful upstream sources:

- OpenHands main repository:  
  https://github.com/OpenHands/OpenHands

- OpenHands unified documentation repository:  
  https://github.com/OpenHands/docs

- Agent Canvas architecture documentation:  
  https://github.com/OpenHands/OpenHands/blob/main/docs/architecture.md

The Agent Canvas architecture describes the frontend as a React/TypeScript application that communicates with the OpenHands Agent Server, while actual agent execution remains the responsibility of backend/runtime services.

When MKDD behavior differs from Agent Canvas behavior, the integration should be compared with the source version actually deployed in `openhands-mkdd-src`, not only with generic documentation.

---

## 56. Maintainer Checklist Before Publishing to GitHub

Before uploading the final bundle:

- [ ] Preserve current MKDD uncommitted work.
- [ ] Preserve current customized Agent Canvas working-tree change.
- [ ] Exclude nested `.git` directories from a monorepo export.
- [ ] Exclude `node_modules`.
- [ ] Exclude `dist`/build caches.
- [ ] Exclude `.local-backups` from canonical source.
- [ ] Exclude OpenHands persistent Docker volume contents.
- [ ] Check all agent definitions for private/internal information before making the repository public.
- [ ] Check all skills for private/internal information before making the repository public.
- [ ] Check branding rights.
- [ ] Preserve upstream OpenHands license files.
- [ ] Review upstream licensing boundaries.
- [ ] Add a `.gitignore` at bundle root.
- [ ] Add image-build instructions for the customized Agent Canvas image.
- [ ] Record exact upstream/base OpenHands version or commit used for the custom fork.
- [ ] Run MKDD build.
- [ ] Run backend syntax check.
- [ ] Run `git diff --check` in both repositories.
- [ ] Secret-scan the final export.
- [ ] Create the ZIP only after the clean export is verified.

---

## 57. Final Project Definition

MKDD is not simply a themed OpenHands frontend.

It is a structured AI software-company platform whose lower execution layer is OpenHands.

The long-term product contract is:

```text
Human owner
   ↓
MKDD company operating system
   ↓
Governed team of specialized AI employees
   ↓
OpenHands Agent Profiles + conversations
   ↓
OpenHands execution environment
   ↓
GitHub-backed software project
```

The current prototype has already established most of the business model and a substantial portion of the UI/backend integration.

The main engineering challenge at this stage is no longer “can MKDD talk to OpenHands?”

It can.

The current challenge is making that integration:

- Realtime.
- Stable.
- Secure.
- Non-destructive under transient failures.
- Reproducible on a clean machine.
- Ready for daily use without exposing the raw complexity of Agent Canvas.

That is the current development focus.

---

## 58. Snapshot Warning

This README documents the observed project state as of **2026-08-13**.

The repository contains active uncommitted work in both the MKDD UI and customized Agent Canvas source.

Before changing branches, resetting files, rebasing, replacing the OpenHands tree, or rebuilding from a different upstream version, preserve the current working trees.

This document should be updated whenever one of the following changes:

- OpenHands base version.
- Agent Canvas image tag.
- Conversation event contract.
- WebSocket integration.
- Authentication model.
- Employee roster.
- Workflow rules.
- Docker layout.
- Production deployment design.

---

## 59. خريطة الملفات (File Map) — تحديث 2026-08-13

هذا القسم مرجع سريع لأي حد جديد ينضم للمشروع: كل ملف بيعمل إيه، ومكانه فين. مُحدَّث ليعكس الحالة الفعلية للكود بعد إعادة الهيكلة والميزات المضافة اليوم (وليس الوصف الأصلي/الأولي في القسم 12).

### 59.1 الواجهة الأمامية (`mkdd-ui/src/`)

```
src/
├── main.tsx                        ← نقطة الدخول (ReactDOM.render)
├── App.tsx                         ← المكوّن الجذر: يستضيف الهيدر/الـ Sidebar/التنقل بين الشاشات
│
├── components/                     ← مكوّنات قابلة لإعادة الاستخدام
│   ├── AppHeader.tsx                  الهيدر الموحّد — نفسه بالحرف في كل شاشة (لوجو + MKDD + زر منيو)
│   ├── BreadcrumbBar.tsx              شريط الرجوع (مشروع/موظف) — منفصل عن الهيدر عمدًا
│   ├── Sidebar.tsx                    القائمة الجانبية: مشاريع (حالية/قربت تخلص/خلصت) + الموظفين
│   ├── EmployeeProfileModal.tsx       بروفايل موظف (من الـ Sidebar) — اسم/دور/تغيير الصورة
│   ├── EmployeeAvatarUpload.tsx       زر رفع صورة الموظف (أفاتار + كاميرا)، بمؤشرات تحميل/خطأ مرئية
│   ├── EmployeeInsightsPanel.tsx      لوحة معلومات الموظف في شاشة المحادثة (حالة، تكلفة، خطة عمل)
│   └── WorkPlanPanel.tsx              عرض تفاصيل خطة العمل (Work Plan)
│
├── screens/                        ← محتوى كل شاشة (بدون هيدر — الهيدر في App.tsx)
│   ├── ProjectsScreen.tsx             قائمة المشاريع + Modal إنشاء مشروع جديد (بلون غلاف)
│   ├── ProjectHomeScreen.tsx          صفحة المشروع: فريق العمل، حالة الـ workflow، البوابات
│   └── ChatScreen.tsx                 شاشة المحادثة مع موظف واحد (لا يوجد group chat)
│
├── hooks/                          ← منطق حالة قابل لإعادة الاستخدام
│   ├── useConversation.ts             المحادثة الحية (WebSocket + REST fallback) — انظر REALTIME_CHAT_RESEARCH.md
│   ├── useProjectNavigation.ts        التنقل بين المشاريع/الموظفين (متزامن مع الـ URL)
│   ├── useProjectTeamStatus.ts        حالة كل أعضاء الفريق (شغالين الآن، تكلفة، خطة عمل) لكل مشروع
│   └── useProjectWorkflow.ts          حالة الـ workflow (البوابات) لمشروع واحد
│
├── utils/                          ← دوال مساعدة نقية (pure functions)
│   ├── formatMessageTime.ts           تنسيق وقت الرسالة (اليوم = وقت بس، غير كده = تاريخ+وقت)
│   └── projectGateStatus.ts           تصنيف المشروع (نشط/قربت تخلص/خلصت) بناءً على بيانات الـ workflow الحقيقية
│
├── i18n/                           ← الترجمة (عربي/إنجليزي)
│   ├── translations.ts                كل النصوص المترجمة
│   └── useLanguage.ts                 hook لإدارة اللغة الحالية
│
├── api/
│   └── client.ts                   ← كل استدعاءات الـ REST API من الواجهة (fetch* / create* / upload*)
│
└── types/
    └── index.ts                    ← كل الأنواع (types) المشتركة (Workspace, AgentProfile, ChatMessage...)
```

### 59.2 الـ Backend (`mkdd-ui/server/`)

```
server/
├── index.mjs                       ← نقطة الدخول: يربط كل الـ routes + الـ WebSocket bridge
├── workflow-state.mjs              ← تخزين حالة الـ workflow (بوابات، مراجعات، عوائق) — ملف JSON واحد لكل المشاريع
│
├── lib/                            ← منطق مشترك بين أكتر من route
│   ├── openhands-client.mjs           اكتشاف مفتاح الجلسة + استدعاء API الخاص بـ OpenHands
│   ├── authorize-conversation.mjs     التحقق من ملكية المحادثة (project + employee) — مصدر واحد للحقيقة
│   ├── normalize-event.mjs            تطبيع أحداث OpenHands (نفس الدالة لـ REST و WebSocket)
│   ├── normalize-conversation.mjs     تطبيع بيانات المحادثة (تكلفة، حالة تنفيذ)
│   ├── work-plan.mjs                  استخراج خطة العمل من أحداث task_tracker الحقيقية
│   ├── ws-bridge.mjs                  جسر WebSocket الآمن (متصفح ↔ MKDD ↔ OpenHands)
│   ├── list-employee-definitions.mjs  قائمة أسماء الموظفين من ملفات .md (يستثني AGENTS.md وorchestrator)
│   ├── employee-display-info.mjs      قراءة اسم/دور الموظف من ملف تعريفه
│   ├── time-context.mjs               حقن/تجريد علامة الوقت الحالي (لوعي الموظف بالوقت)
│   └── project-metadata.mjs           تخزين لون غلاف كل مشروع (بيانات خاصة بـ MKDD، مش من OpenHands)
│
├── routes/                         ← كل route في ملفه، حسب الموضوع
│   ├── branding.mjs                   شعار الشركة + health check
│   ├── workflow.mjs                   بوابات المشروع، الموافقات، العوائق، المراجعات، ملخص كل المشاريع
│   ├── directory.mjs                  قائمة المشاريع (GET) وقائمة الموظفين
│   ├── projects.mjs                   إنشاء مشروع جديد (مجلد فعلي + تسجيل عند OpenHands)
│   ├── avatars.mjs                    رفع وعرض صور الموظفين (مع بصمة إصدار لمنع مشاكل الكاش)
│   ├── conversation.mjs               البحث عن محادثة موظف في مشروع معيّن
│   └── chat.mjs                       إرسال رسالة + جلب تاريخ المحادثة (REST)
│
└── scripts/
    └── bootstrap-employees.mjs     ← سكريبت تشغيل يدوي: ينشئ/يحدّث الـ 13 Agent Profile من ملفات التعريف
```

### 59.3 قاعدة تنظيمية للمساهمين الجدد

- **مفيش منطق مكرر مسموح:** لو دالة محتاجة في مكانين، تتحط في `lib/` أو `utils/` وتُستورد، مش تُنسخ (زي `list-employee-definitions.mjs` و`employee-display-info.mjs` اللي كانوا مكررين وتم توحيدهم).
- **كل route في ملفه الخاص** تحت `server/routes/`، مربوط من `server/index.mjs` بس.
- **الهيدر واحد بس:** `AppHeader.tsx` — أي تعديل عليه بيظهر في الشاشات التلاتة تلقائيًا. أي تنقل خاص بشاشة معيّنة (زي زر الرجوع) يروح في `BreadcrumbBar.tsx` أو داخل الشاشة نفسها، مش في الهيدر.
- **قبل أي ميزة جديدة في `mkdd-ui`:** راجع `ENGINEERING_PRINCIPLES.md` #1 — لازم أساس حقيقي مؤكَّد في `openhands-agent-canvas` أو API حقيقي، مش واجهة مُختلَقة.
