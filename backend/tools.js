/**
 * tools.js
 * Defines all browser automation tools powered by Playwright.
 * Each tool maps 1-to-1 with the required agent capabilities from the assignment.
 * Also includes helper tools so the AI can find exact coordinates
 * before calling click_on_screen — this is what makes the agent "intelligent".
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Shared browser state across all tool calls in one agent run
let browser = null;
let page = null;

// Ensure the screenshots directory exists
const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

// ─── Tool Implementations ────────────────────────────────────────────────────

/**
 * open_browser — Launch a visible Chromium browser window.
 */
async function open_browser() {
  browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  return 'Browser opened successfully (1280x720)';
}

/**
 * navigate_to_url — Direct the browser to a URL and wait for the page + JS to fully load.
 * Uses networkidle to ensure React/Next.js has finished rendering client-side components.
 */
async function navigate_to_url({ url }) {
  if (!page) throw new Error('Browser is not open. Call open_browser first.');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  // Extra wait so React hydration finishes and components mount
  await page.waitForTimeout(2500);
  return `Navigated to ${url} (page fully loaded)`;
}

/**
 * take_screenshot — Capture the visible browser viewport and save as latest.png.
 */
async function take_screenshot() {
  if (!page) throw new Error('Browser is not open.');
  const screenshotPath = path.join(screenshotDir, 'latest.png');
  await page.screenshot({ path: screenshotPath });
  return 'Screenshot saved';
}

/**
 * click_on_screen — Triple-click at (x, y) pixel coordinates.
 * Triple-clicking selects all text already in an input field,
 * so any following send_keys call replaces it instead of appending.
 */
async function click_on_screen({ x, y }) {
  if (!page) throw new Error('Browser is not open.');
  await page.mouse.click(x, y, { clickCount: 3 }); // triple-click = select all in input
  await page.waitForTimeout(400);
  return `Clicked at coordinates (${x}, ${y})`;
}

/**
 * send_keys — Type text into whichever element is currently focused.
 */
async function send_keys({ text }) {
  if (!page) throw new Error('Browser is not open.');
  await page.keyboard.type(text, { delay: 60 });
  return `Typed: "${text}"`;
}

/**
 * scroll — Scroll the page up or down by a given number of pixels.
 */
async function scroll({ direction = 'down', amount = 400 }) {
  if (!page) throw new Error('Browser is not open.');
  const delta = direction === 'down' ? amount : -amount;
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(700);
  return `Scrolled ${direction} by ${amount}px`;
}

/**
 * double_click — Perform a double-click at (x, y) coordinates.
 */
async function double_click({ x, y }) {
  if (!page) throw new Error('Browser is not open.');
  await page.mouse.dblclick(x, y);
  await page.waitForTimeout(400);
  return `Double-clicked at (${x}, ${y})`;
}

/**
 * get_element_position — Find an element by CSS selector OR label text and return
 * its center (x, y). The AI uses this to get exact coordinates before clicking.
 *
 * Tries in order:
 *   1. CSS selector directly
 *   2. Input associated with a <label> whose text matches labelText
 */
async function get_element_position({ selector, labelText }) {
  if (!page) throw new Error('Browser is not open.');

  // Try CSS selector first
  if (selector) {
    try {
      const element = page.locator(selector).first();
      await element.waitFor({ state: 'visible', timeout: 5000 });
      const box = await element.boundingBox();
      if (box) {
        return JSON.stringify({
          found: true,
          method: 'css_selector',
          selector,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
          width: Math.round(box.width),
          height: Math.round(box.height),
        });
      }
    } catch {
      // Fall through to label-text approach
    }
  }

  // Try finding input by its label text (e.g. "Username", "Bio")
  if (labelText) {
    try {
      const element = page.getByLabel(labelText, { exact: false }).first();
      await element.waitFor({ state: 'visible', timeout: 5000 });
      const box = await element.boundingBox();
      if (box) {
        return JSON.stringify({
          found: true,
          method: 'label_text',
          labelText,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
          width: Math.round(box.width),
          height: Math.round(box.height),
        });
      }
    } catch {
      // Fall through
    }
  }

  return JSON.stringify({ found: false, error: `Element not found. selector="${selector}" labelText="${labelText}"` });
}

/**
 * get_all_inputs — Scan the page DOM and return all visible input/textarea elements
 * with their associated label text and screen coordinates.
 * The AI calls this after navigating/scrolling to discover exactly what fields exist
 * and where they are — no guessing required.
 */
async function get_all_inputs() {
  if (!page) throw new Error('Browser is not open.');

  const inputs = await page.evaluate(() => {
    const results = [];
    const elements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea');

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      // Skip elements that are off-screen or invisible
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.top < 0 || rect.bottom > window.innerHeight) return;

      // Find associated label text
      let labelText = '';
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) labelText = label.textContent.trim();
      }
      if (!labelText) {
        const parent = el.closest('label') || el.closest('[class*="form"]');
        if (parent) {
          // Get text content but exclude the input's own value
          const clone = parent.cloneNode(true);
          clone.querySelectorAll('input, textarea').forEach(e => e.remove());
          labelText = clone.textContent.trim().split('\n')[0].trim();
        }
      }

      results.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || 'textarea',
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        labelText: labelText || null,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    });

    return results;
  });

  if (inputs.length === 0) {
    return 'No visible inputs found in current viewport. Try scrolling down.';
  }

  return JSON.stringify(inputs, null, 2);
}

/**
 * close_browser — Clean up: close the browser when the task is done.
 */
async function close_browser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
  return 'Browser closed';
}

// ─── Tool Registry ───────────────────────────────────────────────────────────

// Maps tool name → implementation function
const toolHandlers = {
  open_browser,
  navigate_to_url,
  take_screenshot,
  click_on_screen,
  send_keys,
  scroll,
  double_click,
  get_element_position,
  get_all_inputs,
  close_browser,
};

// ─── Tool Definitions for Groq Function Calling ──────────────────────────────

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'open_browser',
      description: 'Initialize and launch a browser instance. Must be called first.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to_url',
      description: 'Direct the browser to a specific URL. Waits for the full page including React/JS components to load.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The full URL to navigate to' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'take_screenshot',
      description: 'Capture the current state of the browser window.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click_on_screen',
      description: 'Perform a mouse click at the specified (x, y) pixel coordinates.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate in pixels' },
          y: { type: 'number', description: 'Y coordinate in pixels' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_keys',
      description: 'Type text into the currently focused input field or text area.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text to type' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scroll',
      description: 'Scroll the page up or down to reveal hidden elements.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
          amount: { type: 'number', description: 'Pixels to scroll (default 400)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'double_click',
      description: 'Perform a double-click at the specified (x, y) coordinates.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate in pixels' },
          y: { type: 'number', description: 'Y coordinate in pixels' },
        },
        required: ['x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_element_position',
      description:
        'Find an element by CSS selector or label text and return its center (x, y) coordinates. Use this before click_on_screen to locate elements. Supports both CSS selector and label text search.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector (e.g. "input[type=text]", "textarea"). Optional.',
          },
          labelText: {
            type: 'string',
            description: 'Text of the label associated with the input (e.g. "Username", "Bio"). Optional.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_inputs',
      description:
        'Scan the current viewport and return ALL visible input fields and textareas with their label text and (x, y) coordinates. ALWAYS call this after scrolling to discover what form fields are visible before clicking.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_browser',
      description: 'Close the browser when the task is complete.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

module.exports = { toolHandlers, toolDefinitions };
