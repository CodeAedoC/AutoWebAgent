# Website Automation Agent

An AI-powered web automation agent built with **Groq AI**, **Playwright**, **Express**, and **React**.

The agent navigates to the [shadcn/ui react-hook-form docs](https://ui.shadcn.com/docs/forms/react-hook-form), intelligently locates the form fields, and fills them in automatically — all driven by an LLM.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  (Vite + React) · Runs on http://localhost:5173     │
│                                                     │
│  [ Run Agent ]  →  POST /api/run  (SSE stream)      │
│  Live log panel + screenshot preview                │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                  Express Backend                     │
│  Runs on http://localhost:3001                      │
│                                                     │
│  POST /api/run       → starts the agent             │
│  GET  /api/screenshot → serves latest screenshot    │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
           ▼                      ▼
┌──────────────────┐   ┌──────────────────────────────┐
│   Groq AI        │   │   Playwright (Chromium)       │
│  (agent.js)      │   │   (tools.js)                  │
│                  │   │                              │
│  llama-3.3-70b   │◄──│  open_browser                │
│  with tool calls │   │  navigate_to_url             │
│                  │──►│  take_screenshot             │
│                  │   │  click_on_screen(x, y)       │
└──────────────────┘   │  send_keys                   │
                       │  scroll                      │
                       │  double_click                │
                       │  get_element_position ← extra│
                       └──────────────────────────────┘
```

### Agent Workflow

1. **Frontend** sends `POST /api/run` → Backend starts the agent
2. **Agent** sends a system prompt + tools to Groq (llama-3.3-70b-versatile)
3. **Groq** responds with `tool_calls` (e.g. `open_browser`, `navigate_to_url`)
4. **Backend** executes the tools via Playwright and returns results
5. Results are added back to the conversation → Groq decides the next action
6. This loop continues until the AI responds with text only (task done)
7. **Logs stream** to the React frontend in real time via Server-Sent Events (SSE)

---

## Tools Implemented

| Tool | Description |
|------|-------------|
| `open_browser` | Launches a Chromium browser window |
| `navigate_to_url` | Navigates to any URL |
| `take_screenshot` | Saves the current viewport as `latest.png` |
| `click_on_screen(x, y)` | Clicks at pixel coordinates |
| `send_keys` | Types text into the focused element |
| `scroll` | Scrolls up or down by pixel amount |
| `double_click` | Double-clicks at pixel coordinates |
| `get_element_position` | Finds an element by CSS selector → returns (x, y) |

`get_element_position` is the key to intelligent element detection: the AI uses it to locate exact coordinates before calling `click_on_screen`.

---

## Setup & Run

### 1. Clone / open the project

```bash
cd AutoWebAgent
```

### 2. Configure environment variables

```bash
cp .env.example backend/.env
# Edit backend/.env and add your Groq API key
```

Get a free API key at https://console.groq.com

### 3. Install backend dependencies

```bash
cd backend
npm install
npx playwright install chromium
```

### 4. Install frontend dependencies

```bash
cd ../frontend
npm install
```

### 5. Run the backend

```bash
cd backend
npm start
```

### 6. Run the frontend (in a new terminal)

```bash
cd frontend
npm run dev
```

### 7. Open the app

Visit **http://localhost:5173** and click **Run Agent**.

---

## Dependencies

### Backend
- `express` — HTTP server
- `groq-sdk` — Groq AI API client
- `playwright` — Browser automation
- `dotenv` — Environment variable loading
- `cors` — Cross-origin request handling

### Frontend
- `react` — UI library
- `vite` + `@vitejs/plugin-react` — Dev server and build tool

---

## Error Handling

- **Network issues**: Caught with try/catch around Groq API calls and Playwright navigation
- **Element not found**: `get_element_position` returns a descriptive error; the AI retries with a different selector
- **Timeouts**: Playwright uses 30-second navigation timeout and 5-second element visibility timeout
- **Max iterations**: The agent loop stops after 25 steps to prevent infinite loops
