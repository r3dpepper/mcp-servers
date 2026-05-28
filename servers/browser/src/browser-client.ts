/**
 * Browser automation client using Puppeteer for browser automation
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

import puppeteer from 'puppeteer';
import type { Browser, BrowserContext, Page, ElementHandle } from 'puppeteer';
import type { PuppeteerLifeCycleEvent } from 'puppeteer';

// Define WaitUntil type based on Puppeteer's PuppeteerLifeCycleEvent
type WaitUntil = PuppeteerLifeCycleEvent;

// Helper type for the waitUntil parameter - using string to avoid type issues with PuppeteerLifeCycleEvent
type WaitUntilOption = 'load' | 'domcontentloaded' | 'networkidle';

// Browser instance pool for resource efficiency
class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();
  private contextCounter: number = 0;

  // Getter for contexts (needed for external access)
  public getContexts(): Map<string, BrowserContext> {
    return this.contexts;
  }
  
  private constructor() {}
  
  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }
  
  async initialize(): Promise<void> {
    if (this.browser) return;
    
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      logger.debug('Browser instance initialized');
    } catch (error) {
      logger.error('Failed to initialize browser', { error });
      throw error;
    }
  }
  
  async createContext(): Promise<BrowserContext> {
    if (!this.browser) {
      await this.initialize();
    }
    
    // Check if we've exceeded max concurrent contexts
    if (this.getContextSize() >= config.maxConcurrentContexts) {
      // Close the oldest context
      const oldestKey = this.getOldestContextKey();
      if (oldestKey !== undefined) {
        await this.closeContext(oldestKey);
      }
    }
    
    try {
      // Ensure browser is initialized
      if (!this.browser) {
        await this.initialize();
      }

      // Create a new browser context using the correct method
      const context = await this.browser!.createBrowserContext();
      const contextId = `ctx_${this.contextCounter++}`;
      this.contexts.set(contextId, context);

      // Set up automatic cleanup after timeout
      setTimeout(() => {
        this.closeContext(contextId);
      }, config.contextTimeoutMs);

      logger.debug('Created browser context', { contextId, totalContexts: this.getContextSize() });
      return context;
    } catch (error) {
      logger.error('Failed to create browser context', { error });
      throw error;
    }
  }
  
  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      try {
        await context.close();
        this.contexts.delete(contextId);
        logger.debug('Closed browser context', { contextId, remainingContexts: this.getContextSize() });
      } catch (error) {
        logger.error('Error closing browser context', { contextId, error });
      }
    }
  }
  
  async getPage(contextId: string): Promise<Page> {
    const context = this.contexts.get(contextId);
    if (!context) {
      throw new Error(`Context ${contextId} not found`);
    }
    
    const pages = await context.pages();
    if (pages.length === 0) {
      return await context.newPage();
    }
    return pages[0];
  }
  
  // Getter for context size
  getContextSize(): number {
    return this.contexts.size;
  }
  
  // Get the oldest context key (first inserted)
  getOldestContextKey(): string | undefined {
    return this.contexts.keys().next().value;
  }
  
  // Get the latest context key (last inserted)
  getLatestContextKey(): string | undefined {
    const keys = Array.from(this.contexts.keys());
    return keys.length > 0 ? keys[keys.length - 1] : undefined;
  }

  // Cleanup method for graceful shutdown
  async cleanup(): Promise<void> {
    for (const contextId of this.contexts.keys()) {
      await this.closeContext(contextId);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

}

// Domain validation helpers
function isDomainAllowed(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Check blocked domains first
    if (config.blockedDomains) {
      const blockedList = config.blockedDomains.split(',').map(d => d.trim()).filter(Boolean);
      if (blockedList.some(blocked => hostname.includes(blocked))) {
        logger.warn('Domain blocked by policy', { url, hostname });
        return false;
      }
    }
    
    // Check allowed domains (if specified)
    if (config.allowedDomains) {
      const allowedList = config.allowedDomains.split(',').map(d => d.trim()).filter(Boolean);
      if (allowedList.length > 0 && !allowedList.some(allowed => hostname.includes(allowed))) {
        logger.warn('Domain not in allowed list', { url, hostname });
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.warn('Invalid URL for domain checking', { url, error });
    return false;
  }
}

// Export functions for tools
// Single context for all browser operations (persistent across tool calls)
let sharedContextId: string | null = null;

async function getOrCreateSharedContext(): Promise<string> {
  const browserManager = BrowserManager.getInstance();
  if (!sharedContextId || !browserManager.getContexts().has(sharedContextId)) {
    const context = await browserManager.createContext();
    // Find the latest context ID
    const contextIds = [...browserManager.getContexts().keys()];
    sharedContextId = contextIds[contextIds.length - 1];
  }
  return sharedContextId;
}

export async function navigateToUrl(
  url: string,
  waitUntil: string = 'load',
  timeoutMs: number = config.navigationTimeoutMs
): Promise<string> {
  // Convert the string to PuppeteerLifeCycleEvent (the tool's schema ensures it's one of the valid values)
  const waitUntilEvent = waitUntil as PuppeteerLifeCycleEvent;
  if (!isDomainAllowed(url)) {
    throw new Error(`Navigation to ${url} is not allowed by domain policy`);
  }

  const browserManager = BrowserManager.getInstance();
  const contextId = await getOrCreateSharedContext();
  const page = await browserManager.getPage(contextId);

  logger.debug('Navigating to URL', { url, waitUntil, timeoutMs });
  logger.info('Starting navigation', { url });

  await page.goto(url, {
    waitUntil: waitUntilEvent,
    timeout: timeoutMs
  });

  const title = await page.title();
  logger.info('Navigation completed', { url, title });
  return `Page title: ${title}`;
}

export async function takeScreenshot(
  selector: string | undefined,
  fullPage: boolean = false,
  width: number | undefined,
  height: number | undefined
): Promise<string> {
  const browserManager = BrowserManager.getInstance();
  const contextId = await getOrCreateSharedContext();
  const page = await browserManager.getPage(contextId);

  // Set viewport if specified
  if (width && height) {
    await page.setViewport({ width, height });
  }

  logger.debug('Taking screenshot', { selector, fullPage, width, height });

  try {
    let buffer: Buffer;
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      const screenshotBuffer = await element.screenshot();
      buffer = Buffer.from(screenshotBuffer);
    } else {
      const screenshotBuffer = await page.screenshot({
        fullPage
      });
      buffer = Buffer.from(screenshotBuffer);
    }
    return buffer.toString('base64');
  } catch (err) {
    logger.error('Screenshot capture failed', { error: err });
    throw err;
  }
}

export async function clickElement(
  selector: string,
  timeoutMs: number = 5000
): Promise<void> {
  const browserManager = BrowserManager.getInstance();
  const contextId = await getOrCreateSharedContext();
  const page = await browserManager.getPage(contextId);

  logger.debug('Clicking element', { selector, timeoutMs });

  await page.waitForSelector(selector, { timeout: timeoutMs });
  await page.click(selector);
}

export async function fillForm(
  selector: string,
  value: string,
  timeoutMs: number = 5000
): Promise<void> {
  const browserManager = BrowserManager.getInstance();
  const contextId = await getOrCreateSharedContext();
  const page = await browserManager.getPage(contextId);

  logger.debug('Filling form', { selector, value, timeoutMs });

  await page.waitForSelector(selector, { timeout: timeoutMs });
  await page.evaluate((sel, val) => {
    const element = document.querySelector(sel);
    if (element) {
      // Handle different input types
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = val;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (element instanceof HTMLSelectElement) {
        element.value = val;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // For contenteditable or other elements
        element.textContent = val;
      }
    }
  }, selector, value);
}

export async function evaluateJavaScript(
  script: string,
  args: unknown[] = []
): Promise<unknown> {
  const browserManager = BrowserManager.getInstance();
  const contextId = await getOrCreateSharedContext();
  const page = await browserManager.getPage(contextId);

  logger.debug('Evaluating JavaScript', { script, args });

  // Wrap script in IIFE if it doesn't already start with a function
  // Puppeteer evaluate with string needs proper context for return statements
  const wrappedScript = script.trim().startsWith('function') || script.trim().startsWith('(')
    ? script
    : `(() => { return (${script}); })()`;

  try {
    const result = await page.evaluate(wrappedScript, ...args);
    return result;
  } catch (err: unknown) {
    // If IIFE wrapper fails, try without it (for simple expressions)
    if (err instanceof Error && err.message.includes('Illegal')) {
      const result = await page.evaluate(`(() => { ${script} })()`);
      return result;
    }
    throw err;
  }
}

export async function extractData(
  selector: string,
  attribute: string | undefined
): Promise<Array<string | null>> {
  const browserManager = BrowserManager.getInstance();
  const context = await browserManager.createContext();
  const page = await browserManager.getPage([...browserManager.getContexts().keys()].pop() as string);

  logger.debug('Extracting data', { selector, attribute });

  await page.waitForSelector(selector);

  if (attribute) {
    const elements = await page.$$(selector);
    const attributes = await Promise.all(
      elements.map(async el => {
        const attr = await el.evaluate((node, attrName) => node.getAttribute(attrName), attribute);
        return attr === null ? null : attr;
      })
    );
    return attributes;
  } else {
    const elements = await page.$$(selector);
    const texts = await Promise.all(
      elements.map(async el => {
        const text = await el.evaluate(node => node.textContent || "");
        return text;
      })
    );
    return texts;
  }
}

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down browser manager...');
  await BrowserManager.getInstance().cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down browser manager...');
  await BrowserManager.getInstance().cleanup();
  process.exit(0);
});
