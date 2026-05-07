/**
 * Routes tool — paste a routing table, enter a destination IP, and find the
 * longest-prefix-match winner.
 */
import { parseTable, longestMatch } from "../lib/routes.js";
import { decode, push } from "../lib/hash_state.js";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EXAMPLE_TABLE = `# Example routing table
0.0.0.0/0 via 203.0.113.1
10.0.0.0/8 via 10.255.255.1
10.10.0.0/16 via 10.10.255.1
10.10.20.0/24 via 10.10.20.1
192.168.1.0/24 via 192.168.1.254`;

/**
 * Render the result section after a lookup.
 *
 * @param {import("../lib/routes.js").LongestMatchResult} result
 * @param {string} destIp
 * @returns {string} HTML string
 */
function renderResult(result, destIp) {
  if (result.matches.length === 0) {
    return `<div class="result-box --warning">
      No match found for <strong>${esc(destIp)}</strong> — no route in the table covers this destination.
    </div>`;
  }

  const rows = result.matches
    .map((entry) => {
      const isWinner = entry === result.winner;
      const rowClass = isWinner ? "route-winner" : "";
      const matchBadge = isWinner
        ? `<span class="badge --success">Winner</span>`
        : `<span class="badge --special">Match</span>`;
      return `<tr class="${rowClass}">
        <td><code>${esc(entry.prefix)}</code></td>
        <td>${esc(String(entry.prefixLen))}</td>
        <td><code>${esc(entry.nexthop)}</code></td>
        <td>${matchBadge}</td>
      </tr>`;
    })
    .join("");

  return `<div class="card">
    <h3 class="card__title">
      Longest-Prefix Match for <code>${esc(destIp)}</code>
    </h3>
    <p class="route-winner-summary">
      Winner: <code>${esc(result.winner.prefix)}</code>
      via <code>${esc(result.winner.nexthop)}</code>
      (/${esc(String(result.winner.prefixLen))})
    </p>
    <table class="data-table">
      <thead>
        <tr>
          <th>Prefix</th>
          <th>Prefix Length</th>
          <th>Next-Hop</th>
          <th>Match</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * Initialise the Routes tool inside the given container element.
 *
 * @param {HTMLElement} container
 */
export function init(container) {
  const { params } = decode(location.hash);
  const initialTable = params.table ? params.table : "";
  const initialDest = params.dest || "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Route Lookup</h1>
    <p>
      Paste a routing table (one route per line), enter a destination IP, and
      find the <strong>longest-prefix-match</strong> winner.
      Supported formats: <code>10.0.0.0/8 via 192.168.1.1</code> or
      <code>10.0.0.0/8 192.168.1.1</code>. Lines starting with
      <code>#</code> are comments.
    </p>
  </div>

  <div class="card">
    <div class="field">
      <label class="field__label" for="rt-table">Routing Table</label>
      <textarea
        class="field__textarea"
        id="rt-table"
        rows="10"
        spellcheck="false"
        placeholder="${esc(EXAMPLE_TABLE)}"
      >${esc(initialTable)}</textarea>
    </div>

    <div class="field">
      <label class="field__label" for="rt-dest">Destination IP</label>
      <input
        class="field__input"
        id="rt-dest"
        type="text"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="10.10.20.55"
        value="${esc(initialDest)}"
      />
    </div>

    <div class="btn-row">
      <button class="btn btn--primary" id="rt-lookup">Lookup</button>
      <button class="btn btn--secondary" id="rt-clear">Clear</button>
    </div>
  </div>

  <div id="rt-result" style="margin-top:16px"></div>`;

  const tableEl = container.querySelector("#rt-table");
  const destEl = container.querySelector("#rt-dest");
  const resultEl = container.querySelector("#rt-result");

  function lookup() {
    const tableText = tableEl.value.trim();
    const dest = destEl.value.trim();

    if (!tableText) {
      resultEl.innerHTML = `<div class="result-box --info">Paste a routing table above.</div>`;
      return;
    }
    if (!dest) {
      resultEl.innerHTML = `<div class="result-box --info">Enter a destination IP address.</div>`;
      return;
    }

    push("routes", {
      table: tableText,
      dest,
    });

    let table;
    try {
      table = parseTable(tableText);
    } catch (err) {
      resultEl.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
      return;
    }

    if (table.length === 0) {
      resultEl.innerHTML = `<div class="result-box --warning">The routing table is empty — add at least one route.</div>`;
      return;
    }

    let result;
    try {
      result = longestMatch(table, dest);
    } catch (err) {
      resultEl.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
      return;
    }

    resultEl.innerHTML = renderResult(result, dest);
  }

  container.querySelector("#rt-lookup").addEventListener("click", lookup);

  container.querySelector("#rt-clear").addEventListener("click", () => {
    tableEl.value = "";
    destEl.value = "";
    resultEl.innerHTML = "";
    push("routes", {});
  });

  destEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lookup();
  });

  // Restore state from URL on load
  if (initialTable && initialDest) {
    lookup();
  } else {
    destEl.focus();
  }
}
