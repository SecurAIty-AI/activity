# Activity by SecurAIty — Kanban Board

> **See what your AI agents are doing — in plain English.**
> Legend: ⬜ To Do | 🟡 In Progress | ✅ Done
> Priority: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## ✅ PHASE 1 — MVP Foundation (v0.1.0)
<details><summary>▸ All items complete (14 items)</summary>

- ✅ 🔴 Express server on port 3400
- ✅ 🔴 OpenAI proxy (POST /proxy/v1/chat/completions)
- ✅ 🔴 Anthropic proxy (POST /proxy/v1/messages)
- ✅ 🔴 Legacy completions proxy
- ✅ 🔴 Model list passthrough (/proxy/v1/models)
- ✅ 🔴 Agent auto-identification (user-agent fingerprinting)
- ✅ 🟠 Activity monitor (in-memory event tracking)
- ✅ 🟠 Plain English translator (16 event types)
- ✅ 🟠 WebSocket real-time broadcast
- ✅ 🟠 Dashboard HTML (agent sidebar + live feed + filters)
- ✅ 🟡 REST API (/api/health, /api/activity, /api/agents, /api/stats)
- ✅ 🟡 Auto-setup endpoint (POST /api/setup/install)
- ✅ 🟡 Demo seed data on startup
- ✅ 🟢 Docker + Electron shell
</details>

---

## ✅ PHASE 2 — SQLite Persistence & Sessions
> Wire the existing SQLite store to the activity monitor. All events persist. Sessions track agent work.

- ✅ 🔴 Wire database.ts into activity-monitor.ts (persist every event)
- ✅ 🔴 Auto-create sessions from proxy requests (group by agent + time gap)
- ✅ 🔴 Session lifecycle: started → running → idle → completed
- ✅ 🟠 Session API: GET /api/sessions, GET /api/sessions/:id, GET /api/sessions/:id/timeline
- ✅ 🟠 Event search: GET /api/events?q=search&type=&agent=&since=&until=
- ✅ 🟠 Load events from DB on server restart (survive restarts)
- ✅ 🟡 Session cost tracking (estimate from token counts)
- ✅ 🟡 30-day retention auto-cleanup on startup
- ✅ 🟢 Export session: GET /api/sessions/:id/export (JSON)

---

## ⬜ PHASE 3 — Agent State Machine
> Track what agents are actually doing moment-to-moment.

- ⬜ 🔴 Agent state machine: idle → planning → executing → waiting → thinking → tool_calling → verifying → completed
- ⬜ 🔴 State change events: agent.state.changed with from/to
- ⬜ 🟠 Infer state from proxy traffic (request = thinking, response = executing, gap = idle)
- ⬜ 🟠 State timeline per session (array of state transitions with timestamps)
- ⬜ 🟡 Stall detection (no activity for 5+ minutes → emit alert)
- ⬜ 🟡 Dashboard: agent cards show current state with colored indicator

---

## ⬜ PHASE 4 — Dashboard V2 (Session-Centric)
> Redesign dashboard around sessions, not just a flat event feed.

- ⬜ 🔴 Session list view (sidebar or tab): active sessions with progress
- ⬜ 🔴 Session detail view: timeline, events, state transitions, cost
- ⬜ 🟠 Timeline/replay view: scrub through events chronologically
- ⬜ 🟠 Resource sparklines: tokens, cost, events-per-minute per session
- ⬜ 🟠 Agent detail page: model, provider, session history, total cost
- ⬜ 🟡 Dark/light theme toggle
- ⬜ 🟡 Keyboard shortcuts (j/k navigate, enter expand, esc back)
- ⬜ 🟢 Mobile responsive sidebar collapse

---

## ⬜ PHASE 5 — File & Process Monitoring
> Watch what agents do OUTSIDE of LLM calls — file reads, writes, commands.

- ⬜ 🔴 File system watcher (chokidar) — monitor workspace directories
- ⬜ 🟠 Process monitoring — detect spawned processes from agent sessions
- ⬜ 🟠 Correlate file/process events to agent sessions (by timing + PID)
- ⬜ 🟡 Track file read/write/create/delete with path and size
- ⬜ 🟡 Command translation (npm install → "Installing packages")
- ⬜ 🟢 Configurable watch paths (default: home dir + common project dirs)

---

## ⬜ PHASE 6 — Alerts & Risk Scoring
> Flag suspicious or noteworthy activity without blocking it.

- ⬜ 🔴 Alert engine: configurable rules that trigger on event patterns
- ⬜ 🔴 Built-in alerts: sensitive file access, unexpected domains, excessive writes, idle timeout, self-loop, high cost
- ⬜ 🟠 Risk score per event (0-100) based on type + context
- ⬜ 🟠 Alert API: GET /api/alerts, POST /api/alerts/:id/acknowledge, POST /api/alerts/:id/resolve
- ⬜ 🟠 Dashboard: alert bell with count, alert feed panel
- ⬜ 🟡 Alert severity: info, warn, error, critical
- ⬜ 🟡 Configurable alert rules via API

---

## ⬜ PHASE 7 — Approval Gates
> Let users pause agent actions and approve/deny before they execute.

- ⬜ 🔴 Approval request event: agent requests permission for risky actions
- ⬜ 🟠 Dashboard approval UI: approve/deny buttons with reason
- ⬜ 🟠 Approval API: POST /api/approvals/:id/grant, POST /api/approvals/:id/deny
- ⬜ 🟡 Configurable gates: which event types require approval
- ⬜ 🟢 Approval history log

---

## ⬜ PHASE 8 — Resource Monitoring
> CPU, memory, tokens, cost — track resource consumption per agent.

- ⬜ 🟠 Resource snapshot collector (every 10s per active session)
- ⬜ 🟠 Token counting from proxy responses (prompt + completion)
- ⬜ 🟠 Cost estimation by model (GPT-4o, Claude Sonnet, etc.)
- ⬜ 🟡 Resource charts on session detail page
- ⬜ 🟡 Budget alerts: notify when session cost exceeds threshold
- ⬜ 🟢 Historical cost dashboard (daily/weekly/monthly)

---

## ⬜ PHASE 9 — Tests
> Comprehensive test suite.

- ⬜ 🔴 Unit tests: plain-english translator (all 16+ event types)
- ⬜ 🔴 Unit tests: activity-monitor (record, query, agents, stats)
- ⬜ 🔴 Unit tests: database store (CRUD sessions, events, alerts)
- ⬜ 🟠 Integration tests: proxy routes (OpenAI + Anthropic format)
- ⬜ 🟠 Integration tests: API routes (all endpoints)
- ⬜ 🟠 Integration tests: WebSocket (connect, receive events)
- ⬜ 🟡 E2E tests: full flow (proxy request → event → WS broadcast → DB persist)
- ⬜ 🟡 Schema validation tests

---

## ⬜ PHASE 10 — Production Hardening
> Make it robust for real daily use.

- ⬜ 🔴 Graceful shutdown (drain connections, close DB)
- ⬜ 🟠 Error handling middleware
- ⬜ 🟠 Request validation / input sanitization
- ⬜ 🟠 WAL mode + connection pooling for SQLite
- ⬜ 🟡 Startup banner with config summary
- ⬜ 🟡 Health check includes DB status
- ⬜ 🟢 Docker compose with volume persistence
- ⬜ 🟢 CI pipeline (lint → test → build)

---

## ⬜ PHASE 11 — Desktop App (Electron V2)
> Polish the Electron wrapper into a real desktop experience.

- ⬜ 🟠 Tray icon with agent status
- ⬜ 🟠 Menu bar: start/stop monitoring, open dashboard, settings
- ⬜ 🟡 Auto-start on login (macOS launch agent)
- ⬜ 🟡 Native notifications for alerts
- ⬜ 🟢 Auto-updater
- ⬜ 🟢 macOS code signing

---

## 📊 Project Stats
- **Version:** 0.2.0
- **Commits:** 3
- **Files:** ~25
- **Production code:** ~3,300 lines
- **Test code:** ~1,200 lines
- **Tests:** 63
- **Suites:** 4
- **Phases complete:** 2 of 11
