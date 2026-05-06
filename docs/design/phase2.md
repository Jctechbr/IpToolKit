# Design: Phase 2 Tools — Tree, Diffs, Routes

## Objective

Add three network-analysis tools to IpToolKit's Phase 2 tab row. Tree gives an
interactive visual decomposition of a CIDR into halves. Diffs compares two
prefix lists and classifies entries as only-in-A, only-in-B, or shared. Routes
implements longest-prefix-match lookup against a user-supplied routing table.
All three follow the established SPA pattern: pure-function libs in `lib/`,
DOM/event logic in `tools/`, URL state via `hash_state.js`, and CSS via the
existing token system with no new stylesheets.

---

## Scope

In scope:
- `public/js/tools/tree.js` — Tree tool UI
- `public/js/tools/diffs.js` — Diffs tool UI
- `public/js/tools/routes.js` — Routes tool UI
- `public/js/lib/routes.js` — Pure routing-table parse + LPM computation (new lib)
- `public/index.html` — enable three currently-disabled tab buttons
- `public/js/app.js` — register tree/diffs/routes in the TOOLS map
- `tests/tree.test.mjs` — unit tests for tree interactions (DOM-free helpers)
- `tests/diffs.test.mjs` — unit tests for diff logic
- `tests/routes.test.mjs` — unit tests for lib/routes.js

Out of scope:
- IPv6 for Tree (split math on /128 or > /127 is degenerate; IPv4 only for MVP)
- IPv6 routing table support in Routes (IPv4 only for MVP; extend in Phase 3)
- Persist tree split state across page reloads (URL state carries only the root CIDR)
- Export/download for Tree and Routes output
- BGP/WHOIS/ASN data (requires backend)

---

## Module Structure

| File | Owner | Action | Purpose |
|---|---|---|---|
| `public/js/lib/routes.js` | builder-b | CREATE | Pure LPM lib: parse table, match destination |
| `public/js/tools/tree.js` | builder-a | CREATE | Tree tool: split UI, recursive render |
| `public/js/tools/diffs.js` | builder-a | CREATE | Diffs tool: compare two prefix lists |
| `public/js/tools/routes.js` | builder-b | CREATE | Routes tool: routing-table LPM UI |
| `public/index.html` | builder-b | MODIFY | Enable 3 tab buttons (remove aria-disabled, add data-tool) |
| `public/js/app.js` | builder-b | MODIFY | Add tree/diffs/routes to TOOLS map with ?v=1 cache busters |
| `tests/tree.test.mjs` | builder-a | CREATE | Tests for tree split helpers |
| `tests/diffs.test.mjs` | builder-a | CREATE | Tests for diff logic |
| `tests/routes.test.mjs` | builder-b | CREATE | Tests for lib/routes.js |

---

## Interfaces & Contracts

### lib/routes.js (new — pure, no DOM)

```js
/**
 * @typedef {{
 *   network: string,   // canonical CIDR e.g. "10.0.0.0/8"
 *   prefix: number,    // prefix length 0–32
 *   via: string,       // next-hop IP string (may be empty string for connected)
 *   raw: string        // original trimmed input line
 * }} Route
 */

/**
 * Parse a routing table from a multiline string.
 * Accepts lines of the form:
 *   <cidr> via <next-hop>
 *   <cidr> via <next-hop>  <optional trailing text ignored>
 *   <cidr>                 (no via — connected route; via = "")
 * Lines starting with # or ! are ignored.
 * Blank lines are ignored.
 * Throws if a CIDR is malformed — caller catches per-line.
 *
 * @param {string} text
 * @returns {{ routes: Route[], errors: string[] }}
 */
export function parseTable(text) { ... }

/**
 * Return all routes that match destIp, sorted by prefix length descending.
 * The first element is the longest-prefix (winning) match.
 * Returns [] when no route matches.
 * Throws if destIp is not a valid IPv4 address.
 *
 * @param {Route[]} routes
 * @param {string} destIp   — bare IPv4 address, e.g. "10.1.2.3"
 * @returns {Route[]}
 */
export function longestMatch(routes, destIp) { ... }

/**
 * Convenience wrapper: parse text then match.
 * @param {string} tableText
 * @param {string} destIp
 * @returns {{ matches: Route[], errors: string[] }}
 */
export function lookup(tableText, destIp) { ... }
```

Implementation notes for `longestMatch`:
- Convert destIp to uint32 via `ipToNum` from `lib/ipv4.js`
- For each route, apply `prefixToMask(route.prefix)` and compare
  `(destNum & mask) >>> 0 === networkNum`
- Sort results descending by prefix length; ties keep original order
- `0.0.0.0/0` (default route) is valid and matches everything

### tools/tree.js

```js
/**
 * @typedef {{
 *   cidr: string,        // canonical CIDR
 *   label: "root"|"split"|"leaf",
 *   depth: number,       // 0 = root
 *   children: [TreeNode, TreeNode] | null
 * }} TreeNode
 */

/**
 * Split a CIDR node into two equal halves.
 * Throws if prefix >= 32 (cannot split a /32).
 * @param {string} cidr
 * @returns {[string, string]}  two child CIDRs
 */
export function splitCidr(cidr) { ... }

export function init(container) { ... }
```

`splitCidr` is a pure helper that tools/tree.js can export so tests can import
it directly without DOM.

### tools/diffs.js

No new lib functions required. Diff logic is self-contained in the tool module
using existing `lib/prefix.js` exports. The diff computation lives in a
module-private pure function for testability:

```js
/**
 * @param {string[]} listA  normalized CIDRs
 * @param {string[]} listB  normalized CIDRs
 * @returns {{ onlyA: string[], onlyB: string[], both: string[] }}
 */
function computeDiff(listA, listB) { ... }

export function init(container) { ... }
```

`computeDiff` is exported named so `tests/diffs.test.mjs` can import it.

### tools/routes.js

```js
export function init(container) { ... }
```

Delegates all computation to `lib/routes.js`.

---

## Data Flow

### Tree

```
User types root CIDR
  → input[keydown Enter] or button click
  → parseCidr() from lib/ipv4.js validates input
  → build root TreeNode { cidr, label:"root", depth:0, children:null }
  → push("tree", { cidr }) via hash_state
  → renderTree(rootNode, treeContainer)
      renders indented rows with [Split] button on each leaf

User clicks [Split] on a node
  → splitCidr(node.cidr) → [childA, childB]
  → node.children = [{ cidr:childA, label:"split"/"leaf", depth:node.depth+1, children:null },
                      { cidr:childB, ... }]
  → re-render (no URL update — split state is session-only)

User clicks [Collapse] on a split node
  → node.children = null
  → re-render
```

### Diffs

```
User pastes List A and List B into textareas
  → clicks Compare button
  → parse each textarea: split on \n, trim, filter blanks/comments
  → normalize() each entry via lib/prefix.js; collect parse errors
  → dedupe() each list independently
  → computeDiff(normalizedA, normalizedB)
      onlyA = A \ B (Set difference)
      onlyB = B \ A
      both  = A ∩ B
  → sort() each group via lib/prefix.js
  → push("diffs", { a: encodeURIComponent(rawA), b: encodeURIComponent(rawB) })
  → render three labelled sections
```

### Routes

```
User fills routing table textarea and destination IP input
  → clicks Lookup button
  → parseTable(textareaValue) → { routes, errors }
  → display parse errors as warning banner (non-blocking)
  → longestMatch(routes, destIp) → sorted matches
  → push("routes", { table: encodeURIComponent(tableText), dest: destIp })
  → render: full match list (sorted desc by prefix len)
      first row highlighted as winning route
      zero matches → info banner "No matching route (unreachable)"
```

---

## Dependencies

No new npm packages. All computation uses:
- `lib/ipv4.js` — `parseCidr`, `ipToNum`, `networkAddress`, `prefixToMask`, `numToIp`
- `lib/prefix.js` — `normalize`, `dedupe`, `sort`, `parse`
- `lib/hash_state.js` — `decode`, `push`

These are already present. lib/routes.js imports from lib/ipv4.js only.

---

## UI Layout

### Tree

```
[tool-header]
  h1: Subnet Tree
  p: Enter a root IPv4 CIDR. Click Split to divide any block into two equal halves.

[card]
  label: Root CIDR
  input#tree-root  placeholder="10.0.0.0/8"
  [btn--primary: Build Tree]  [btn--secondary: Clear]

[div#tree-output]  (empty until Build)
  [div.tree-container]
    [div.tree-node data-depth="0"]
      [span.tree-indent]  (depth * 20px padding-left)
      [code.font-mono]  10.0.0.0/8
      [span.badge --info]  root  |  16,777,214 hosts
      [button.btn.btn--secondary.btn--sm]  Split   ← shown on leaf nodes
      [button.btn.btn--secondary.btn--sm]  Collapse ← shown on split nodes

    [div.tree-node data-depth="1"]  10.0.0.0/9   ... Split
    [div.tree-node data-depth="1"]  10.128.0.0/9 ... Split
```

Node label rules:
- depth === 0 and no children: "root" badge (--info)
- has children: "split" badge (--warning)
- no children and depth > 0: "leaf" badge (--special / neutral)

Max split depth: /30 (prefix 30 → children /31; /32 cannot split). The Split
button must be disabled (aria-disabled + greyed) when prefix >= 30 to avoid
generating /32 → /33 invalid splits.

### Diffs

```
[tool-header]
  h1: Prefix List Diff
  p: Paste two prefix lists. Get entries unique to each list and entries common to both.

[card]
  [two-col grid]
    [div.field]
      label: List A
      textarea#diffs-a  rows=10

    [div.field]
      label: List B
      textarea#diffs-b  rows=10

  [btn-row]
    [btn--primary: Compare]  [btn--secondary: Clear]

[div#diffs-result]
  [div.card --success-border]   "Only in A (N)"   → sorted CIDR list
  [div.card --error-border]     "Only in B (N)"   → sorted CIDR list
  [div.card]                    "In Both (N)"      → sorted CIDR list
```

Parse errors for each list appear as a collapsible warning banner above the
results. Empty group cards are still rendered but show "None" in grey text.

Hash state: `#diffs?a=<encoded>&b=<encoded>` — both restored on load and both
textareas pre-filled; Compare runs automatically if both params present.

### Routes

```
[tool-header]
  h1: Longest-Prefix Match
  p: Enter a routing table (one route per line: 10.0.0.0/8 via 192.168.1.1).
     Then look up a destination IP.

[card]
  label: Routing Table
  textarea#routes-table  rows=10
  placeholder:
    10.0.0.0/8 via 10.255.255.1
    192.168.1.0/24 via 192.168.0.1
    0.0.0.0/0 via 203.0.113.1

  [divider]

  label: Destination IP
  input#routes-dest  placeholder="10.1.2.3"

  [btn-row]
    [btn--primary: Lookup]  [btn--secondary: Clear]

[div#routes-result]
  [warning banner if parse errors]
  [table.data-table]
    thead: Prefix | Next Hop | Prefix Len | Match
    tbody rows — first row gets class .row--winner and --success-bg highlight
  OR
  [div.result-box --info]  "No matching route — destination is unreachable."
```

Hash state: `#routes?table=<encoded>&dest=<ip>` — restored on load; Lookup
runs automatically if both params present.

---

## CSS Token Usage

All three tools use only existing tokens. No new CSS classes beyond what Phase 1
tools already use.

| UI element | Token / class |
|---|---|
| Cards | `.card`, `--surface`, `--border` |
| Inputs / textareas | `.field__input`, `.field__textarea`, `.field__label` |
| Primary action | `.btn.btn--primary` (`--brand-primary`) |
| Secondary action | `.btn.btn--secondary` |
| Small buttons | `.btn--sm` |
| Tree indent | inline `padding-left: calc(var(--space-md) * depth)` |
| Root badge | `.badge --info` (`--info-bg`, `--info`) |
| Split badge | `.badge --warning` (`--warning-bg`, `--warning`) |
| Leaf badge | `.badge --special` (neutral grey; reuse `.badge` base) |
| Winning route row | inline `background: var(--success-bg); color: var(--success)` |
| Only-in-A card border | `border-color: var(--success-border)` (present, not added) |
| Only-in-B card border | `border-color: var(--error-border)` |
| Parse error banners | `.result-box.--error` / `.result-box.--warning` |
| Info / empty | `.result-box.--info` |
| Monospace values | `.font-mono` or `<code>` |

The `esc()` helper is defined locally in each tool module (same copy/paste
pattern as calculator.js, prefixlist.js, allocate.js).

---

## URL Hash State Fields

| Tool | Param | Type | Notes |
|---|---|---|---|
| tree | `cidr` | string | Root CIDR, e.g. `10.0.0.0/8`. Split state is not persisted. |
| diffs | `a` | string | encodeURIComponent of raw List A text |
| diffs | `b` | string | encodeURIComponent of raw List B text |
| routes | `table` | string | encodeURIComponent of full routing table text |
| routes | `dest` | string | Destination IP, bare (no CIDR) |

All params are optional; tools render empty state when absent.

---

## Error Handling Strategy

| Boundary | Strategy |
|---|---|
| Tree — invalid root CIDR | Catch from `parseCidr`; show `.result-box.--error`; do not render tree |
| Tree — split at /30 | Disable Split button at prefix >= 30; never call splitCidr with prefix >= 32 |
| Diffs — invalid CIDR line | Collect per-line errors; skip invalid; render warning banner with list of bad lines; continue with valid ones |
| Routes — invalid table line | `parseTable` returns `{ routes, errors }`; errors shown in warning banner; lookup proceeds with valid routes |
| Routes — invalid dest IP | `longestMatch` throws; catch in tool; show `.result-box.--error` |
| Routes — no matches | Not an error; render `.result-box.--info` "No matching route" |
| Hash state restore failure | Silent skip; tools render their default empty state |

Lib functions (`lib/routes.js`) throw `Error` with descriptive messages.
Tool modules catch at the outermost event handler and render an error box.
Never swallow silently.

---

## Test Surface

### tests/tree.test.mjs (builder-a)

Imports `splitCidr` from `../public/js/tools/tree.js` (pure export).

| Test | Assertion |
|---|---|
| splitCidr("10.0.0.0/8") | returns ["10.0.0.0/9", "10.128.0.0/9"] |
| splitCidr("192.168.0.0/24") | returns ["192.168.0.0/25", "192.168.1.128/25"] — wait, verify: network is 192.168.0.0, child A = 192.168.0.0/25, child B = 192.168.0.128/25 |
| splitCidr("10.0.0.0/31") | returns ["10.0.0.0/32", "10.0.0.1/32"] |
| splitCidr("10.0.0.0/32") | throws (cannot split /32) |
| splitCidr("0.0.0.0/0") | returns ["0.0.0.0/1", "128.0.0.0/1"] |

### tests/diffs.test.mjs (builder-a)

Imports `computeDiff` from `../public/js/tools/diffs.js`.

| Test | Assertion |
|---|---|
| Both lists empty | { onlyA:[], onlyB:[], both:[] } |
| Identical lists | all entries in `both`, onlyA and onlyB empty |
| Disjoint lists | all in onlyA/onlyB, both empty |
| Overlapping lists | correct partition |
| Duplicates within a list | dedupe before diff; count unique |
| Non-canonical input (e.g. "10.0.0.1/8") | normalized to "10.0.0.0/8" before comparison |

### tests/routes.test.mjs (builder-b)

Imports `parseTable`, `longestMatch`, `lookup` from `../public/js/lib/routes.js`.

| Test | Assertion |
|---|---|
| parseTable with valid lines | returns correct Route array, errors:[] |
| parseTable skips blank lines and comments | routes array excludes them |
| parseTable with malformed CIDR | errors contains entry, route not included |
| parseTable with no-via (connected) route | via === "" |
| longestMatch — exact match /32 | returns single route |
| longestMatch — default route 0.0.0.0/0 | matches any IP |
| longestMatch — multiple matches | sorted desc by prefix; first is winner |
| longestMatch — no match (no default route) | returns [] |
| longestMatch — invalid destIp | throws Error |
| longestMatch — 0.0.0.0/0 is last when longer match exists | order is prefix-len desc |
| lookup convenience wrapper | consistent with separate parse + match |

---

## Open Questions

None that block implementation. All decisions are resolved above.

Informational note: IPv6 routing table support (Routes tool) and IPv6 Tree
splitting are deferred to Phase 3. If the requirement changes, lib/routes.js
should be extended — the `Route` typedef can add a `family` field and
`longestMatch` can dispatch to lib/ipv6.js math, mirroring the pattern in
lib/prefix.js.

---

## File Ownership Summary

**builder-a** owns:
- `public/js/tools/tree.js` (create)
- `public/js/tools/diffs.js` (create, exports `computeDiff` and `splitCidr` for tests)
- `tests/tree.test.mjs` (create)
- `tests/diffs.test.mjs` (create)

**builder-b** owns:
- `public/js/lib/routes.js` (create)
- `public/js/tools/routes.js` (create)
- `tests/routes.test.mjs` (create)
- `public/index.html` (modify — enable all 3 Phase 2 tab buttons)
- `public/js/app.js` (modify — add tree, diffs, routes to TOOLS map)

Coordination point: builder-a's `splitCidr` export must be a named export at
the top level of `tools/tree.js` so tests can import it without a DOM
environment. builder-b has no dependency on builder-a's files and can proceed
in parallel.
