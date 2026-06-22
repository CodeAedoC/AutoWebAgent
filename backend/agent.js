const Groq = require('groq-sdk');
const { toolHandlers, toolDefinitions } = require('./tools');

const MODEL = 'llama-3.3-70b-versatile';

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

function parseArgs(raw) {
  if (!raw || raw === 'null') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}


async function callGroqWithRetry(groq, messages, log, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await groq.chat.completions.create({
        model: MODEL,
        messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_tokens: 1024,
      });
      return response;
    } catch (err) {
      const body = err.message || '';
      const isToolUseFailed = body.includes('tool_use_failed') || body.includes('Failed to call a function');

      if (isToolUseFailed && attempt < maxRetries) {
        log(`⚠ Model generated malformed tool call (attempt ${attempt}/${maxRetries}), retrying...`, 'info');
        messages.push({
          role: 'user',
          content: 'Your last response had a formatting error. Please try again and call the next tool correctly.',
        });
        continue;
      }

      throw err;
    }
  }
}


async function runAgent(log) {
  log('Agent starting...', 'info');
  log(`Using model: ${MODEL}`, 'info');
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'Start the automation task now.' },
  ];

  const MAX_ITERATIONS = 30;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    log(`Asking AI for next action... (step ${i + 1})`, 'info');
    let response;
    try {
      response = await callGroqWithRetry(groq, messages, log);
    } catch (err) {
      log(`Groq API error: ${err.message}`, 'error');
      throw err;
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);
    if (choice.finish_reason !== 'tool_calls' || !assistantMessage.tool_calls) {
      if (assistantMessage.content) {
        log(assistantMessage.content, 'ai');
      }
      log('Agent finished the task.', 'success');
      return;
    }

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
