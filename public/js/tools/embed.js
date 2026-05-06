/**
 * Embed IPv4-in-IPv6 tool — bidirectional conversion.
 */
import { embed, extract, bitLayout, MODES } from "../lib/embed.js";
import { push, decode } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function init(container) {
  const { params } = decode(location.hash);

  const modeOptions = Object.entries(MODES)
    .map(([key, def]) => `<option value="${esc(key)}">${esc(def.label)}</option>`)
    .join("");

  container.innerHTML = `
  <div class="tool-header">
    <h1>Embed IPv4 in IPv6</h1>
    <p>Convert between IPv4 and their IPv6 representation across common embedding schemes. Edit either field.</p>
  </div>
  <div class="card">
    <div class="grid-2" style="gap:16px;align-items:end">
      <div class="field">
        <label class="field__label" for="embed-mode">Embedding Mode</label>
        <select class="field__select" id="embed-mode">${modeOptions}</select>
      </div>
      <div class="field" id="custom-prefix-field" style="display:none">
        <label class="field__label" for="embed-custom">Custom /96 Prefix</label>
        <input class="field__input" id="embed-custom" type="text" placeholder="2001:db8::/96" />
      </div>
    </div>
    <hr class="divider" />
    <div class="grid-2" style="gap:16px">
      <div class="field">
        <label class="field__label" for="embed-v4">IPv4 Address</label>
        <input class="field__input mono" id="embed-v4" type="text" autocomplete="off" spellcheck="false"
               placeholder="192.0.2.1" value="${esc(params.v4 || "")}" />
      </div>
      <div class="field">
        <label class="field__label" for="embed-v6">IPv6 Address</label>
        <input class="field__input mono" id="embed-v6" type="text" autocomplete="off" spellcheck="false"
               placeholder="Auto-filled" value="${esc(params.v6 || "")}" />
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="embed-go">Convert</button>
      <button class="btn btn--secondary" id="embed-clear">Clear</button>
    </div>
  </div>

  <div id="embed-result" style="margin-top:16px"></div>

  <div class="card" style="margin-top:16px">
    <h3 class="card__title" style="font-size:0.875rem;margin-bottom:12px">Address Layout (IPv6 × 16-bit words)</h3>
    <div class="bit-grid" id="bit-grid"></div>
    <div style="margin-top:8px;font-size:0.75rem;color:var(--text-tertiary);display:flex;gap:16px">
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--info-bg);border:1px solid var(--info-border);vertical-align:middle"></span> Prefix</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--success-bg);border:1px solid var(--success-border);vertical-align:middle"></span> IPv4 payload</span>
      <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--surface-alt);border:1px solid var(--border-subtle);vertical-align:middle"></span> Zeroed</span>
    </div>
  </div>`;

  const modeEl = container.querySelector("#embed-mode");
  const customField = container.querySelector("#custom-prefix-field");
  const v4El = container.querySelector("#embed-v4");
  const v6El = container.querySelector("#embed-v6");
  const result = container.querySelector("#embed-result");
  const bitGrid = container.querySelector("#bit-grid");

  // Set initial mode
  if (params.mode && MODES[params.mode]) modeEl.value = params.mode;

  function updateCustomVisibility() {
    const needs = modeEl.value === "nat64-custom" || modeEl.value === "siit";
    customField.style.display = needs ? "" : "none";
  }
  modeEl.addEventListener("change", () => { updateCustomVisibility(); renderLayout(); });
  updateCustomVisibility();
  renderLayout();

  function customPrefix() {
    return container.querySelector("#embed-custom")?.value.trim() || "";
  }

  function doEmbed() {
    const v4 = v4El.value.trim();
    const mode = modeEl.value;
    if (!v4) return;
    try {
      const v6 = embed(v4, mode, customPrefix() || undefined);
      v6El.value = v6;
      result.innerHTML = `<div class="result-box --success">
        <code>${esc(v4)}</code> → <code>${esc(v6)}</code>
        <button class="copy-btn" data-copy="${esc(v6)}" style="margin-left:8px">⎘ Copy</button>
      </div>`;
      push("embed", { v4, v6, mode });
    } catch (err) {
      result.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
    }
  }

  function doExtract() {
    const v6 = v6El.value.trim();
    if (!v6) return;
    try {
      const extracted = extract(v6, customPrefix() || undefined);
      if (extracted) {
        v4El.value = extracted.ipv4;
        // Update mode selector
        if (MODES[extracted.mode]) modeEl.value = extracted.mode;
        updateCustomVisibility();
        renderLayout();
        result.innerHTML = `<div class="result-box --success">
          Extracted: <code>${esc(extracted.ipv4)}</code> (mode: <strong>${esc(MODES[extracted.mode]?.label ?? extracted.mode)}</strong>)
        </div>`;
        push("embed", { v4: extracted.ipv4, v6, mode: extracted.mode });
      } else {
        result.innerHTML = `<div class="result-box --warning">No recognized IPv4-in-IPv6 encoding found.</div>`;
      }
    } catch (err) {
      result.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
    }
  }

  container.querySelector("#embed-go").addEventListener("click", () => {
    if (v4El.value.trim()) doEmbed(); else doExtract();
  });
  container.querySelector("#embed-clear").addEventListener("click", () => {
    v4El.value = ""; v6El.value = ""; result.innerHTML = "";
    push("embed", {});
  });

  v4El.addEventListener("keydown", (e) => { if (e.key === "Enter") doEmbed(); });
  v6El.addEventListener("keydown", (e) => { if (e.key === "Enter") doExtract(); });

  function renderLayout() {
    const layout = bitLayout(modeEl.value);
    bitGrid.innerHTML = layout.map((w) => `
      <div class="bit-word">
        <div class="bit-word__bar --${w.type}" title="Word ${w.word}: ${esc(w.label)}"></div>
        <div class="bit-word__label">${esc(w.label)}</div>
      </div>`).join("");
  }

  // Auto-embed if params preset
  if (params.v4) doEmbed();
  else if (params.v6) doExtract();
}
