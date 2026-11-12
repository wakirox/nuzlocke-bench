// Headless mode: the MCP server serves the built app (dist/) itself and drives it in a
// headless Chromium, so a run needs no browser tab — for unattended and repeated runs.
//
//   NUZLOCKE_HEADLESS=1            turn it on (build first: npm run build)
//   NUZLOCKE_BROWSER_PATH=<exe>    Chrome/Chromium to use instead of Playwright's own
//   NUZLOCKE_HEADED=1              show the window, drawn at a watchable pace (to watch a run live)
//   NUZLOCKE_HEADED=fast           show the window at full speed (it keeps up, the run isn't slowed)
//
// The page is opened at /?ai&headless: it connects to this server's own port and runs
// frames without pacing them for a viewer. Everything else (tools, rules, saves) is the
// same code a browser tab runs.

import { createReadStream, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Serves files from `root` (GET/HEAD only, no directory escapes). Returns false if it didn't handle the request. */
export function serveStatic(root, req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url ?? "/", "http://localhost");
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return true;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = resolve(root, "." + normalize(rel));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return true;
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return true;
  }
  res.writeHead(200, {
    // Data files (offsets .ini, text tables .tbl, patches .ips) are read as bytes or text by the app.
    "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  if (req.method === "HEAD") res.end();
  // A file gone or unreadable mid-send ends this response, not the server.
  else createReadStream(file).on("error", () => res.destroy()).pipe(res);
  return true;
}

/** Checks that the app has been built; returns the dist folder. */
export function distDir(projectRoot) {
  const dir = resolve(join(projectRoot, "dist"));
  if (!existsSync(join(dir, "index.html"))) {
    throw new Error(`Headless mode serves the built app, but ${dir} has no index.html. Run "npm run build" first.`);
  }
  return dir;
}

async function loadChromium() {
  for (const name of ["playwright-core", "playwright"]) {
    try {
      return (await import(name)).chromium;
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'Headless mode needs Playwright: "npm install --no-save playwright-core" and "npx playwright-core install chromium-headless-shell" ' +
      "(or set NUZLOCKE_BROWSER_PATH to an installed Chrome/Chromium).",
  );
}

/**
 * Launches Chromium on the app and keeps a page open: if the page crashes or closes it is
 * reopened (the run resumes from its autosave, like a reload). Returns a stop function.
 * `viewport` sizes the headless page (default 1100×900).
 */
export async function launchHeadless({ url, log, viewport = { width: 1100, height: 900 } }) {
  const chromium = await loadChromium();
  const headed = !!process.env.NUZLOCKE_HEADED;
  // Audio needs no user gesture; nothing plays anyway (volume starts at 0).
  const args = ["--autoplay-policy=no-user-gesture-required"];
  // Dark (the app follows the browser's colour scheme): easier to watch.
  let browser = null;
  let context;
  let profile = null;
  if (headed) {
    // A window to watch: an app window (no tabs or address bar) whose page fits the window, so it
    // can be tiled small. Its own empty profile, like the fresh context below.
    profile = mkdtempSync(join(tmpdir(), "nuzlocke-watch-"));
    context = await chromium.launchPersistentContext(profile, {
      headless: false,
      executablePath: process.env.NUZLOCKE_BROWSER_PATH || undefined,
      args: [...args, `--app=${url}`],
      viewport: null,
      colorScheme: "dark",
    });
  } else {
    browser = await chromium.launch({ headless: true, executablePath: process.env.NUZLOCKE_BROWSER_PATH || undefined, args });
    // A fresh context per server: empty IndexedDB, so the run comes from this server's save folder.
    context = await browser.newContext({ viewport, colorScheme: "dark" });
  }
  let stopped = false;
  let opened = false;

  const open = async () => {
    // The app window opens with the page already in it; a reopened page is a new window.
    const page = headed && !opened ? (context.pages()[0] ?? (await context.newPage())) : await context.newPage();
    opened = true;
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") log(`page ${m.type()}:`, m.text());
    });
    page.on("pageerror", (e) => log("page error:", e.message));
    page.on("crash", () => {
      log("page crashed — reopening");
      void page.close().catch(() => {});
    });
    page.on("close", () => {
      if (!stopped) setTimeout(() => void open().catch((e) => log("reopen failed:", e.message)), 1000);
    });
    // The app window already loads the page: don't load it a second time.
    if (page.url() === url) await page.waitForLoadState("load");
    else await page.goto(url, { waitUntil: "load" });
    log(`headless page open at ${url}`);
  };

  (browser ?? context).on(browser ? "disconnected" : "close", () => {
    if (!stopped) log("headless browser exited");
  });
  await open();
  return async () => {
    stopped = true;
    await (browser ?? context).close().catch(() => {});
    if (profile) rmSync(profile, { recursive: true, force: true });
  };
}
