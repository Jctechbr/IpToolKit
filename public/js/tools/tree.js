/**
 * Subnet Tree tool — interactively split a root IPv4 CIDR into halves.
 */
import { parseCidr, subnetInfo, networkAddress, numToIp, prefixToMask } from "../lib/ipv4.js";
import { decode, push } from "../lib/hash_state.js";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Split a CIDR into its two equal child subnets (prefix + 1).
 * @param {string} cidr  Canonical CIDR string e.g. "10.0.0.0/24"
 * @returns {[string, string]}  [leftCidr, rightCidr]
 */
export function splitSubnet(cidr) {
  const { ip, prefix } = parseCidr(cidr);
  if (prefix >= 32) throw new Error("Cannot split a /32");
  const childPrefix = prefix + 1;
  const mask = prefixToMask(childPrefix);
  const leftNet = (ip & mask) >>> 0;
  const halfSize = 1 << (32 - childPrefix);
  const rightNet = (leftNet + halfSize) >>> 0;
  return [`${numToIp(leftNet)}/${childPrefix}`, `${numToIp(rightNet)}/${childPrefix}`];
}

function hostLabel(info) {
  if (info.prefix === 32) return "1 host";
  if (info.prefix === 31) return "2 hosts (p2p)";
  return `${info.hostCount.toLocaleString()} hosts`;
}

function buildNode(cidr) {
  const info = subnetInfo(cidr);
  const canSplit = info.prefix < 32;

  const node = document.createElement("div");
  node.className = "tree-node";
  node.dataset.cidr = cidr;

  node.innerHTML = `
    <div class="tree-node__row">
      <code class="tree-node__cidr">${esc(cidr)}</code>
      <span class="tree-node__hosts">${esc(hostLabel(info))}</span>
      <button class="btn btn--sm btn--secondary tree-split-btn"
              ${canSplit ? "" : "disabled"}
              aria-label="Split ${esc(cidr)} into two halves">
        Split
      </button>
    </div>
    <div class="tree-node__children"></div>`;

  if (canSplit) {
    node.querySelector(".tree-split-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = node.querySelector(".tree-split-btn");
      btn.disabled = true;
      btn.textContent = "Split";

      const childrenEl = node.querySelector(".tree-node__children");
      const [left, right] = splitSubnet(cidr);
      childrenEl.appendChild(buildNode(left));
      childrenEl.appendChild(buildNode(right));
    });
  }

  return node;
}

export function init(container) {
  const { params } = decode(location.hash);
  const initial = params.cidr ? decodeURIComponent(params.cidr) : "";

  container.innerHTML = `
  <div class="tool-header">
    <h1>Subnet Tree</h1>
    <p>Enter a root IPv4 CIDR and click <strong>Build Tree</strong>. Use <strong>Split</strong> on any node to divide it into two equal halves.</p>
  </div>
  <div class="card">
    <div class="field">
      <label class="field__label" for="tree-input">Root CIDR</label>
      <input class="field__input" id="tree-input" type="text"
             autocomplete="off" autocorrect="off" spellcheck="false"
             placeholder="e.g. 10.0.0.0/16"
             value="${esc(initial)}" />
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="tree-build">Build Tree</button>
      <button class="btn btn--secondary" id="tree-clear">Clear</button>
    </div>
    <div id="tree-error" style="margin-top:12px"></div>
  </div>
  <div id="tree-output" style="margin-top:16px"></div>`;

  const input = container.querySelector("#tree-input");
  const errorBox = container.querySelector("#tree-error");
  const output = container.querySelector("#tree-output");

  function build() {
    const val = input.value.trim();
    errorBox.innerHTML = "";
    output.innerHTML = "";
    if (!val) return;

    push("tree", { cidr: encodeURIComponent(val) });

    try {
      const info = subnetInfo(val);
      const rootNode = buildNode(info.cidr);
      const wrapper = document.createElement("div");
      wrapper.className = "card tree-root";
      wrapper.appendChild(rootNode);
      output.appendChild(wrapper);
    } catch (err) {
      errorBox.innerHTML = `<div class="result-box --error">${esc(err.message)}</div>`;
    }
  }

  container.querySelector("#tree-build").addEventListener("click", build);
  container.querySelector("#tree-clear").addEventListener("click", () => {
    input.value = "";
    errorBox.innerHTML = "";
    output.innerHTML = "";
    push("tree", {});
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") build();
  });

  if (initial) build();
  else input.focus();
}
