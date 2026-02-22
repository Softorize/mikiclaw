import { Browser, BrowserContext, Page, chromium } from "playwright";
import { logger } from "../utils/logger.js";
import { validateUrl } from "../utils/validation.js";

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_TEXT_CHARS = 12000;
const MAX_SCRIPT_CHARS = 4000;
const MAX_SCREENSHOT_CHARS = 3000;
const MAX_SNAPSHOT_CHARS = 7000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

let browser: Browser | null = null;
const sessions = new Map<string, { context: BrowserContext; page: Page; lastUsedAt: number }>();

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... (truncated)`;
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function validateSelector(selector: string): { valid: boolean; error?: string } {
  if (!selector || typeof selector !== "string") {
    return { valid: false, error: "Selector is required" };
  }
  if (selector.length > 300) {
    return { valid: false, error: "Selector is too long (max 300 chars)" };
  }
  if (selector.includes("\0")) {
    return { valid: false, error: "Selector contains invalid characters" };
  }
  return { valid: true };
}

function serializeValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(
      value,
      (_key, currentValue) => (typeof currentValue === "bigint" ? currentValue.toString() : currentValue),
      2
    );
  } catch {
    return String(value);
  }
}

function touchSession(sessionId?: string): void {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const existing = sessions.get(normalizedSessionId);
  if (!existing) {
    return;
  }
  existing.lastUsedAt = Date.now();
  sessions.set(normalizedSessionId, existing);
}

async function closeIfIdle(): Promise<void> {
  const now = Date.now();
  const staleSessions: string[] = [];

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastUsedAt >= IDLE_TIMEOUT_MS) {
      staleSessions.push(sessionId);
    }
  }

  for (const sessionId of staleSessions) {
    await closeBrowserSession(sessionId);
  }
}

function normalizeSessionId(sessionId?: string): string {
  if (!sessionId || typeof sessionId !== "string") {
    return "default";
  }
  return sessionId.slice(0, 80);
}

async function ensurePage(sessionId?: string): Promise<Page> {
  await closeIfIdle();
  const normalizedSessionId = normalizeSessionId(sessionId);

  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled"
      ]
    });
  }

  const current = sessions.get(normalizedSessionId);
  if (current && !current.page.isClosed()) {
    touchSession(normalizedSessionId);
    return current.page;
  }

  if (current) {
    await current.context.close().catch(() => {});
  }

  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);

  sessions.set(normalizedSessionId, {
    context,
    page,
    lastUsedAt: Date.now()
  });

  return page;
}

export async function browserNavigate(rawUrl: string, sessionId?: string): Promise<string> {
  const input = rawUrl.trim();
  const linkedInPathMatch = input.match(/^\/?in\/[a-zA-Z0-9_-]+\/?$/);
  const normalizedRawUrl = linkedInPathMatch
    ? `https://www.linkedin.com/${input.replace(/^\//, "")}`
    : input;

  const url = normalizeUrl(normalizedRawUrl);
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return `⛔ ${urlValidation.error}`;
  }

  try {
    const currentPage = await ensurePage(sessionId);
    await currentPage.goto(url, { waitUntil: "domcontentloaded" });
    await currentPage.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    touchSession(sessionId);

    const title = (await currentPage.title()) || "Untitled page";
    return `🌐 Navigated to: ${currentPage.url()}\nTitle: ${title}`;
  } catch (error) {
    return `Error navigating browser: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserClick(selector: string, sessionId?: string): Promise<string> {
  const selectorValidation = validateSelector(selector);
  if (!selectorValidation.valid) {
    return `⛔ ${selectorValidation.error}`;
  }

  try {
    const currentPage = await ensurePage(sessionId);
    await currentPage.waitForSelector(selector, { state: "visible", timeout: 10000 });
    await currentPage.click(selector, { timeout: 10000 });
    await currentPage.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
    touchSession(sessionId);
    return `✅ Clicked: ${selector}\nCurrent URL: ${currentPage.url()}`;
  } catch (error) {
    return `Error clicking element: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserType(selector: string, text: string, sessionId?: string): Promise<string> {
  const selectorValidation = validateSelector(selector);
  if (!selectorValidation.valid) {
    return `⛔ ${selectorValidation.error}`;
  }
  if (typeof text !== "string") {
    return "⛔ Text must be a string";
  }
  if (text.length > 5000) {
    return "⛔ Text is too long (max 5000 chars)";
  }

  try {
    const currentPage = await ensurePage(sessionId);
    await currentPage.waitForSelector(selector, { state: "visible", timeout: 10000 });
    await currentPage.fill(selector, text);
    touchSession(sessionId);
    return `✅ Typed into: ${selector}`;
  } catch (error) {
    return `Error typing into element: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserContent(maxChars = 6000, sessionId?: string): Promise<string> {
  const safeLimit = Math.max(500, Math.min(maxChars, MAX_TEXT_CHARS));

  try {
    const currentPage = await ensurePage(sessionId);
    const payload = await currentPage.evaluate(() => {
      const bodyText = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
      return {
        title: document.title || "Untitled page",
        url: window.location.href,
        bodyText
      };
    });
    touchSession(sessionId);

    const clippedText = truncate(payload.bodyText || "(No text content found)", safeLimit);
    return `📄 ${payload.title}\n${payload.url}\n\n${clippedText}`;
  } catch (error) {
    return `Error getting page content: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserScreenshot(fullPage = false, sessionId?: string): Promise<string> {
  try {
    const currentPage = await ensurePage(sessionId);
    const image = await currentPage.screenshot({ fullPage, type: "png" });
    touchSession(sessionId);

    const base64 = image.toString("base64");
    const clipped = truncate(base64, MAX_SCREENSHOT_CHARS);
    const kb = Math.max(1, Math.round(image.byteLength / 1024));
    return `📸 Screenshot captured (${kb}KB PNG).\nBase64 preview:\n${clipped}`;
  } catch (error) {
    return `Error taking screenshot: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserEvaluate(script: string, sessionId?: string): Promise<string> {
  if (!script || typeof script !== "string") {
    return "⛔ Script is required";
  }
  if (script.length > MAX_SCRIPT_CHARS) {
    return `⛔ Script is too long (max ${MAX_SCRIPT_CHARS} chars)`;
  }

  try {
    const currentPage = await ensurePage(sessionId);
    const result = await currentPage.evaluate((code) => {
      try {
        const value = (0, eval)(code);
        return { ok: true, value };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }, script);
    touchSession(sessionId);

    if (!result.ok) {
      return `Error executing script: ${result.error}`;
    }

    return `🧪 Evaluate result:\n${truncate(serializeValue(result.value), 5000)}`;
  } catch (error) {
    return `Error evaluating script: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserFill(
  fields: unknown,
  sessionId?: string
): Promise<string> {
  let normalizedFields: Array<{ selector: string; text: string }> = [];

  if (Array.isArray(fields)) {
    normalizedFields = fields
      .filter((f): f is { selector: string; text: string } =>
        !!f && typeof f === "object" && typeof (f as any).selector === "string" && typeof (f as any).text === "string"
      );
  } else if (fields && typeof fields === "object") {
    normalizedFields = Object.entries(fields as Record<string, unknown>)
      .filter(([, value]) => typeof value === "string")
      .map(([selector, value]) => ({ selector, text: value as string }));
  }

  if (normalizedFields.length === 0) {
    return "⛔ No valid fields provided. Use fields as [{ selector, text }] or { selector: text }.";
  }

  if (normalizedFields.length > 20) {
    return "⛔ Too many fields (max 20)";
  }

  try {
    const currentPage = await ensurePage(sessionId);
    for (const field of normalizedFields) {
      const selectorValidation = validateSelector(field.selector);
      if (!selectorValidation.valid) {
        return `⛔ Invalid selector '${field.selector}': ${selectorValidation.error}`;
      }
      if (field.text.length > 5000) {
        return `⛔ Text for selector '${field.selector}' is too long (max 5000 chars)`;
      }
      await currentPage.waitForSelector(field.selector, { state: "visible", timeout: 10000 });
      await currentPage.fill(field.selector, field.text);
    }

    touchSession(sessionId);
    return `✅ Filled ${normalizedFields.length} field(s).`;
  } catch (error) {
    return `Error filling form fields: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserSelect(
  selector: string,
  value: string,
  sessionId?: string
): Promise<string> {
  const selectorValidation = validateSelector(selector);
  if (!selectorValidation.valid) {
    return `⛔ ${selectorValidation.error}`;
  }
  if (!value || typeof value !== "string") {
    return "⛔ A selection value is required";
  }
  if (value.length > 500) {
    return "⛔ Selection value is too long (max 500 chars)";
  }

  try {
    const currentPage = await ensurePage(sessionId);
    await currentPage.waitForSelector(selector, { state: "visible", timeout: 10000 });
    const selected = await currentPage.selectOption(selector, value);
    touchSession(sessionId);

    if (selected.length === 0) {
      return `⚠️ No option selected for '${selector}'. Check option value.`;
    }
    return `✅ Selected '${value}' on ${selector}.`;
  } catch (error) {
    return `Error selecting option: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserScroll(
  direction = "down",
  amount = 800,
  sessionId?: string
): Promise<string> {
  const normalizedDirection = direction.toLowerCase();
  if (!["up", "down"].includes(normalizedDirection)) {
    return "⛔ Direction must be 'up' or 'down'";
  }

  const safeAmount = Math.max(100, Math.min(Number.isFinite(amount) ? Math.abs(amount) : 800, 5000));

  try {
    const currentPage = await ensurePage(sessionId);
    const finalY = await currentPage.evaluate(
      ({ dir, pixels }) => {
        const delta = dir === "up" ? -pixels : pixels;
        window.scrollBy(0, delta);
        return Math.round(window.scrollY);
      },
      { dir: normalizedDirection, pixels: safeAmount }
    );
    touchSession(sessionId);
    return `✅ Scrolled ${normalizedDirection} by ${safeAmount}px. New Y: ${finalY}`;
  } catch (error) {
    return `Error scrolling page: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserBack(sessionId?: string): Promise<string> {
  try {
    const currentPage = await ensurePage(sessionId);
    const response = await currentPage.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
    touchSession(sessionId);
    if (!response) {
      return "⚠️ No previous page in history.";
    }
    return `⬅️ Went back to: ${currentPage.url()}\nTitle: ${await currentPage.title()}`;
  } catch (error) {
    return `Error navigating back: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserForward(sessionId?: string): Promise<string> {
  try {
    const currentPage = await ensurePage(sessionId);
    const response = await currentPage.goForward({ waitUntil: "domcontentloaded", timeout: 10000 });
    touchSession(sessionId);
    if (!response) {
      return "⚠️ No forward page in history.";
    }
    return `➡️ Went forward to: ${currentPage.url()}\nTitle: ${await currentPage.title()}`;
  } catch (error) {
    return `Error navigating forward: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function browserSnapshot(maxChars = 5000, sessionId?: string): Promise<string> {
  const safeLimit = Math.max(1000, Math.min(maxChars, MAX_SNAPSHOT_CHARS));

  try {
    const currentPage = await ensurePage(sessionId);
    const snapshot = await currentPage.evaluate(() => {
      const getText = (el: Element | null): string => (el?.textContent || "").replace(/\s+/g, " ").trim();

      const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
        .slice(0, 20)
        .map((el) => getText(el))
        .filter(Boolean);

      const links = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 20)
        .map((el) => ({
          text: getText(el).slice(0, 120),
          href: (el as HTMLAnchorElement).href
        }));

      const controls = Array.from(document.querySelectorAll("input, textarea, select, button"))
        .slice(0, 30)
        .map((el) => {
          const anyEl = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement;
          const tag = el.tagName.toLowerCase();
          const type = tag === "input" ? (anyEl as HTMLInputElement).type || "text" : tag;
          return {
            tag,
            type,
            id: el.id || "",
            name: (anyEl as any).name || "",
            placeholder: (anyEl as any).placeholder || "",
            text: getText(el).slice(0, 80)
          };
        });

      return {
        title: document.title || "Untitled page",
        url: window.location.href,
        headings,
        links,
        controls
      };
    });

    touchSession(sessionId);
    const rendered = truncate(serializeValue(snapshot), safeLimit);
    return `🧭 Page snapshot:\n${rendered}`;
  } catch (error) {
    return `Error getting page snapshot: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

export async function closeBrowserSession(sessionId?: string): Promise<void> {
  if (sessionId) {
    const normalizedSessionId = normalizeSessionId(sessionId);
    const session = sessions.get(normalizedSessionId);
    if (!session) {
      return;
    }
    if (!session.page.isClosed()) {
      await session.page.close().catch(() => {});
    }
    await session.context.close().catch(() => {});
    sessions.delete(normalizedSessionId);
  } else {
    for (const [id, session] of sessions.entries()) {
      if (!session.page.isClosed()) {
        await session.page.close().catch(() => {});
      }
      await session.context.close().catch(() => {});
      sessions.delete(id);
    }
  }

  if (browser && sessions.size === 0) {
    await browser.close().catch(() => {});
    logger.info("Browser session closed");
    browser = null;
  }
}

process.on("exit", () => {
  closeBrowserSession().catch(() => {});
});

process.on("SIGINT", () => {
  closeBrowserSession().catch(() => {});
});
