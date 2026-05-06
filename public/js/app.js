/**
 * Hash router, tab activation, theme toggle, and clipboard helpers.
 */
import { decode } from "./lib/hash_state.js";

const TOOLS = {
  calc:       () => import("./tools/calculator.js?v=2"),
  embed:      () => import("./tools/embed.js?v=2"),
  prefixlist: () => import("./tools/prefixlist.js?v=2"),
  allocate:   () => import("./tools/allocate.js?v=2"),
  option43:   () => import("./tools/option43.js?v=2"),
  aruba_dhcp: () => import("./tools/aruba_dhcp.js"),
  tree:       () => import("./tools/tree.js"),
  diffs:      () => import("./tools/diffs.js"),
  routes:     () => import("./tools/routes.js"),
  planner:    () => import("./tools/planner.js"),
  patterns:   () => import("./tools/patterns.js"),
  practice:   () => import("./tools/practice.js"),
};

const DEFAULT_TOOL = "calc";

// ---- Router ----------------------------------------------------------------

async function route() {
  const { toolId } = decode(location.hash);
  const id = TOOLS[toolId] ? toolId : DEFAULT_TOOL;

  // Update tab state
  document.querySelectorAll(".tab-btn[data-tool]").forEach((btn) => {
    const selected = btn.dataset.tool === id;
    btn.setAttribute("aria-selected", selected ? "true" : "false");
  });

  // Load + init tool
  const view = document.getElementById("view");
  try {
    const mod = await TOOLS[id]();
    view.innerHTML = "";
    mod.init(view);
  } catch (err) {
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
