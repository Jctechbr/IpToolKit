/**
 * Prefix Patterns tool — aggregation, RFC classification, and prefix-length histogram.
 */
import { normalize } from "../lib/prefix.js";
import { aggregate } from "../lib/aggregate.js";
import { classify } from "../lib/rfc.js";
import { push, decode } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Pure analysis of a list of CIDR strings.
 * Invalid strings are silently skipped (caller tracks the count).
 * @param {string[]} cidrs  Array of normalized CIDR strings.
 * @returns {{
 *   aggregated: string[],
 *   rfcCounts: Map<string, number>,
 *   histogram: Map<number, number>
 * }}
 */
export function classifyCidrs(cidrs) {
  const aggregated = aggregate(cidrs);

  const rfcCounts = new Map();
  for (const cidr of cidrs) {
    const addr = cidr.split("/")[0];
    const tags = classify(addr);
    for (const tag of tags) {
      rfcCounts.set(tag, (rfcCounts.get(tag) ?? 0) + 1);
    }
  }

  const histogram = new Map();
  for (const cidr of cidrs) {
    const len = parseInt(cidr.split("/")[1], 10);
    histogram.set(len, (histogram.get(len) ?? 0) + 1);
  }

  return { aggregated, rfcCounts, histogram };
}

/**
 * Parse the textarea, skip invalid lines, return valid normalized CIDRs + skip count.
 * @param {string} text
 * @returns {{valid: string[], skipped: number}}
 */
function parseInput(text) {
  let skipped = 0;
  const valid = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      valid.push(normalize(line));
    } catch (_) {
      skipped++;
    }
  }
  return { valid, skipped };
}

export function init(container) {
  const { params } = decode(location.hash);
  const initial = params.cidrs ? decodeURIComponent(params.cidrs) : "";

  const EXAMPLE = `10.0.0.0/24\n10.0.1.0/24\n172.16.0.0/12\n192.168.1.0/25\n192.168.1.128/25\n2001:db8::/32\nfd00::/8`;

  container.innerHTML = `
  <div class="tool-header">
    <h1>Prefix Patterns</h1>
    <p>Paste CIDRs (one per line). Get aggregation opportunities, RFC classification counts, and a prefix-length histogram.</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="patterns-input">Prefixes (one per line)</label>
      <textarea class="field__textarea" id="patterns-input" rows="10" spellcheck="false"
                placeholder="${esc(EXAMPLE)}">${esc(initial)}</textarea>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="patterns-run">Analyse</button>
      <button class="btn btn--secondary" id="patterns-clear">Clear</button>
    </div>
  </div>
  <div id="patterns-result" style="margin-top:16px"></div>`;

  const textarea = container.querySelector("#patterns-input");
  const result = container.querySelector("#patterns-result");

  function run() {
    result.innerHTML = "";
    const { valid, skipped } = parseInput(textarea.value);

    push("patterns", { cidrs: encodeURIComponent(textarea.value) });

    if (valid.length === 0) {
      result.innerHTML = `<div class="result-box --warning">No valid CIDRs found.${skipped > 0 ? ` (${skipped} invalid line${skipped !== 1 ? "s" : ""} skipped)` : ""}</div>`;
      return;
    }

    const { aggregated, rfcCounts, histogram } = classifyCidrs(valid);

    let html = "";

    if (skipped > 0) {
      html += `<div class="result-box --warning" style="margin-bottom:12px">
        ${esc(String(skipped))} invalid line${skipped !== 1 ? "s" : ""} skipped.
      </div>`;
    }

    // ── Aggregation panel ──────────────────────────────────────────────────
    const reduction = valid.length - aggregated.length;
    const reductionPct = valid.length > 0
      ? Math.round((reduction / valid.length) * 100)
      : 0;

    html += `<div class="card" style="margin-bottom:12px">
      <h3 class="card__title" style="margin-bottom:12px">Aggregation</h3>
      <p style="margin:0 0 12px;color:var(--text-secondary);font-size:var(--text-sm)">
        Input: <strong>${esc(String(valid.length))}</strong> prefix${valid.length !== 1 ? "es" : ""} &rarr;
        Output: <strong>${esc(String(aggregated.length))}</strong>
        ${reduction > 0
          ? `<span style="color:var(--success)">(${esc(String(reduction))} removed, ${esc(String(reductionPct))}% reduction)</span>`
          : `<span style="color:var(--text-tertiary)">(already optimal)</span>`}
      </p>
      <div style="font-family:var(--font-mono);font-size:var(--text-sm);line-height:1.8">
        ${aggregated.map((c) => `<div>${esc(c)}</div>`).join("")}
      </div>
    </div>`;

    // ── RFC Classification panel ───────────────────────────────────────────
    const rfcEntries = [...rfcCounts.entries()].sort((a, b) => b[1] - a[1]);

    html += `<div class="card" style="margin-bottom:12px">
      <h3 class="card__title" style="margin-bottom:12px">RFC Classification</h3>
      <ul style="margin:0;padding:0;list-style:none">
        ${rfcEntries.map(([tag, count]) =>
          `<li style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-subtle)">
            <span>${esc(tag)}</span>
            <strong>${esc(String(count))}</strong>
          </li>`
        ).join("")}
      </ul>
    </div>`;

    // ── Prefix-length histogram panel ─────────────────────────────────────
    const histEntries = [...histogram.entries()].sort((a, b) => a[0] - b[0]);
    const maxCount = Math.max(...histEntries.map(([, c]) => c));

    html += `<div class="card">
      <h3 class="card__title" style="margin-bottom:12px">Prefix-Length Histogram</h3>
      <div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 12px;align-items:center">
        ${histEntries.map(([len, count]) => {
          const widthPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
          return `
            <span style="font-family:var(--font-mono);font-size:var(--text-sm);text-align:right">/${esc(String(len))}</span>
            <div style="background:var(--border-subtle);border-radius:var(--radius-sm);overflow:hidden;height:18px">
              <div style="width:${esc(String(widthPct))}%;height:100%;background:var(--brand-primary-light);border-right:2px solid var(--brand-primary);min-width:${count > 0 ? "2" : "0"}px"></div>
            </div>
            <span style="font-size:var(--text-sm);color:var(--text-secondary)">${esc(String(count))}</span>`;
        }).join("")}
      </div>
    </div>`;

    result.innerHTML = html;
  }

  container.querySelector("#patterns-run").addEventListener("click", run);

  container.querySelector("#patterns-clear").addEventListener("click", () => {
    textarea.value = "";
    result.innerHTML = "";
    push("patterns", {});
  });

  if (initial) run();
  else textarea.focus();
}
