/**
 * Prefix List tool — validate, classify, sort, aggregate, export.
 */
import { normalize, classify as classifyList, sort } from "../lib/prefix.js";
import { aggregate } from "../lib/aggregate.js";
import { classify as rfcClassify } from "../lib/rfc.js";
import { push, decode } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const EXAMPLE = `10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
2001:db8::/32
fd00::/8`;

export function init(container) {
  const { params } = decode(location.hash);
  const initial = params.prefixes ? params.prefixes : "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Prefix List</h1>
    <p>Paste one CIDR per line. Get validation, RFC classification, overlap detection, optional aggregation, and exports.</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="pl-input">Prefixes (one per line)</label>
      <textarea class="field__textarea" id="pl-input" rows="8" spellcheck="false"
                placeholder="${esc(EXAMPLE)}">${esc(initial)}</textarea>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="pl-parse">Validate &amp; Sort</button>
      <button class="btn btn--secondary" id="pl-aggregate">Aggregate</button>
      <button class="btn btn--secondary" id="pl-clear">Clear</button>
    </div>
  </div>
  <div id="pl-result" style="margin-top:16px"></div>`;

  const textarea = container.querySelector("#pl-input");
  const result = container.querySelector("#pl-result");

  function parseLines() {
    return textarea.value.split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"));
  }

  function render(prefixes, isAggregated = false) {
    if (prefixes.length === 0) {
      result.innerHTML = `<div class="result-box --info">No valid prefixes to display.</div>`;
      return;
    }

    // Classify issues
    const classified = classifyList(prefixes);
    const issues = classified.filter(c => c.issues.length > 0);

    let html = "";

    if (issues.length > 0) {
      html += `<div class="result-box --warning" style="margin-bottom:12px">
        <strong>${issues.length} issue${issues.length > 1 ? "s" : ""}:</strong>
        <ul style="margin:8px 0 0;padding-left:20px">
        ${issues.map(c => `<li><code>${esc(c.cidr)}</code>: ${esc(c.issues.join(", "))}</li>`).join("")}
        </ul>
      </div>`;
    }

    const sorted = sort(prefixes);

    html += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="card__title" style="margin:0">${isAggregated ? "Aggregated" : "Sorted"} Prefixes (${sorted.length})</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn--secondary btn--sm" id="pl-exp-text">⬇ Text</button>
          <button class="btn btn--secondary btn--sm" id="pl-exp-csv">⬇ CSV</button>
          <button class="btn btn--secondary btn--sm" id="pl-exp-json">⬇ JSON</button>
          <button class="btn btn--secondary btn--sm" id="pl-exp-cisco">⬇ Cisco</button>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Prefix</th>
            <th>Family</th>
            <th>Total Addresses</th>
            <th>RFC Class</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((cidr) => {
            const isV6 = cidr.includes(":");
            const family = isV6 ? "IPv6" : "IPv4";
            const prefix = parseInt(cidr.split("/")[1], 10);
            const total = isV6
              ? (1n << BigInt(128 - prefix)).toLocaleString()
              : (Math.pow(2, 32 - prefix)).toLocaleString();
            const tags = rfcClassify(cidr.split("/")[0]);
            return `<tr>
              <td><code>${esc(cidr)}</code>
                <button class="copy-btn" data-copy="${esc(cidr)}">⎘</button>
              </td>
              <td>${esc(family)}</td>
              <td>${esc(total)}</td>
              <td>${tags.slice(0, 2).map(t => `<span class="badge --special">${esc(t)}</span>`).join(" ")}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;

    result.innerHTML = html;

    // Export handlers
    result.querySelector("#pl-exp-text")?.addEventListener("click", () => downloadText(sorted.join("\n"), "prefixes.txt", "text/plain"));
    result.querySelector("#pl-exp-csv")?.addEventListener("click", () => {
      const rows = [["prefix","family","total_addresses","rfc_class"]];
      for (const cidr of sorted) {
        const isV6 = cidr.includes(":");
        const prefix = parseInt(cidr.split("/")[1], 10);
        const total = isV6 ? (1n << BigInt(128 - prefix)).toString() : Math.pow(2, 32 - prefix).toString();
        const tags = rfcClassify(cidr.split("/")[0]).join("; ");
        rows.push([cidr, isV6 ? "IPv6" : "IPv4", total, tags]);
      }
      downloadText(rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n"), "prefixes.csv", "text/csv");
    });
    result.querySelector("#pl-exp-json")?.addEventListener("click", () => {
      const data = sorted.map((cidr) => {
        const isV6 = cidr.includes(":");
        const prefix = parseInt(cidr.split("/")[1], 10);
        const total = isV6 ? (1n << BigInt(128 - prefix)).toString() : Math.pow(2, 32 - prefix).toString();
        return { prefix: cidr, family: isV6 ? "IPv6" : "IPv4", total_addresses: total, rfc_class: rfcClassify(cidr.split("/")[0]) };
      });
      downloadText(JSON.stringify(data, null, 2), "prefixes.json", "application/json");
    });
    result.querySelector("#pl-exp-cisco")?.addEventListener("click", () => {
      const lines = sorted.map((cidr, i) => {
        const isV6 = cidr.includes(":");
        const addr = cidr.split("/")[0];
        const prefix = cidr.split("/")[1];
        if (isV6) return `ipv6 prefix-list ITX_LIST seq ${(i + 1) * 5} permit ${cidr}`;
        return `ip prefix-list ITX_LIST seq ${(i + 1) * 5} permit ${cidr}`;
      });
      downloadText(lines.join("\n"), "prefixes.ios", "text/plain");
    });
  }

  function downloadText(text, filename, mime) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  container.querySelector("#pl-parse").addEventListener("click", () => {
    const lines = parseLines();
    const valid = [];
    const errors = [];
    for (const l of lines) {
      try { valid.push(normalize(l)); }
      catch (e) { errors.push(`${l}: ${e.message}`); }
    }
    if (errors.length) {
      result.innerHTML = `<div class="result-box --error" style="margin-bottom:12px">
        <strong>Parse errors:</strong>
        <ul style="margin:8px 0 0;padding-left:20px">
          ${errors.map(e => `<li>${esc(e)}</li>`).join("")}
        </ul>
      </div>`;
    }
    push("prefixlist", { prefixes: encodeURIComponent(valid.join("\n")) });
    render(valid);
  });

  container.querySelector("#pl-aggregate").addEventListener("click", () => {
    const lines = parseLines();
    const valid = [];
    for (const l of lines) {
      try { valid.push(normalize(l)); } catch (_) { /* skip invalid */ }
    }
    const agg = aggregate(valid);
    push("prefixlist", { prefixes: encodeURIComponent(agg.join("\n")) });
    render(agg, true);
  });

  container.querySelector("#pl-clear").addEventListener("click", () => {
    textarea.value = "";
    result.innerHTML = "";
    push("prefixlist", {});
  });

  if (initial) {
    const valid = [];
    for (const l of parseLines()) {
      try { valid.push(normalize(l)); } catch (_) { /* skip */ }
    }
    render(valid);
  }
}
