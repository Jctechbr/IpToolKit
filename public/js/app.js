/**
 * Hash router, tab activation, theme toggle, and clipboard helpers.
 */
import { decode } from "./lib/hash_state.js";

const TOOLS = {
  calc:       () => import("./tools/calculator.js?v=2"),
  embed:      () => import("./tools/embed.js?v=3"),
  prefixlist: () => import("./tools/prefixlist.js?v=2"),
  allocate:   () => import("./tools/allocate.js?v=2"),
  option43:   () => import("./tools/option43.js?v=2"),
  aruba_dhcp: () => import("./tools/aruba_dhcp.js?v=2"),
  tree:       () => import("./tools/tree.js?v=2"),
  diffs:      () => import("./tools/diffs.js?v=2"),
  routes:     () => import("./tools/routes.js?v=2"),
  planner:    () => import("./tools/planner.js?v=2"),
  patterns:   () => import("./tools/patterns.js?v=2"),
  practice:   () => import("./tools/practice.js?v=2"),
};

const DEFAULT_TOOL = "calc";

// Start every tool with the shell. import() dedupes, so a later tab click
// waits on this request instead of beginning a new round trip.
for (const load of Object.values(TOOLS)) {
  load().catch(() => {});
}

// ---- Router ----------------------------------------------------------------

// Bumped on every hash change so a slow import cannot paint over a newer tab.
let routeSeq = 0;

async function route() {
  const seq = ++routeSeq;
  let toolId = "";
  try {
    toolId = decode(location.hash).toolId;
  } catch {
    toolId = "";
  }
  // Own keys only. "constructor" and "__proto__" exist on the prototype and are not tools.
  const id = Object.hasOwn(TOOLS, toolId) ? toolId : DEFAULT_TOOL;

  // Update tab state
  document.querySelectorAll(".tab-btn[data-tool]").forEach((btn) => {
    const selected = btn.dataset.tool === id;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
  });

  // Load + init tool. A cached module returns immediately; a cold one
  // used to leave the previous tool on screen for the whole wait.
  const view = document.getElementById("view");
  const slow = setTimeout(() => {
    if (seq !== routeSeq) return;
    view.innerHTML = `<div class="empty-state">Loading…</div>`;
  }, 120);
  try {
    const mod = await TOOLS[id]();
    clearTimeout(slow);
    if (seq !== routeSeq) return;
    view.innerHTML = "";
    mod.init(view);
  } catch (err) {
    clearTimeout(slow);
    if (seq !== routeSeq) return;
    view.innerHTML = `<div class="result-box --error" style="margin:24px">
      Failed to load tool: ${esc(err.message)}
    </div>`;
    console.error(err);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);

// Tab clicks
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = "#" + btn.dataset.tool;
    });
  });
  initTheme();
});

// ---- Theme toggle ----------------------------------------------------------

function initTheme() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;

  function getState() {
    return localStorage.getItem("itx-theme") || "system";
  }

  function setState(state) {
    const html = document.documentElement;
    if (state === "dark") {
      html.dataset.theme = "dark";
    } else if (state === "light") {
      html.dataset.theme = "light";
    } else {
      delete html.dataset.theme;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        html.dataset.theme = "dark";
      }
    }
    if (state === "system") localStorage.removeItem("itx-theme");
    else localStorage.setItem("itx-theme", state);
    updateIcon(state);
  }

  function updateIcon(state) {
    const icons = { light: "☀️", dark: "🌙", system: "⚙" };
    const svg = btn.querySelector("svg");
    if (svg) svg.style.display = "none";
    btn.setAttribute("title", `Theme: ${state} (click to cycle)`);
    btn.setAttribute("aria-label", `Current theme: ${state}. Click to change.`);
    // Replace with simple text icon
    let span = btn.querySelector(".theme-icon-text");
    if (!span) { span = document.createElement("span"); span.className = "theme-icon-text"; btn.appendChild(span); }
    span.textContent = icons[state] ?? "⚙";
  }

  btn.addEventListener("click", () => {
    const cur = getState();
    const next = cur === "system" ? "light" : cur === "light" ? "dark" : "system";
    setState(next);
  });

  updateIcon(getState());
}

// ---- Clipboard helper -------------------------------------------------------

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  const text = btn.dataset.copy ?? btn.previousElementSibling?.textContent ?? btn.textContent;
  navigator.clipboard?.writeText(text.trim()).then(() => {
    btn.classList.add("--copied");
    const orig = btn.textContent;
    btn.textContent = "✓";
    setTimeout(() => {
      btn.classList.remove("--copied");
      btn.textContent = orig;
    }, 1500);
  });
});

// ---- XSS helper (exported for tool modules) ---------------------------------

export function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
