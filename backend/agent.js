/**
 * agent.js
 * The core AI agent loop.
 * Sends messages to Groq with tool definitions, handles tool_calls,
 * executes them via Playwright, and feeds results back in a loop.
 *
 * Model: llama3-groq-70b-8192-tool-use-preview
 *   → Specifically fine-tuned by Groq for reliable function/tool calling.
 *   → Avoids the malformed "<function=...null>" generation bug seen in
 *     llama-3.3-70b-versatile when tools have no required parameters.
 */

const Groq = require('groq-sdk');
const { toolHandlers, toolDefinitions } = require('./tools');

// llama-3.3-70b-versatile: current recommended Groq model with tool calling support
const MODEL = 'llama-3.3-70b-versatile';

// System prompt — tells the AI what to do step by step
const SYSTEM_PROMPT = `You are an intelligent web automation agent. Your job is to control a browser to complete tasks.

YOUR TASK:
1. Open the browser
2. Navigate to: https://ui.shadcn.com/docs/forms/react-hook-form
3. Take a screenshot to see the initial page state
4. Scroll down to find the interactive form demo on the page (scroll about 500px at a time)
5. After each scroll, call get_all_inputs to scan the visible viewport for form fields
6. Once get_all_inputs returns input fields, use those EXACT (x, y) coordinates to click each field
7. Fill in the first input field (name/username) with "John Doe"
8. Fill in the textarea (bio/description) with "This is an automated form submission by the AI agent"
9. Take a screenshot showing the filled form
10. Close the browser

CRITICAL RULES:
- ALWAYS call get_all_inputs after every scroll to discover visible inputs
- Do NOT guess or assume selectors or coordinates
- If get_all_inputs returns no inputs, scroll more and try again
- Use the x and y values from get_all_inputs directly in click_on_screen
- After clicking a field, immediately call send_keys to type into it
- The page is a React/Next.js app — the form only appears after scrolling
- Workflow: open → navigate → screenshot → scroll → get_all_inputs → (repeat until form found) → click+type → screenshot → close`;

/**
 * Safely parse JSON tool arguments.
 * The model can sometimes return null, "null", or malformed strings.
 */
function parseArgs(raw) {
  if (!raw || raw === 'null') return {};
  try {
    const parsed = JSON.parse(raw);
    // If the model returned null as a JSON value, default to {}
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Call Groq with auto-retry on tool_use_failed errors.
 * When the model generates malformed tool syntax, we add a corrective
 * user message and try again (up to MAX_RETRIES times).
 */
async function callGroqWithRetry(groq, messages, log, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        parallel_tool_calls: false, // Force one tool at a time — prevents malformed null-args generation
        max_tokens: 1024,
      });
      return response;
    } catch (err) {
      const body = err.message || '';
      const isToolUseFailed = body.includes('tool_use_failed') || body.includes('Failed to call a function');

      if (isToolUseFailed && attempt < maxRetries) {
        log(`⚠ Model generated malformed tool call (attempt ${attempt}/${maxRetries}), retrying...`, 'info');
        // Add a corrective message so the model knows to try again cleanly
        messages.push({
          role: 'user',
          content: 'Your last response had a formatting error. Please try again and call the next tool correctly.',
        });
        continue;
      }

      // Non-retryable error or max retries exhausted
      throw err;
    }
  }
}

/**
 * runAgent
 * @param {Function} log - Callback to stream log messages to the frontend
 */
async function runAgent(log) {
  log('Agent starting...', 'info');
  log(`Using model: ${MODEL}`, 'info');

  // Create Groq client — picks up GROQ_API_KEY from .env via dotenv
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  // Conversation history for the Groq API
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'Start the automation task now.' },
  ];

  const MAX_ITERATIONS = 30; // Safety cap to prevent infinite loops

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    log(`Asking AI for next action... (step ${i + 1})`, 'info');

    // Call Groq — retries automatically on tool_use_failed
    let response;
    try {
      response = await callGroqWithRetry(groq, messages, log);
    } catch (err) {
      log(`Groq API error: ${err.message}`, 'error');
      throw err;
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    // Add the assistant turn to conversation history
    messages.push(assistantMessage);

    // If the AI responded with plain text (no tool calls), the task is done
    if (choice.finish_reason !== 'tool_calls' || !assistantMessage.tool_calls) {
      if (assistantMessage.content) {
        log(assistantMessage.content, 'ai');
      }
      log('Agent finished the task.', 'success');
      return;
    }

    // Execute each tool the AI requested in this turn
    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = parseArgs(toolCall.function.arguments);

      log(`Running tool: ${toolName}(${JSON.stringify(toolArgs)})`, 'action');

      let result;
      try {
        const handler = toolHandlers[toolName];
        if (!handler) {
          result = `Error: Unknown tool "${toolName}"`;
          log(result, 'error');
        } else {
          result = await handler(toolArgs);
          log(`✓ ${result}`, 'success');
        }
      } catch (err) {
        result = `Error executing ${toolName}: ${err.message}`;
        log(`✗ ${result}`, 'error');
      }

      // Feed the tool result back into the conversation
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: String(result),
      });
    }
  }

  log('Max iterations reached. Stopping agent.', 'error');
}

module.exports = { runAgent };
