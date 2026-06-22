const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

let browser = null;
let page = null;

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}


async function open_browser() {
  // Railway provides no display server, so we MUST run headless in production
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;
  browser = await chromium.launch({ headless: !!isProduction, slowMo: 80 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  page = await context.newPage();
  return `Browser opened successfully (headless: ${!!isProduction})`;
}


async function navigate_to_url({ url }) {
  if (!page) throw new Error('Browser is not open. Call open_browser first.');
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  // Extra wait so React hydration finishes and components mount
  await page.waitForTimeout(2500);
  return `Navigated to ${url} (page fully loaded)`;
}


async function take_screenshot() {
  if (!page) throw new Error('Browser is not open.');
  const screenshotPath = path.join(screenshotDir, 'latest.png');
  await page.screenshot({ path: screenshotPath });
  return 'Screenshot saved';
}


async function click_on_screen({ x, y }) {
  if (!page) throw new Error('Browser is not open.');
  await page.mouse.click(x, y, { clickCount: 3 });
  await page.waitForTimeout(400);
  return `Clicked at coordinates (${x}, ${y})`;
}


async function send_keys({ text }) {
  if (!page) throw new Error('Browser is not open.');
  await page.keyboard.type(text, { delay: 60 });
  return `Typed: "${text}"`;
}


async function scroll({ direction = 'down', amount = 400 }) {
  if (!page) throw new Error('Browser is not open.');
  const delta = direction === 'down' ? amount : -amount;
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(700);
  return `Scrolled ${direction} by ${amount}px`;
}


async function double_click({ x, y }) {
  if (!page) throw new Error('Browser is not open.');
  await page.mouse.dblclick(x, y);
  await page.waitForTimeout(400);
  return `Double-clicked at (${x}, ${y})`;
}


async function get_element_position({ selector, labelText }) {
  if (!page) throw new Error('Browser is not open.');

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
    }
  }

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
    }
  }

  return JSON.stringify({ found: false, error: `Element not found. selector="${selector}" labelText="${labelText}"` });
}

async function get_all_inputs() {
  if (!page) throw new Error('Browser is not open.');

  const inputs = await page.evaluate(() => {
    const results = [];
    const elements = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), textarea');

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (rect.top < 0 || rect.bottom > window.innerHeight) return;

      let labelText = '';
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) labelText = label.textContent.trim();
      }
      if (!labelText) {
        const parent = el.closest('label') || el.closest('[class*="form"]');
        if (parent) {
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

async function close_browser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
  return 'Browser closed';
}

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
