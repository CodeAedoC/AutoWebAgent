require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { runAgent } = require('./agent');

const app = express();

app.use(cors({
  origin: '*', // Allow all origins to completely eliminate CORS as an issue
  methods: ['GET', 'POST', 'OPTIONS'],
}));

app.use(express.json());


app.post('/api/run', async (req, res) => {

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const log = (message, type = 'log') => {
    const payload = JSON.stringify({ message, type, timestamp: new Date().toISOString() });
    res.write(`data: ${payload}\n\n`);
  };

  try {
    await runAgent(log);
  } catch (err) {
    log(`Fatal error: ${err.message}`, 'error');
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('/api/screenshot', (req, res) => {
  const screenshotPath = path.join(__dirname, 'screenshots', 'latest.png');
  if (fs.existsSync(screenshotPath)) {
    res.sendFile(screenshotPath);
  } else {
    res.status(404).json({ error: 'No screenshot available yet' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
