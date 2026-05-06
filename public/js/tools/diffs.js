/**
 * Prefix Diffs tool — compare two CIDR lists and show what's unique to each.
 */
import { normalize, dedupe, sort } from "../lib/prefix.js";
import { decode, push } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Parse a raw multiline string into normalised CIDRs, skipping invalid lines.
 * @param {string} raw
 * @returns {{valid: string[], invalidCount: number}}
 */
function parseList(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const valid = [];
  let invalidCount = 0;
  for (const line of lines) {
    try {
      valid.push(normalize(line));
    } catch {
      invalidCount++;
    }
  }
  return { valid, invalidCount };
}

/**
 * Compute set diff between two arrays of normalised CIDR strings.
 * @param {string[]} a  Normalised, deduped list A
 * @param {string[]} b  Normalised, deduped list B
 * @returns {{onlyA: string[], onlyB: string[], both: string[]}}
 */
export function diffPrefixes(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);

  const onlyA = sort(a.filter((c) => !setB.has(c)));
  const onlyB = sort(b.filter((c) => !setA.has(c)));
  const both = sort(a.filter((c) => setB.has(c)));

  return { onlyA, onlyB, both };
}

function sectionHtml(title, items, modifierClass, skipped) {
  const skipNote = skipped
    ? `<span class="diff-skip-note">${esc(skipped)} invalid line${skipped !== 1 ? "s" : ""} skipped</span>`
    : "";

  const rows = items.length
    ? items.map((c) => `<li><code>${esc(c)}</code></li>`).join("")
    : `<li class="diff-empty">None</li>`;

  return `
    <div class="result-box ${modifierClass} diff-section">
      <div class="diff-section__header">
        <strong>${esc(title)}</strong>
        <span class="diff-count">${esc(String(items.length))}</span>
        ${skipNote}
      </div>
      <ul class="diff-list">${rows}</ul>
    </div>`;
}

export function init(container) {
  const { params } = decode(location.hash);
  const initialA = params.a ? decodeURIComponent(params.a) : "";
  const initialB = params.b ? decodeURIComponent(params.b) : "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Prefix Diffs</h1>
    <p>Paste two CIDR lists and click <strong>Compare</strong> to see what's unique to each and what they share.</p>
  </div>
  <div class="card">
    <div class="diff-inputs">
      <div class="field">
        <label class="field__label" for="diff-a">List A</label>
        <textarea class="field__textarea" id="diff-a" rows="10"
                  spellcheck="false"
                  placeholder="10.0.0.0/24&#10;192.168.1.0/24">${esc(initialA)}</textarea>
      </div>
      <div class="field">
        <label class="field__label" for="diff-b">List B</label>
        <textarea class="field__textarea" id="diff-b" rows="10"
                  spellcheck="false"
                  placeholder="10.0.0.0/24&#10;172.16.0.0/12">${esc(initialB)}</textarea>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="diff-compare">Compare</button>
      <button class="btn btn--secondary" id="diff-clear">Clear</button>
    </div>
  </div>
  <div id="diff-result" style="margin-top:16px"></div>`;

  const taA = container.querySelector("#diff-a");
  const taB = container.querySelector("#diff-b");
  const result = container.querySelector("#diff-result");

  function compare() {
    result.innerHTML = "";
    const rawA = taA.value;
    const rawB = taB.value;

    push("diffs", {
      a: encodeURIComponent(rawA),
      b: encodeURIComponent(rawB),
    });

    const { valid: validA, invalidCount: badA } = parseList(rawA);
    const { valid: validB, invalidCount: badB } = parseList(rawB);

    const dedupedA = dedupe(validA);
    const dedupedB = dedupe(validB);

    const { onlyA, onlyB, both } = diffPrefixes(dedupedA, dedupedB);

    result.innerHTML = `
      ${sectionHtml("Only in A", onlyA, "--error", badA)}
      ${sectionHtml("Only in B", onlyB, "--info", badB)}
      ${sectionHtml("In both", both, "--success", 0)}`;
  }

  container.querySelector("#diff-compare").addEventListener("click", compare);
  container.querySelector("#diff-clear").addEventListener("click", () => {
    taA.value = "";
    taB.value = "";
    result.innerHTML = "";
    push("diffs", {});
  });

  if (initialA || initialB) compare();
  else taA.focus();
}
