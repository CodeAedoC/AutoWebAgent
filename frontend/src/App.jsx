import React, { useState, useRef, useEffect } from 'react';

// Backend URL: empty string in dev (Vite proxy handles it), Railway URL in production
const BACKEND = typeof __BACKEND_URL__ !== 'undefined' ? __BACKEND_URL__.replace(/\/$/, '') : '';

// ─── Color mapping for different log types ────────────────────────────────────
const LOG_STYLES = {
  info:    { color: '#60a5fa', prefix: 'ℹ' },
  action:  { color: '#f59e0b', prefix: '▶' },
  success: { color: '#22c55e', prefix: '✓' },
  error:   { color: '#f87171', prefix: '✗' },
  ai:      { color: '#c084fc', prefix: '🤖' },
  log:     { color: '#94a3b8', prefix: '·' },
};

export default function App() {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const logsEndRef = useRef(null);

  // Auto-scroll the log panel as new entries come in
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Poll for the latest screenshot every 2 seconds while agent is running
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setScreenshotUrl(`${BACKEND}/api/screenshot?t=${Date.now()}`);
    }, 2000);
    return () => clearInterval(interval);
  }, [running]);

  const addLog = (message, type = 'log') => {
    setLogs(prev => [...prev, { message, type, id: `${Date.now()}-${Math.random()}` }]);
  };

  // ── Start the agent by calling the backend and reading the SSE stream ──────
  const runAgent = async () => {
    setRunning(true);
    setDone(false);
    setLogs([]);
    setScreenshotUrl(null);

    try {
      const response = await fetch(`${BACKEND}/api/run`, { method: 'POST' });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        // Buffer chunks so we don't parse half-written SSE lines
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last incomplete line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();

          if (raw === '[DONE]') {
            setDone(true);
            // Load the final screenshot once the agent finishes
            setScreenshotUrl(`${BACKEND}/api/screenshot?t=${Date.now()}`);
          } else {
            try {
              const { message, type } = JSON.parse(raw);
              addLog(message, type);
            } catch {
              // Ignore malformed events
            }
          }
        }
      }
    } catch (err) {
      addLog(`Connection error: ${err.message}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  // ─── Styles ────────────────────────────────────────────────────────────────
  const s = {
    root: {
      minHeight: '100vh',
      background: '#080b14',
      color: '#e2e8f0',
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      padding: '18px 40px',
      borderBottom: '1px solid #1e293b',
      background: '#0d111c',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    },
    headerTitle: {
      fontSize: '20px',
      fontWeight: 700,
      color: '#f1f5f9',
      margin: 0,
    },
    headerSub: {
      fontSize: '13px',
      color: '#475569',
      margin: '2px 0 0',
    },
    badge: {
      marginLeft: 'auto',
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '20px',
      padding: '4px 12px',
      fontSize: '12px',
      color: '#64748b',
    },
    main: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      padding: '24px 40px',
    },
    card: {
      background: '#0d111c',
      border: '1px solid #1e293b',
      borderRadius: '12px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    cardTitle: {
      fontSize: '12px',
      fontWeight: 600,
      color: '#475569',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      margin: 0,
    },
    taskBox: {
      background: '#111827',
      borderRadius: '8px',
      padding: '14px',
      fontSize: '13px',
      lineHeight: 1.7,
      color: '#94a3b8',
      border: '1px solid #1e293b',
    },
    codeChip: {
      background: '#1e293b',
      color: '#7dd3fc',
      borderRadius: '4px',
      padding: '1px 6px',
      fontSize: '12px',
      fontFamily: "'JetBrains Mono', monospace",
    },
    runBtn: {
      padding: '13px 24px',
      borderRadius: '10px',
      border: 'none',
      fontSize: '15px',
      fontWeight: 600,
      cursor: running ? 'not-allowed' : 'pointer',
      background: running
        ? '#1e293b'
        : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      color: running ? '#475569' : '#fff',
      transition: 'opacity 0.2s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
    },
    logConsole: {
      background: '#060912',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '14px',
      flex: 1,
      minHeight: '340px',
      maxHeight: '420px',
      overflowY: 'auto',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '12.5px',
      lineHeight: 1.6,
    },
    emptyLog: {
      color: '#1e293b',
      textAlign: 'center',
      paddingTop: '120px',
      fontSize: '13px',
    },
    screenshotBox: {
      flex: 1,
      minHeight: '360px',
      background: '#060912',
      border: '2px dashed #1e293b',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#1e293b',
      fontSize: '13px',
      overflow: 'hidden',
    },
    screenshot: {
      width: '100%',
      display: 'block',
      borderRadius: '6px',
    },
    statusRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
    },
    dot: (active) => ({
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: active ? '#22c55e' : '#1e293b',
      boxShadow: active ? '0 0 6px #22c55e' : 'none',
    }),
  };

  const statusText = running ? 'Running' : done ? 'Completed' : 'Idle';
  const statusColor = running ? '#f59e0b' : done ? '#22c55e' : '#475569';

  return (
    <div style={s.root}>
      {/* ── Header ── */}
      <header style={s.header}>
        <div>
          <h1 style={s.headerTitle}>🤖 Web Automation Agent</h1>
          <p style={s.headerSub}>Groq AI · Playwright · React</p>
        </div>
        <span style={s.badge}>Assignment 04</span>
      </header>

      {/* ── Main Layout ── */}
      <main style={s.main}>

        {/* LEFT: Controls + Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Task description card */}
          <div style={s.card}>
            <p style={s.cardTitle}>Target Task</p>
            <div style={s.taskBox}>
              Navigate to{' '}
              <code style={s.codeChip}>ui.shadcn.com/docs/forms/react-hook-form</code>,
              identify the form fields, and automatically fill in{' '}
              <strong style={{ color: '#e2e8f0' }}>Name</strong> and{' '}
              <strong style={{ color: '#e2e8f0' }}>Description</strong> using the AI agent.
            </div>
            {/* Status row */}
            <div style={s.statusRow}>
              <span style={s.dot(running)} />
              <span style={{ color: statusColor, fontWeight: 500 }}>{statusText}</span>
              {done && <span style={{ color: '#475569' }}>— task finished successfully</span>}
            </div>
          </div>

          {/* Run button */}
          <button
            id="run-agent-btn"
            onClick={runAgent}
            disabled={running}
            style={s.runBtn}
          >
            {running ? (
              <>
                <SpinnerIcon /> Agent Running…
              </>
            ) : (
              <>▶ Run Agent</>
            )}
          </button>

          {/* Log console */}
          <div style={s.card}>
            <p style={s.cardTitle}>Agent Log</p>
            <div style={s.logConsole}>
              {logs.length === 0 ? (
                <div style={s.emptyLog}>Click "Run Agent" to start the automation…</div>
              ) : (
                logs.map(log => {
                  const style = LOG_STYLES[log.type] || LOG_STYLES.log;
                  return (
                    <div
                      key={log.id}
                      style={{ display: 'flex', gap: '8px', marginBottom: '3px', color: style.color }}
                    >
                      <span style={{ flexShrink: 0 }}>{style.prefix}</span>
                      <span style={{ wordBreak: 'break-word' }}>{log.message}</span>
                    </div>
                  );
                })
              )}
              {done && (
                <div style={{ color: '#22c55e', marginTop: '10px', fontWeight: 600 }}>
                  ✓ Automation complete!
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* RIGHT: Screenshot */}
        <div style={s.card}>
          <p style={s.cardTitle}>Live Screenshot</p>
          <div style={s.screenshotBox}>
            {screenshotUrl ? (
              <img
                src={screenshotUrl}
                alt="Browser screenshot"
                style={s.screenshot}
                onError={() => {}} // Silently ignore if screenshot not ready yet
              />
            ) : (
              <span>Screenshot will appear here…</span>
            )}
          </div>
          {screenshotUrl && (
            <p style={{ fontSize: '11px', color: '#334155', margin: 0 }}>
              Updates every 2 seconds while agent is running
            </p>
          )}
        </div>

      </main>
    </div>
  );
}

// Simple spinning icon component
function SpinnerIcon() {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDeg(d => d + 20), 50);
    return () => clearInterval(t);
  }, []);
  return <span style={{ display: 'inline-block', transform: `rotate(${deg}deg)` }}>⟳</span>;
}
