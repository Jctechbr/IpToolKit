/**
 * Aruba AP DHCP Option 43 / Option 60 Formatter.
 *
 * Option 43 wire format: 0x01 | len(n×4) | ip1[4] | ip2[4] | …
 * Option 60 Vendor Class Identifier sent by Aruba APs: "ArubaAP"
 */
import { ipToNum } from "../lib/ipv4.js";
import { push, decode } from "../lib/hash_state.js";

const VENDOR_CLASS = "ArubaAP";
const VENDOR_CLASS_HEX = Array.from(VENDOR_CLASS)
  .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
  .join(":");

function buildBytes(ips) {
  const payload = ips.flatMap((ip) => {
    const n = ipToNum(ip);
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  });
  return [0x01, payload.length, ...payload];
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

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function makeCardTitle(text) {
  const h3 = document.createElement("h3");
  h3.className = "card__title";
  h3.style.fontSize = "var(--text-sm)";
  h3.textContent = text;
  return h3;
}

function makeWarning(text) {
  const div = document.createElement("div");
  div.className = "result-box --warning";
  div.style.marginTop = "16px";
  div.textContent = text;
  return div;
}

export function init(container) {
  const { params } = decode(location.hash);
  const savedIps = params.ctlrs ? params.ctlrs : "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Aruba AP DHCP Options (43 &amp; 60)</h1>
    <p>Generates DHCP Option 43 (sub-option 0x01) for Aruba Instant APs and Campus APs
       to discover their Mobility Controller via CAPWAP, plus Option 60
       (Vendor Class Identifier = <code>ArubaAP</code>) matching config snippets.
       Enter one controller management IP per line (IPv4 only, max 8).</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="aruba-ips">Mobility Controller IPs</label>
      <textarea class="field__textarea" id="aruba-ips" rows="4" spellcheck="false"
                placeholder="10.1.1.1&#10;10.1.1.2"></textarea>
      <span class="field__hint">List controllers in failover-priority order.
        Aruba APs identify themselves with Option 60 = "ArubaAP".</span>
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="aruba-gen">Generate</button>
      <button class="btn btn--secondary" id="aruba-clear">Clear</button>
    </div>
  </div>
  <div id="aruba-result"></div>`;

  const textarea = container.querySelector("#aruba-ips");
  const resultEl = container.querySelector("#aruba-result");

  if (savedIps) textarea.value = savedIps;

  function generate() {
    const lines = textarea.value.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length === 0) {
      resultEl.innerHTML = "";
      resultEl.appendChild(makeWarning("Enter at least one controller IP address."));
      return;
    }
    if (lines.length > 8) {
      resultEl.innerHTML = "";
      resultEl.appendChild(makeWarning(`Maximum 8 controller IPs supported. Found ${lines.length}.`));
      return;
    }

    const invalid = [];
    const ips = [];
    for (const line of lines) {
      try { ipToNum(line); ips.push(line); }
      catch (_) { invalid.push(line); }
    }
    if (invalid.length) {
      const errDiv = document.createElement("div");
      errDiv.className = "result-box --error";
      errDiv.style.marginTop = "16px";
      const strong = document.createElement("strong");
      strong.textContent = "Invalid: ";
      errDiv.appendChild(strong);
      invalid.forEach((e, i) => {
        if (i > 0) errDiv.appendChild(document.createTextNode(", "));
        const code = document.createElement("code");
        code.textContent = e;
        errDiv.appendChild(code);
      });
      resultEl.innerHTML = "";
      resultEl.appendChild(errDiv);
      return;
    }

    push("aruba_dhcp", { ctlrs: encodeURIComponent(ips.join("\n")) });

    const bytes   = buildBytes(ips);
    const colon   = hexColon(bytes);
    const raw     = hexRaw(bytes);
    const lenHex  = (ips.length * 4).toString(16).padStart(2, "0");
    const lenDec  = ips.length * 4;

    // ---- Option 43 wire breakdown ----
    const wireCard = document.createElement("div");
    wireCard.className = "card";
    wireCard.style.marginTop = "16px";
    wireCard.appendChild(makeCardTitle("Option 43 Wire Format"));
    const wireTable = document.createElement("table");
    wireTable.className = "data-table";
    wireTable.innerHTML = `
      <thead><tr><th>Field</th><th>Hex</th><th>Dec</th><th>Meaning</th></tr></thead>
      <tbody>
        <tr><td>Sub-type</td><td><code>01</code></td><td>1</td><td>Aruba controller discovery</td></tr>
        <tr><td>Length</td><td><code>${esc(lenHex)}</code></td><td>${esc(String(lenDec))}</td>
            <td>${esc(String(ips.length))} controller × 4 bytes</td></tr>
        ${ips.map((ip, i) => `<tr>
            <td>Controller ${esc(String(i + 1))}</td>
            <td><code>${esc(ipHex(ip))}</code></td>
            <td colspan="2"><code>${esc(ip)}</code></td>
          </tr>`).join("")}
      </tbody>`;
    wireCard.appendChild(wireTable);

    // ---- Option 43 raw result ----
    const rawCard = document.createElement("div");
    rawCard.className = "card";
    rawCard.style.marginTop = "12px";
    rawCard.appendChild(makeCardTitle("Option 43 Result"));

    const rawRow = document.createElement("div");
    rawRow.style.display = "flex";
    rawRow.style.alignItems = "center";
    rawRow.style.gap = "12px";
    rawRow.style.flexWrap = "wrap";
    const colonCode = document.createElement("code");
    colonCode.style.fontSize = "1.1rem";
    colonCode.style.letterSpacing = ".06em";
    colonCode.textContent = colon;
    rawRow.appendChild(colonCode);
    rawRow.appendChild(makeCopyBtn(colon, "colon"));
    rawRow.appendChild(makeCopyBtn(raw, "raw"));
    rawCard.appendChild(rawRow);

    const rawMeta = document.createElement("div");
    rawMeta.style.marginTop = "6px";
    rawMeta.style.fontSize = "var(--text-sm)";
    rawMeta.style.color = "var(--text-tertiary)";
    rawMeta.textContent = `${bytes.length} bytes — sub-type(1) + length(1) + ${lenDec} address bytes`;
    rawCard.appendChild(rawMeta);

    // ---- Option 60 section ----
    const o60Card = document.createElement("div");
    o60Card.className = "card";
    o60Card.style.marginTop = "12px";
    o60Card.appendChild(makeCardTitle("Option 60 — Vendor Class Identifier"));

    const o60Desc = document.createElement("p");
    o60Desc.style.fontSize = "var(--text-sm)";
    o60Desc.style.color = "var(--text-secondary)";
    o60Desc.style.margin = "0 0 8px 0";
    o60Desc.textContent = `Aruba APs include Option 60 = "ArubaAP" in every DHCP Discover. `
      + `Configure your DHCP server to match this string and respond with the Option 43 above.`;
    o60Card.appendChild(o60Desc);

    const o60Row = document.createElement("div");
    o60Row.style.display = "flex";
    o60Row.style.alignItems = "center";
    o60Row.style.gap = "12px";
    o60Row.style.flexWrap = "wrap";
    const asciiCode = document.createElement("code");
    asciiCode.style.fontSize = "1.1rem";
    asciiCode.textContent = VENDOR_CLASS;
    o60Row.appendChild(asciiCode);
    o60Row.appendChild(makeCopyBtn(VENDOR_CLASS, "ASCII"));
    const vcHexCode = document.createElement("code");
    vcHexCode.textContent = VENDOR_CLASS_HEX;
    o60Row.appendChild(vcHexCode);
    o60Row.appendChild(makeCopyBtn(VENDOR_CLASS_HEX, "hex"));
    o60Card.appendChild(o60Row);

    // ---- Config snippets ----
    const cfgCard = document.createElement("div");
    cfgCard.className = "card";
    cfgCard.style.marginTop = "12px";
    cfgCard.appendChild(makeCardTitle("Config Snippets"));

    cfgCard.appendChild(makeSection(
      "Cisco IOS / IOS-XE — DHCP Pool with Vendor Class",
      `ip dhcp class ARUBA_APS\n option 60 ascii ArubaAP\n\nip dhcp pool AP_POOL\n network <subnet> <mask>\n default-router <gateway>\n class ARUBA_APS\n  option 43 hex ${raw}`,
      `option 43 hex ${raw}`,
      "Copy option line"
    ));

    cfgCard.appendChild(makeSection(
      "ISC DHCP (dhcpd.conf) — Class matching on Option 60",
      `class "aruba-aps" {\n  match if option vendor-class-identifier = "ArubaAP";\n}\n\nsubnet <network> netmask <mask> {\n  option routers <gateway>;\n  pool {\n    allow members of "aruba-aps";\n    option vendor-encapsulated-options ${colon};\n  }\n}`,
      `option vendor-encapsulated-options ${colon};`,
      "Copy option line"
    ));

    cfgCard.appendChild(makeSection(
      "MikroTik RouterOS",
      `/ip dhcp-server option\nadd code=43 name=aruba-option43 value="0x${raw}"\n\n/ip dhcp-server network\nset [find] dhcp-option=aruba-option43`,
      `/ip dhcp-server option\nadd code=43 name=aruba-option43 value="0x${raw}"`,
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
    note.textContent = "Note: Configure Option 43 on the DHCP scope serving the AP subnet. "
      + "Controller IPs may be on a different subnet — APs need only IP reachability. "
      + "CAPWAP requires UDP 5246 & 5247 open between the AP subnet and the controller management IP.";

    resultEl.innerHTML = "";
    resultEl.appendChild(wireCard);
    resultEl.appendChild(rawCard);
    resultEl.appendChild(o60Card);
    resultEl.appendChild(cfgCard);
    resultEl.appendChild(note);
  }

  container.querySelector("#aruba-gen").addEventListener("click", generate);
  container.querySelector("#aruba-clear").addEventListener("click", () => {
    textarea.value = "";
    resultEl.innerHTML = "";
    push("aruba_dhcp", {});
  });
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) generate();
  });

  if (savedIps) generate();
}
