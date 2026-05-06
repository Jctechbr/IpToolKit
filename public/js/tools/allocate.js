/**
 * Allocate Subnets tool — VLSM best-fit allocator.
 */
import { allocate } from "../lib/allocate.js";
import { push, decode } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

let reqRows = [];
let nextId = 0;

export function init(container) {
  const { params } = decode(location.hash);
  const initialPool = params.pool || "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Allocate Subnets</h1>
    <p>VLSM best-fit allocator. Enter a pool and a list of subnet requests; get non-overlapping aligned assignments.</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="alloc-pool">Pool Prefix</label>
      <input class="field__input mono" id="alloc-pool" type="text" autocomplete="off" spellcheck="false"
             placeholder="10.0.0.0/8  or  2001:db8::/32" value="${esc(initialPool)}" />
    </div>
    <hr class="divider" />
    <h3 class="card__title" style="font-size:0.875rem;margin-bottom:12px">Requests</h3>
    <table class="data-table" id="req-table">
      <thead>
        <tr>
          <th>Label</th>
          <th>Size (hosts or /prefix)</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="req-body"></tbody>
    </table>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn--secondary btn--sm" id="add-row">+ Add Request</button>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="alloc-run">Allocate</button>
      <button class="btn btn--secondary" id="alloc-clear">Clear</button>
    </div>
  </div>
  <div id="alloc-result" style="margin-top:16px"></div>`;

  const tbody = container.querySelector("#req-body");
  const result = container.querySelector("#alloc-result");

  function addRow(label = "", size = "") {
    const id = nextId++;
    reqRows.push(id);
    const tr = document.createElement("tr");
    tr.dataset.rowId = id;
    tr.innerHTML = `
      <td><input class="field__input req-label" type="text" placeholder="e.g. Marketing" value="${esc(label)}" /></td>
      <td><input class="field__input req-size" type="text" placeholder="e.g. 50 or /27" value="${esc(size)}" /></td>
      <td><button class="btn btn--secondary btn--sm del-row" data-id="${id}">✕</button></td>`;
    tbody.appendChild(tr);
    tr.querySelector(".del-row").addEventListener("click", () => {
      tr.remove();
      reqRows = reqRows.filter(r => r !== id);
    });
  }

  // Default rows
  if (params.requests) {
    try {
      JSON.parse(decodeURIComponent(params.requests)).forEach(r => addRow(r.label, r.size));
    } catch (_) { addRow(); }
  } else {
    addRow("Site A", "50");
    addRow("Site B", "20");
    addRow("Mgmt", "/30");
  }

  container.querySelector("#add-row").addEventListener("click", () => addRow());

  container.querySelector("#alloc-run").addEventListener("click", () => {
    const pool = container.querySelector("#alloc-pool").value.trim();
    if (!pool) { result.innerHTML = `<div class="result-box --error">Enter a pool prefix.</div>`; return; }

    const requests = [];
    tbody.querySelectorAll("tr").forEach(tr => {
      const label = tr.querySelector(".req-label")?.value.trim() || "";
      const size  = tr.querySelector(".req-size")?.value.trim() || "";
      if (label || size) requests.push({ label: label || `Block${requests.length + 1}`, size });
    });

    if (requests.length === 0) {
      result.innerHTML = `<div class="result-box --warning">Add at least one request.</div>`;
      return;
    }

    push("allocate", { pool, requests: encodeURIComponent(JSON.stringify(requests)) });

    try {
      const { assignments, free, errors } = allocate(pool, requests);

      let html = "";

      if (errors.length) {
        html += `<div class="result-box --error" style="margin-bottom:12px">
          <strong>Errors:</strong>
          <ul style="margin:8px 0 0;padding-left:20px">
            ${errors.map(e => `<li>${esc(e)}</li>`).join("")}
          </ul>
        </div>`;
      }

      if (assignments.length > 0) {
        html += `<div class="card" style="margin-bottom:12px">
          <h3 class="card__title" style="font-size:0.875rem">Assignments (${assignments.length})</h3>
          <table class="data-table">
            <thead><tr>
              <th>Label</th><th>Prefix</th><th>First Host</th><th>Last Host</th><th>Hosts</th>
            </tr></thead>
            <tbody>
              ${assignments.map(a => `<tr>
                <td>${esc(a.label)}</td>
                <td><code>${esc(a.cidr)}</code>
                  <button class="copy-btn" data-copy="${esc(a.cidr)}">⎘</button></td>
                <td><code>${esc(a.firstHost)}</code></td>
                <td><code>${esc(a.lastHost)}</code></td>
                <td>${esc(String(a.hostCount))}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
      }

      if (free.length > 0) {
        html += `<div class="card">
          <h3 class="card__title" style="font-size:0.875rem;color:var(--text-secondary)">Free Blocks (${free.length})</h3>
          <table class="data-table">
            <thead><tr><th>Start</th><th>End</th><th>Addresses</th></tr></thead>
            <tbody>
              ${free.map(f => `<tr>
                <td><code>${esc(f.start)}</code></td>
                <td><code>${esc(f.end)}</code></td>
                <td>${esc(String(f.size))}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
      }

      result.innerHTML = html || `<div class="result-box --info">No results.</div>`;
    } catch (err) {
      result.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
    }
  });

  container.querySelector("#alloc-clear").addEventListener("click", () => {
    container.querySelector("#alloc-pool").value = "";
    tbody.innerHTML = "";
    reqRows = [];
    result.innerHTML = "";
    addRow();
    push("allocate", {});
  });
}
