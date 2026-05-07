/**
 * Cisco WLC DHCP Option 43 Formatter.
 *
 * Wire format: 0xf1 | len(n×4) | ip1[4] | ip2[4] | …
 */
import { ipToNum } from "../lib/ipv4.js";
import { push, decode } from "../lib/hash_state.js";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBytes(ips) {
  const payload = ips.flatMap((ip) => {
    const n = ipToNum(ip);
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  });
  return [0xf1, payload.length, ...payload];
}

function hexColon(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
}

function hexRaw(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ipHex(ip) {
  const n = ipToNum(ip);
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":");
}

function makePre(text) {
  const pre = document.createElement("pre");
  pre.className = "config-block";
  pre.textContent = text;
  return pre;
}

function makeCopyBtn(text, label) {
  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.dataset.copy = text;
  btn.textContent = `⎘ ${label}`;
  return btn;
}

function makeSection(heading, configText, copyText, copyLabel) {
  const frag = document.createDocumentFragment();
  const p = document.createElement("p");
  p.className = "section-heading";
  p.textContent = heading;
  frag.appendChild(p);
  frag.appendChild(makePre(configText));
  frag.appendChild(makeCopyBtn(copyText, copyLabel));
  return frag;
}

export function init(container) {
  const { params } = decode(location.hash);
  const savedIps = params.wlcs || "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Cisco WLC Option 43 Formatter</h1>
    <p>Generates DHCP Option 43 (vendor-encapsulated-options, sub-option 0xf1) for
       Cisco Aironet / Catalyst APs to discover their WLC via CAPWAP.
       Enter one WLC management IP per line (IPv4 only, max 8).</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="o43-ips">WLC Management IPs</label>
      <textarea class="field__textarea" id="o43-ips" rows="4" spellcheck="false"
                placeholder="192.168.100.10&#10;192.168.100.11"></textarea>
      <span class="field__hint">Cisco recommends listing WLCs in failover-priority order.</span>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="o43-gen">Generate</button>
      <button class="btn btn--secondary" id="o43-clear">Clear</button>
    </div>
  </div>
  <div id="o43-result"></div>`;

  const textarea = container.querySelector("#o43-ips");
  const resultEl = container.querySelector("#o43-result");

  // Restore saved IPs from URL without triggering auto-generate
  if (savedIps) textarea.value = savedIps;

  function generate() {
    const lines = textarea.value.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      resultEl.innerHTML = `<div class="result-box --warning" style="margin-top:16px">Enter at least one WLC IP address.</div>`;
      return;
    }
    if (lines.length > 8) {
      resultEl.innerHTML = `<div class="result-box --warning" style="margin-top:16px">Maximum 8 WLC IPs supported. Found ${esc(String(lines.length))}.</div>`;
      return;
    }

    const invalid = [];
    const ips = [];
    for (const line of lines) {
      try { ipToNum(line); ips.push(line); }
      catch (_) { invalid.push(line); }
    }
    if (invalid.length) {
      resultEl.innerHTML = `<div class="result-box --error" style="margin-top:16px">
        Invalid: ${invalid.map((e) => `<code>${esc(e)}</code>`).join(", ")}</div>`;
      return;
    }

    push("option43", { wlcs: ips.join("\n") });

    const bytes   = buildBytes(ips);
    const colon   = hexColon(bytes);
    const raw     = hexRaw(bytes);
    const lenHex  = (ips.length * 4).toString(16).padStart(2, "0");
    const lenDec  = ips.length * 4;

    // ---- Wire breakdown table ----
    const wireCard = document.createElement("div");
    wireCard.className = "card";
    wireCard.style.marginTop = "16px";
    wireCard.innerHTML = `
      <h3 class="card__title" style="font-size:.875rem">Option 43 Wire Format</h3>
      <table class="data-table">
        <thead><tr><th>Field</th><th>Hex</th><th>Dec</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>Sub-type</td><td><code>f1</code></td><td>241</td><td>Cisco WLC sub-option</td></tr>
          <tr><td>Length</td><td><code>${esc(lenHex)}</code></td><td>${esc(String(lenDec))}</td>
              <td>${esc(String(ips.length))} WLC × 4 bytes</td></tr>
          ${ips.map((ip, i) => `<tr>
              <td>WLC ${esc(String(i + 1))}</td>
              <td><code>${esc(ipHex(ip))}</code></td>
              <td colspan="2"><code>${esc(ip)}</code></td>
            </tr>`).join("")}
        </tbody>
      </table>`;

    // ---- Raw result ----
    const rawCard = document.createElement("div");
    rawCard.className = "card";
    rawCard.style.marginTop = "12px";
    rawCard.innerHTML = `
      <h3 class="card__title" style="font-size:.875rem">Result</h3>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <code style="font-size:1.1rem;letter-spacing:.06em">${esc(colon)}</code>
        <button class="copy-btn" data-copy="${esc(colon)}">⎘ colon</button>
        <button class="copy-btn" data-copy="${esc(raw)}">⎘ raw</button>
      </div>
      <div style="margin-top:6px;font-size:var(--text-sm);color:var(--text-tertiary)">
        ${esc(String(bytes.length))} bytes — type(1) + length(1) + ${esc(String(lenDec))} address bytes
      </div>`;

    // ---- Config snippets ----
    const cfgCard = document.createElement("div");
    cfgCard.className = "card";
    cfgCard.style.marginTop = "12px";
    cfgCard.innerHTML = `<h3 class="card__title" style="font-size:.875rem">Config Snippets</h3>`;

    cfgCard.appendChild(makeSection(
      "Cisco IOS / IOS-XE DHCP Pool",
      `ip dhcp pool AP_POOL\n network <subnet> <mask>\n default-router <gateway>\n option 43 hex ${raw}`,
      `option 43 hex ${raw}`,
      "Copy option line"
    ));

    cfgCard.appendChild(makeSection(
      "ISC DHCP (dhcpd.conf)",
      `subnet <network> netmask <mask> {\n  option routers <gateway>;\n  option vendor-encapsulated-options ${colon};\n}`,
      `option vendor-encapsulated-options ${colon};`,
      "Copy option line"
    ));

    cfgCard.appendChild(makeSection(
      "Mikrotik RouterOS",
      `/ip dhcp-server option\nadd code=43 name=wlc-option43 value="0x${raw}"\n\n/ip dhcp-server network\nset [find] dhcp-option=wlc-option43`,
      `/ip dhcp-server option\nadd code=43 name=wlc-option43 value="0x${raw}"`,
      "Copy"
    ));

    cfgCard.appendChild(makeSection(
      "Windows Server DHCP (hex string for Option 43)",
      raw,
      raw,
      "Copy hex"
    ));

    // ---- Note ----
    const note = document.createElement("div");
    note.className = "result-box --info";
    note.style.marginTop = "12px";
    note.style.fontSize = "var(--text-sm)";
    note.innerHTML = `<strong>Note:</strong> Configure this on the DHCP scope serving the AP subnet.
      WLC management IPs may be on a different subnet — APs need only IP reachability to the WLC.
      CAPWAP requires UDP 5246 &amp; 5247 open between the AP subnet and WLC.`;

    resultEl.innerHTML = "";
    resultEl.appendChild(wireCard);
    resultEl.appendChild(rawCard);
    resultEl.appendChild(cfgCard);
    resultEl.appendChild(note);
  }

  container.querySelector("#o43-gen").addEventListener("click", generate);
  container.querySelector("#o43-clear").addEventListener("click", () => {
    textarea.value = "";
    resultEl.innerHTML = "";
    push("option43", {});
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) generate();
  });

  // If IPs were restored from the URL, generate immediately
  if (savedIps) generate();
}
