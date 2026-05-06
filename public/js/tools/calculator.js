/**
 * Subnet Calculator tool — IPv4 and IPv6.
 */
import { subnetInfo as v4Info } from "../lib/ipv4.js";
import { subnetInfo as v6Info } from "../lib/ipv6.js";
import { classify } from "../lib/rfc.js";
import { reverseDns } from "../lib/reverse_dns.js";
import { decode, push } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function badgeFor(tag) {
  const cls = tag.includes("Private") || tag.includes("Loopback") || tag.includes("Link-Local")
      || tag.includes("Unique Local") || tag.includes("ULA")
    ? "--private"
    : tag.includes("Public") || tag.includes("Global Unicast")
    ? "--public"
    : tag.includes("Documentation") || tag.includes("Reserved") || tag.includes("Broadcast")
    ? "--reserved"
    : "--special";
  return `<span class="badge ${cls}">${esc(tag)}</span>`;
}

function row(label, value, copy = false) {
  const copyBtn = copy
    ? `<button class="copy-btn" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}">⎘</button>`
    : "";
  return `<tr>
    <td>${esc(label)}</td>
    <td><span class="copy-cell">${esc(value)} ${copyBtn}</span></td>
  </tr>`;
}

function renderV4(info, tags, rdns) {
  return `
  <table class="kv-table">
    ${row("CIDR", info.cidr, true)}
    ${row("Network Address", info.networkAddress, true)}
    ${row("Broadcast Address", info.broadcastAddress, true)}
    ${row("First Usable Host", info.firstHost, true)}
    ${row("Last Usable Host", info.lastHost, true)}
    ${row("Usable Hosts", info.hostCount.toLocaleString())}
    ${row("Total Addresses", info.totalAddresses.toLocaleString())}
    ${row("Prefix Length", "/" + info.prefix)}
    ${row("Subnet Mask", info.netmask, true)}
    ${row("Wildcard Mask", info.wildcardMask, true)}
    ${row("Binary (network)", info.binary)}
    ${row("Hex (network)", info.hex)}
    <tr><td>RFC Class</td><td>${tags.map(badgeFor).join(" ")}</td></tr>
    ${row("rDNS Zone", rdns.zoneName, true)}
    ${row("BIND $ORIGIN", rdns.origin, true)}
    ${rdns.note ? `<tr><td>Note</td><td class="badge --special">${esc(rdns.note)}</td></tr>` : ""}
  </table>`;
}

function renderV6(info, tags, rdns) {
  return `
  <table class="kv-table">
    ${row("CIDR", info.cidr, true)}
    ${row("Compressed", info.compressed, true)}
    ${row("Expanded", info.expanded, true)}
    ${row("Network Address", info.networkAddress, true)}
    ${row("Last Address", info.lastAddress, true)}
    ${row("First Host", info.firstHost, true)}
    ${row("Last Host", info.lastHost, true)}
    ${row("Total Addresses", info.totalAddresses.toLocaleString())}
    ${row("Prefix Length", "/" + info.prefix)}
    ${row("Hex", info.hex)}
    <tr><td>RFC Class</td><td>${tags.map(badgeFor).join(" ")}</td></tr>
    ${row("rDNS Zone", rdns.zoneName, true)}
    ${row("BIND $ORIGIN", rdns.origin, true)}
    ${rdns.note ? `<tr><td>Note</td><td><span class="badge --special">${esc(rdns.note)}</span></td></tr>` : ""}
  </table>`;
}

export function init(container) {
  const { params } = decode(location.hash);
  const initial = params.q || "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Subnet Calculator</h1>
    <p>Enter an IPv4 or IPv6 CIDR, netmask, or bare address. Examples: <code>10.0.0.0/24</code>, <code>172.16.0.0 255.255.0.0</code>, <code>2001:db8::/48</code>.</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="calc-input">Address / CIDR</label>
      <input class="field__input" id="calc-input" type="text" autocomplete="off" autocorrect="off" spellcheck="false"
             placeholder="10.0.0.0/24  or  2001:db8::/32"
             value="${esc(initial)}" />
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="calc-btn">Calculate</button>
      <button class="btn btn--secondary" id="calc-clear">Clear</button>
    </div>
  </div>
  <div id="calc-result" style="margin-top:16px"></div>`;

  const input = container.querySelector("#calc-input");
  const result = container.querySelector("#calc-result");

  function calculate() {
    const val = input.value.trim();
    if (!val) { result.innerHTML = ""; return; }
    push("calc", { q: val });
    try {
      const isV6 = val.includes(":");
      if (isV6) {
        const info = v6Info(val);
        const tags = classify(info.networkAddress);
        const rdns = reverseDns(info.cidr);
        result.innerHTML = `<div class="card">${renderV6(info, tags, rdns)}</div>`;
      } else {
        const info = v4Info(val);
        const tags = classify(info.networkAddress);
        const rdns = reverseDns(info.cidr);
        result.innerHTML = `<div class="card">${renderV4(info, tags, rdns)}</div>`;
      }
    } catch (err) {
      result.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
    }
  }

  container.querySelector("#calc-btn").addEventListener("click", calculate);
  container.querySelector("#calc-clear").addEventListener("click", () => {
    input.value = "";
    result.innerHTML = "";
    push("calc", {});
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") calculate();
  });

  if (initial) calculate();
  else input.focus();
}
