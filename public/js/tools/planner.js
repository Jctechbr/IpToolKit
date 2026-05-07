/**
 * Network Planner tool — VLSM allocation from a textarea of named requests.
 */
import { allocate } from "../lib/allocate.js";
import { push, decode } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Parse textarea text into an allocate() requests array.
 * Each non-blank line must be: `<name> <hosts>` or `<name> /<prefix>`.
 * Blank lines are skipped. Invalid lines throw an Error.
 * @param {string} text
 * @returns {Array<{label:string, size:string|number}>}
 */
export function parsePlannerRequests(text) {
  const requests = [];
  const lines = text.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const spaceIdx = line.search(/\s+/);
    if (spaceIdx === -1) throw new Error(`Invalid request line (missing size): "${line}"`);

    const name = line.slice(0, spaceIdx).trim();
    const sizeRaw = line.slice(spaceIdx).trim();

    if (!name) throw new Error(`Invalid request line (empty name): "${line}"`);

    if (sizeRaw.startsWith("/")) {
      const prefixLen = parseInt(sizeRaw.slice(1), 10);
      if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 128) {
        throw new Error(`Invalid prefix length in: "${line}"`);
      }
      requests.push({ label: name, size: sizeRaw });
    } else {
      const hosts = parseInt(sizeRaw, 10);
      if (isNaN(hosts) || hosts <= 0 || String(hosts) !== sizeRaw) {
        throw new Error(`Invalid host count in: "${line}"`);
      }
      requests.push({ label: name, size: hosts });
    }
  }
  return requests;
}

/**
 * Format a bigint host count as a readable string.
 * @param {bigint|number} n
 * @returns {string}
 */
function fmtHosts(n) {
  return typeof n === "bigint" ? n.toLocaleString() : String(n);
}

/**
 * Build a plain-text aligned table string for clipboard export.
 * @param {Array<{label:string, cidr:string, prefixLen:number, hostCount:bigint|number}>} assignments
 * @param {string} poolCidr
 * @param {Array<{start:string, end:string, size:bigint}>} free
 * @returns {string}
 */
function buildPlainText(assignments, poolCidr, free) {
  const rows = assignments.map((a) => [
    a.label,
    a.cidr,
    `/${a.prefixLen}`,
    fmtHosts(a.hostCount),
  ]);

  const headers = ["Name", "CIDR", "Prefix", "Usable Hosts"];
  const cols = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  );

  const pad = (s, w) => s.padEnd(w);
  const divider = cols.map((w) => "-".repeat(w)).join("  ");
  const header = headers.map((h, i) => pad(h, cols[i])).join("  ");
  const body = rows.map((r) => r.map((c, i) => pad(c, cols[i])).join("  ")).join("\n");

  let out = `Pool: ${poolCidr}\n\n${header}\n${divider}\n${body}`;

  if (free.length > 0) {
    out += "\n\nUnallocated:\n";
    out += free.map((f) => `  ${f.start} – ${f.end} (${f.size.toLocaleString()} addresses)`).join("\n");
  }
  return out;
}

export function init(container) {
  const { params } = decode(location.hash);
  const initialPool = params.pool ? params.pool : "";
  const initialReqs = params.reqs ? params.reqs : "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Network Planner</h1>
    <p>Enter a pool CIDR and a list of subnet requests (one per line: <code>Name hosts</code> or <code>Name /prefix</code>). Click Allocate to get a VLSM plan.</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="planner-pool">Pool CIDR</label>
      <input class="field__input mono" id="planner-pool" type="text"
             autocomplete="off" spellcheck="false"
             placeholder="e.g. 10.0.0.0/16"
             value="${esc(initialPool)}" />
    </div>
    <div class="field">
      <label class="field__label" for="planner-reqs">Requests (one per line)</label>
      <textarea class="field__textarea mono" id="planner-reqs" rows="8" spellcheck="false"
                placeholder="Servers 50&#10;Management /28&#10;DMZ 14&#10;P2P /30">${esc(initialReqs)}</textarea>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="planner-run">Allocate</button>
      <button class="btn btn--secondary" id="planner-clear">Clear</button>
    </div>
  </div>
  <div id="planner-result" style="margin-top:16px"></div>`;

  const poolInput = container.querySelector("#planner-pool");
  const reqsInput = container.querySelector("#planner-reqs");
  const result = container.querySelector("#planner-result");

  function run() {
    const pool = poolInput.value.trim();
    result.innerHTML = "";

    if (!pool) {
      result.innerHTML = `<div class="result-box --error">Enter a pool CIDR.</div>`;
      return;
    }

    let requests;
    try {
      requests = parsePlannerRequests(reqsInput.value);
    } catch (err) {
      result.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
      return;
    }

    if (requests.length === 0) {
      result.innerHTML = `<div class="result-box --warning">Add at least one request.</div>`;
      return;
    }

    push("planner", {
      pool: encodeURIComponent(pool),
      reqs: encodeURIComponent(reqsInput.value),
    });

    let allocation;
    try {
      allocation = allocate(pool, requests);
    } catch (err) {
      result.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
      return;
    }

    const { assignments, free, errors } = allocation;
    let html = "";

    if (errors.length) {
      html += `<div class="result-box --error" style="margin-bottom:12px">
        <strong>Errors:</strong>
        <ul style="margin:8px 0 0;padding-left:20px">
          ${errors.map((e) => `<li>${esc(e)}</li>`).join("")}
        </ul>
      </div>`;
    }

    if (assignments.length > 0) {
      const totalPool = pool.includes(":")
        ? 1n << BigInt(128 - parseInt(pool.split("/")[1], 10))
        : BigInt(Math.pow(2, 32 - parseInt(pool.split("/")[1], 10)));

      const rows = assignments.map((a) => {
        const blockSize = 1n << BigInt((pool.includes(":") ? 128 : 32) - a.prefixLen);
        const utilPct = totalPool > 0n
          ? ((blockSize * 10000n) / totalPool)
          : 0n;
        const utilStr = (Number(utilPct) / 100).toFixed(2) + "%";
        return { a, utilStr };
      });

      const plainText = buildPlainText(assignments, pool, free);

      html += `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="card__title" style="margin:0">Assignments (${esc(String(assignments.length))})</h3>
          <button class="btn btn--secondary btn--sm copy-btn"
                  data-copy="${esc(plainText)}">⎘ Copy as text</button>
        </div>
        <table class="data-table">
          <thead><tr>
            <th>Name</th><th>CIDR</th><th>Prefix</th><th>Usable Hosts</th><th>Utilisation</th>
          </tr></thead>
          <tbody>
            ${rows.map(({ a, utilStr }) => `<tr>
              <td>${esc(a.label)}</td>
              <td><code>${esc(a.cidr)}</code>
                <button class="copy-btn" data-copy="${esc(a.cidr)}">⎘</button></td>
              <td><code>/${esc(String(a.prefixLen))}</code></td>
              <td>${esc(fmtHosts(a.hostCount))}</td>
              <td>${esc(utilStr)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    }

    if (free.length > 0) {
      html += `<div class="card">
        <h3 class="card__title" style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:12px">
          Unallocated Space (${esc(String(free.length))} block${free.length !== 1 ? "s" : ""})
        </h3>
        <table class="data-table">
          <thead><tr><th>Start</th><th>End</th><th>Addresses</th></tr></thead>
          <tbody>
            ${free.map((f) => `<tr>
              <td><code>${esc(f.start)}</code></td>
              <td><code>${esc(f.end)}</code></td>
              <td>${esc(String(f.size))}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    }

    result.innerHTML = html || `<div class="result-box --info">No results.</div>`;
  }

  container.querySelector("#planner-run").addEventListener("click", run);

  container.querySelector("#planner-clear").addEventListener("click", () => {
    poolInput.value = "";
    reqsInput.value = "";
    result.innerHTML = "";
    push("planner", {});
  });

  reqsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) run();
  });

  if (initialPool && initialReqs) run();
  else poolInput.focus();
}
