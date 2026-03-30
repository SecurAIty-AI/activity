# Activity by SecurAIty

**See what your AI agents are doing — in plain English.**

A real-time activity monitor that sits between your AI agents and their LLM providers. Every API call, every tool use, every file operation — translated into plain English so you can actually understand what's happening.

---

## What It Does

- **Transparent Proxy** — Agents talk to LLMs through SecurAIty's proxy. No code changes needed.
- **Plain English Translation** — Every event becomes a readable sentence: *"Claude is writing to /Users/you/project/main.py"*
- **Session Tracking** — Groups agent activity into sessions with automatic gap detection (30min idle = new session)
- **State Machine** — Tracks agent state: Idle → Thinking → Executing → Completed (with stall detection)
- **Alert Engine** — 7 built-in rules: sensitive file access, suspicious domains, excessive writes, system paths, browser automation, high cost, outside-folder access
- **Cost Tracking** — Estimates token costs for 18+ models in real-time
- **Real-Time Dashboard** — WebSocket-powered UI showing everything as it happens
- **SQLite Storage** — 30-day rolling history, no item count limits

---

## Quick Start

### Prerequisites

- **Node.js** v18 or higher
- **npm** (comes with Node.js)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/SecurAIty-AI/activity.git
cd activity

# Install dependencies
npm install

# Start the server
npm run dev
```

The server starts on **http://localhost:3400**

### Open the Dashboard

Open your browser to: **http://localhost:3400**

You'll see the real-time activity dashboard. It starts in demo mode with sample events so you can see how it looks.

---

## Connect Your AI Agents

To monitor an agent, point it at the proxy instead of directly at OpenAI/Anthropic:

### OpenAI-compatible agents (ChatGPT, GPT-4, etc.)

```bash
export OPENAI_BASE_URL=http://localhost:3400/proxy/v1
```

### Anthropic-compatible agents (Claude, etc.)

```bash
export ANTHROPIC_BASE_URL=http://localhost:3400/proxy/v1
```

That's it. Your agent talks to the proxy, the proxy forwards to the real API, and you see everything in the dashboard.

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/activity` | All activity events (supports `?limit=N`) |
| `GET /api/agents` | Detected agents |
| `GET /api/stats` | Activity statistics |
| `GET /api/sessions` | All sessions |
| `GET /api/sessions/active` | Currently active sessions |
| `GET /api/sessions/:id` | Single session detail |
| `GET /api/events` | Persisted events from SQLite |
| `GET /api/alerts` | Triggered alerts |
| `GET /api/alert-rules` | Alert rule configuration |
| `PUT /api/alert-rules` | Update alert rules |
| `GET /api/resources` | System resource metrics |
| `GET /api/resources/cost` | Cost breakdown by model |
| `GET /api/resources/snapshots` | Resource snapshots |
| `GET /api/db-stats` | Database statistics |
| `GET /api/setup/status` | Setup/connection status |
| `GET /proxy/agents` | Agents seen by proxy |
| `GET /proxy/stats` | Proxy traffic stats |

---

## Running Tests

```bash
npm test
```

Runs 101 tests across 7 suites.

---

## Project Structure

```
activity/
├── src/
│   ├── index.ts              # Server entry point
│   ├── schema.ts             # SQLite schema
│   ├── routes/
│   │   ├── api.ts            # REST API routes
│   │   └── proxy.ts          # LLM proxy (OpenAI + Anthropic)
│   └── services/
│       ├── activity-monitor.ts   # Core event tracking
│       ├── alert-engine.ts       # 7 built-in alert rules
│       ├── database.ts           # SQLite persistence
│       ├── event-bus.ts          # Real-time event distribution
│       ├── plain-english.ts      # Human-readable translations
│       ├── resource-monitor.ts   # Cost + system metrics
│       ├── session-manager.ts    # Session lifecycle
│       └── state-machine.ts      # Agent state tracking
├── public/
│   └── index.html            # Dashboard UI
├── tests/                    # 101 tests, 7 suites
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Server:** Express
- **Database:** SQLite (via better-sqlite3)
- **Real-time:** WebSocket (ws)
- **Dashboard:** Vanilla HTML/CSS/JS
- **Tests:** Vitest
- **Build:** esbuild (single-file bundle)

---

## License

MIT

---

**Built by [SecurAIty](https://github.com/SecurAIty-AI)**
