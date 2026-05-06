# Design: Phase 3 Tools — Planner, Patterns, Practice

## Objective

Add three advanced tools to IpToolKit's Phase 3 tab row. Planner provides
hierarchical VLSM address planning with a downloadable plain-text output.
Patterns analyses a CIDR list across three dimensions — aggregation potential,
RFC classification breakdown, and prefix-length histogram — by composing existing
libs with no new library code. Practice delivers a subnetting quiz that generates
random IPv4 questions, checks answers with live explanation, and tracks a running
score in localStorage. All three follow the established SPA pattern: pure-function
libs in `lib/`, DOM/event logic in `tools/`, URL state via `hash_state.js`, CSS
via the existing token system, and no third-party dependencies.

---

## Scope

In scope:
- `public/js/tools/planner.js` — Planner tool UI
- `public/js/tools/patterns.js` — Patterns tool UI
- `public/js/tools/practice.js` — Practice tool UI
- `public/index.html` — enable three currently-disabled Phase 3 tab buttons
- `public/js/app.js` — register planner/patterns/practice in the TOOLS map
- `tests/planner.test.mjs` — unit tests for planner parsing helpers (builder-a3)
- `tests/patterns.test.mjs` — unit tests for patterns analysis helpers (builder-a3)
- `tests/practice.test.mjs` — unit tests for practice question generation and
  answer checking (builder-b3)

Out of scope:
- IPv6 support in Planner (allocate.js supports it but the UI is IPv4-only for
  Phase 3 MVP; extend later)
- IPv6 questions in Practice (IPv4 only; 128-bit quiz math is a separate phase)
- Server-side export or PDF generation (download is client-side plain-text Blob)
- Multi-user or shared score state (localStorage only, single browser)
- Timed quiz mode or difficulty levels (plain quiz only)
- Saving or sharing Planner / Patterns results via a permalink (URL state carries
  inputs only, not computed output)

---

## Module Structure

| File | Owner | Action | Purpose |
|---|---|---|---|
| `public/js/tools/planner.js` | builder-a3 | CREATE | Planner tool UI: pool input, request editor, allocation result table, download |
| `public/js/tools/patterns.js` | builder-a3 | CREATE | Patterns tool UI: textarea input, three analysis panels |
| `public/js/tools/practice.js` | builder-b3 | CREATE | Practice tool UI: quiz engine, answer form, score display |
| `public/index.html` | builder-b3 | MODIFY | Remove `aria-disabled="true"`, add `data-tool="planner"` / `"patterns"` / `"practice"` to the three Phase 3 buttons |
| `public/js/app.js` | builder-b3 | MODIFY | Add `planner`, `patterns`, `practice` to the TOOLS map with `?v=1` cache busters |
| `tests/planner.test.mjs` | builder-a3 | CREATE | Tests for `parsePlannerRequests` and `formatPlannerTable` |
| `tests/patterns.test.mjs` | builder-a3 | CREATE | Tests for `buildHistogram` and `buildRfcCounts` |
| `tests/practice.test.mjs` | builder-b3 | CREATE | Tests for `generateQuestion` and `checkAnswer` |

No new `lib/` files. All three tools import from existing libs only.

---

## Interfaces & Contracts

### tools/planner.js

All computation helpers are named exports at module level so the test file can
import them without a DOM environment.

```js
/**
 * Parse the free-text request area into structured request objects.
 * Each line: "<name>, <size>"  where size is either a host count integer
 * or a prefix string "/N".
 * Blank lines and lines starting with # are ignored.
 * Returns {valid, errors}; errors is an array of human-readable strings.
 *
 * @param {string} text
 * @returns {{ valid: Array<{label:string, size:string|number}>, errors: string[] }}
 */
export function parsePlannerRequests(text) { ... }

/**
 * Format an allocation result as a plain-text fixed-width table suitable
 * for download.  The table has columns: Name, CIDR, Usable Hosts, Util%.
 * The header and each row are separated by a line of dashes.
 *
 * @param {string} poolCidr
 * @param {Array<{label:string, cidr:string, hostCount:bigint|number, prefixLen:number}>} assignments
 * @param {Array<{start:string, end:string, size:bigint}>} free
 * @returns {string}
 */
export function formatPlannerTable(poolCidr, assignments, free) { ... }

export function init(container) { ... }
```

`parsePlannerRequests` must:
- Accept both `"Site A, 50"` and `"Site A, /27"` formats.
- Trim whitespace from name and size fields.
- Return an error string (not throw) for lines that cannot be parsed, so the
  rest of the list still processes.

`formatPlannerTable` must:
- Compute utilisation % as `(hostCount / poolTotalHosts) * 100`, rounded to one
  decimal place. Use `Number()` coercion from BigInt where needed.
- Pool total hosts: `2^(32-poolPrefix) - 2` (IPv4, prefix < 31). For /31 use 2,
  for /32 use 1.
- Free blocks are appended below assignments as rows with Name = "(free)" and
  Util% = blank.
- Column widths are determined by the longest value in each column (minimum 6
  chars per column).

### tools/patterns.js

```js
/**
 * Build a histogram of prefix lengths from a list of normalised CIDRs.
 * Returns a Map<number, number> keyed by prefix length.
 *
 * @param {string[]} cidrs  Normalised CIDR strings
 * @returns {Map<number, number>}
 */
export function buildHistogram(cidrs) { ... }

/**
 * Count prefixes per RFC category by calling classify() on each CIDR's
 * network address.  A CIDR can match multiple RFC categories; count each tag
 * independently.  Returns Map<string, number> keyed by tag string.
 *
 * @param {string[]} cidrs
 * @returns {Map<string, number>}
 */
export function buildRfcCounts(cidrs) { ... }

export function init(container) { ... }
```

`buildHistogram` and `buildRfcCounts` are named exports so tests can import them
directly.

### tools/practice.js

```js
/**
 * @typedef {{
 *   type: "network"|"broadcast"|"hostcount"|"smallestprefix",
 *   cidr: string,           // e.g. "10.0.5.128/26"  (already canonical)
 *   prompt: string,         // human-readable question string
 *   answer: string,         // canonical correct answer string
 *   explanation: string     // shown after submit
 * }} Question
 */

/**
 * Generate a random subnetting question.
 * Question types (chosen uniformly at random):
 *   "network"        — given CIDR, what is the network address?
 *   "broadcast"      — given CIDR, what is the broadcast address?
 *   "hostcount"      — given CIDR, how many usable host addresses?
 *   "smallestprefix" — given a host count N, what is the smallest prefix
 *                      length that accommodates N hosts?
 *                      (prompt shows host count; answer is "/N" string)
 * CIDR generation:
 *   - Random prefix length between 8 and 30 (inclusive).
 *   - Random network address drawn by generating a random 32-bit number,
 *     masking to the prefix (always canonical).
 *   - For "smallestprefix", derive host count from the randomly generated
 *     subnet's usable host count so the answer is always a valid prefix.
 *
 * @param {() => number} [rand]  Optional RNG injection; defaults to Math.random.
 *                               Must return [0, 1).
 * @returns {Question}
 */
export function generateQuestion(rand = Math.random) { ... }

/**
 * Check a user's answer string against the canonical answer.
 * Normalises both sides: trim whitespace, lowercase, strip leading slash
 * for prefix answers, strip leading zeros in octets for IP answers.
 * Returns true if they match.
 *
 * @param {Question} question
 * @param {string} userInput
 * @returns {boolean}
 */
export function checkAnswer(question, userInput) { ... }

export function init(container) { ... }
```

`generateQuestion` accepts an injectable RNG to make tests deterministic.
`checkAnswer` and `generateQuestion` are named exports for direct test import.

### LocalStorage schema for Practice scores

```js
// Key: "itx-practice"
// Value (JSON-serialised):
{
  "total": <number>,    // total questions attempted (incremented on submit)
  "correct": <number>   // correct answers (incremented only when checkAnswer returns true)
}
```

On first load when the key is absent, treat as `{ total: 0, correct: 0 }`.
The tool writes back the updated object after each submit. A "Reset scores"
button clears the key and resets the display to 0/0.

---

## Data Flow

### Planner

```
User enters pool CIDR (input#plan-pool)
User enters request lines (textarea#plan-requests):
  "Site A, 50"
  "WAN Links, /30"
  "Mgmt, /29"

User clicks [Allocate]:
  1. parsePlannerRequests(textarea.value)
       → { valid: [{label, size}, ...], errors: [...] }
  2. If parse errors → render warning banner; continue with valid entries.
  3. allocate(pool, valid) from lib/allocate.js
       → { assignments, free, errors }
  4. If allocate errors → render error banner (pool exhaustion, etc.)
  5. Render result table (name, CIDR, usable hosts, util%)
  6. Render free blocks section below assignments.
  7. push("planner", { pool: pool, requests: encodeURIComponent(textarea.value) })

User clicks [Download]:
  1. formatPlannerTable(pool, assignments, free) → plain-text string
  2. Trigger Blob download as "planner-<pool-safe>.txt"
     pool-safe: replace / and . with _ for filename.

On hash restore:
  1. decode(location.hash) → params
  2. Prefill pool input and textarea from params.pool / decodeURIComponent(params.requests)
  3. If both present, auto-run allocate.
```

### Patterns

```
User pastes CIDRs into textarea#pat-input (one per line).
User clicks [Analyse]:
  1. Split on \n, trim, filter blanks/comments.
  2. For each line: normalize(line) from lib/prefix.js; collect parse errors.
  3. Deduped valid CIDR list: dedupe(valid).
  4. Panel A — Aggregation:
       aggregated = aggregate(valid) from lib/aggregate.js
       Render: "N prefixes → M after aggregation (K merged)"
       List aggregated prefixes in a compact code block.
  5. Panel B — RFC Classification:
       counts = buildRfcCounts(valid)
       Render table: Tag | Count, sorted by count descending.
  6. Panel C — Prefix Length Histogram:
       histogram = buildHistogram(valid)
       Render table: /Prefix | Count | Bar (inline width proportional to max count).
  7. push("patterns", { prefixes: encodeURIComponent(textarea.value) })

On hash restore:
  1. Prefill textarea from decodeURIComponent(params.prefixes).
  2. If present, auto-run analyse.
```

### Practice

```
Page load / "Next Question":
  1. q = generateQuestion()
  2. Render prompt in #prac-prompt.
  3. Clear #prac-answer input and feedback panel.
  4. Read score from localStorage["itx-practice"] (default {total:0,correct:0}).
  5. Display running accuracy: correct / total (N/A when total === 0).

User types answer and clicks [Submit] (or presses Enter):
  1. correct = checkAnswer(q, answerInput.value)
  2. score.total++
  3. if correct: score.correct++
  4. localStorage.setItem("itx-practice", JSON.stringify(score))
  5. Render feedback:
       correct → green result-box showing "Correct!" + q.explanation
       wrong   → red result-box showing "Incorrect. Answer: <q.answer>" + q.explanation
  6. Disable answer input and submit button.
  7. Show [Next Question] button.
  8. Update accuracy display.

User clicks [Next Question]:
  1. Loop back to Page load step.

User clicks [Reset Scores]:
  1. localStorage.removeItem("itx-practice")
  2. Re-render score as 0/0.
  3. Do not change or reset the current question.

URL hash state: Planner and Patterns use hash state; Practice does NOT persist
question or score in the URL (score is in localStorage; question state is
session-only).
```

---

## Dependencies

No new packages. All three tools compose existing libs:

| Lib | Used by |
|---|---|
| `lib/allocate.js` — `allocate`, `hostsToPrefixLen` | Planner |
| `lib/aggregate.js` — `aggregate` | Patterns |
| `lib/rfc.js` — `classify` | Patterns |
| `lib/prefix.js` — `normalize`, `dedupe`, `sort`, `parse` | Patterns |
| `lib/ipv4.js` — `parseCidr`, `networkAddress`, `broadcastAddress`, `hostCount`, `numToIp`, `ipToNum`, `prefixToMask` | Practice, Planner (via allocate) |
| `lib/hash_state.js` — `decode`, `push` | Planner, Patterns |

---

## UI Layout

### Planner

```
[tool-header]
  h1: Address Planner
  p: Enter a pool and named subnet requests. Get VLSM allocations with utilisation.

[card]
  [field]
    label: Pool Prefix
    input#plan-pool  type=text  placeholder="10.0.0.0/8 or 2001:db8::/32"
  [divider]
  [field]
    label: Requests (one per line: Name, host-count or /prefix)
    textarea#plan-requests  rows=8  spellcheck=false
    placeholder:
      "Site A, 200"
      "WAN Core, /30"
      "Management, 10"
  [btn-row]
    [btn--primary: Allocate]  [btn--secondary: Clear]

[div#plan-result]  (empty until Allocate)
  [result-box --warning]  (parse errors, if any)
  [result-box --error]    (allocate errors, if any)
  [div.card]
    h3: Allocations (N)
    [table.data-table]
      thead: Name | CIDR | Usable Hosts | Util%
      tbody: one row per assignment
             free blocks appended with Name="(free)", Util%="-"
    [btn-row]
      [btn--secondary: Download .txt]
```

Notes:
- The result table is always sorted by CIDR address ascending (same order
  allocate.js returns, since it assigns in address order).
- Util% cells: if > 80% use `--warning` color on the cell text; if 100% use
  `--success`. Free rows show "-" in that column.
- CIDR cells get a copy button (`.copy-btn` pattern from existing tools).

### Patterns

```
[tool-header]
  h1: CIDR Pattern Analyser
  p: Paste a prefix list. See aggregation potential, RFC class breakdown,
     and prefix-length distribution.

[card]
  [field]
    label: Prefixes (one per line)
    textarea#pat-input  rows=10  spellcheck=false
  [btn-row]
    [btn--primary: Analyse]  [btn--secondary: Clear]

[div#pat-result]
  [div.card]  -- Panel A: Aggregation
    h3: Aggregation
    [result-box --info]
      "N prefixes → M after aggregation (K merged)"
    [pre.font-mono or ul] list of aggregated CIDRs

  [div.card]  -- Panel B: RFC Classification
    h3: RFC Classification
    [table.data-table]
      thead: Category | Count
      tbody: rows sorted by count desc

  [div.card]  -- Panel C: Prefix Length Histogram
    h3: Prefix Length Distribution
    [table.data-table]
      thead: Prefix Length | Count | Distribution
      tbody: rows sorted by prefix length asc
             Distribution column is a visual bar:
             <div style="width: calc(N/maxN * 200px); background: var(--brand-primary); height: 12px; border-radius: var(--radius-sm)">
```

Notes:
- Panels render only after Analyse is clicked; the div#pat-result is empty
  on load.
- If zero valid prefixes remain after parse errors, show a single
  `.result-box.--error` and no panels.
- Parse errors appear above the panels as a `.result-box.--warning` listing
  the offending lines; valid lines still proceed.

### Practice

```
[tool-header]
  h1: Subnetting Practice
  p: Answer randomly generated IPv4 subnetting questions. Score is saved locally.

[card.prac-score-card]  -- always visible
  "Score: <correct> / <total>  (<accuracy>%)"
  [btn--secondary btn--sm: Reset Scores]  (right-aligned)

[div.card]  -- question card
  [p#prac-prompt.font-mono]  -- question text, e.g.:
    "Given 10.44.128.0/19, what is the broadcast address?"

  [field]
    label: Your answer
    input#prac-answer  type=text  autocomplete=off  spellcheck=false
    placeholder: e.g. 10.44.159.255

  [btn-row]
    [btn--primary#prac-submit: Submit]

[div#prac-feedback]  -- hidden until submit
  [result-box --success]  "Correct! — <explanation>"
  OR
  [result-box --error]    "Incorrect. Correct answer: <answer> — <explanation>"

[btn-row]  -- hidden until submit
  [btn--primary#prac-next: Next Question]
```

Notes:
- On submit, the answer input and submit button are `disabled` to prevent
  re-submission without clicking Next.
- The "Next Question" button is hidden until the user submits an answer.
- The score card always shows the current totals; it updates immediately after
  each submission.
- For "smallestprefix" questions the placeholder text is "e.g. /24" to guide
  format expectations.

---

## CSS Token Usage

No new CSS classes or stylesheets beyond what Phase 1 and 2 tools already use.

| UI element | Token / class |
|---|---|
| Cards | `.card`, `--surface`, `--border` |
| Inputs / textareas | `.field__input`, `.field__textarea`, `.field__label` |
| Primary action | `.btn.btn--primary` (`--brand-primary`) |
| Secondary action | `.btn.btn--secondary` |
| Small buttons | `.btn--sm` |
| Error banners | `.result-box.--error` |
| Warning banners | `.result-box.--warning` |
| Info banners | `.result-box.--info` |
| Success banners | `.result-box.--success` |
| Correct feedback | `.result-box.--success` (`--success-bg`, `--success`) |
| Wrong feedback | `.result-box.--error` (`--error-bg`, `--error`) |
| High-util cell text | inline `color: var(--warning)` (> 80%) or `var(--success)` (100%) |
| Histogram bar | inline `background: var(--brand-primary)` div |
| Score display | `.card` with standard `--text-primary` |
| Monospace values | `<code>` or `.font-mono` class |
| Copy buttons | `.copy-btn` with `data-copy` attribute (existing global handler) |

The `esc()` helper is defined locally in each tool module, following the
established copy-paste pattern from allocate.js, prefixlist.js, and all
Phase 2 tools.

---

## URL Hash State Fields

| Tool | Param | Type | Notes |
|---|---|---|---|
| planner | `pool` | string | Pool CIDR, bare (e.g. `10.0.0.0/8`) |
| planner | `requests` | string | `encodeURIComponent` of raw textarea text |
| patterns | `prefixes` | string | `encodeURIComponent` of raw textarea text |
| practice | — | — | No hash state. Score in localStorage; question is session-only |

All params are optional; tools render empty state when absent. Planner
auto-runs only when both `pool` and `requests` are present. Patterns auto-runs
when `prefixes` is present.

---

## Error Handling Strategy

| Boundary | Strategy |
|---|---|
| Planner — invalid pool CIDR | Catch from `allocate()`; show `.result-box.--error`; do not render table |
| Planner — parse error on request line | `parsePlannerRequests` collects per-line errors; bad lines skipped; warn banner lists them; allocation proceeds with valid lines |
| Planner — pool exhaustion | `allocate()` returns `errors[]`; render as `.result-box.--error` above the (partial) result table |
| Planner — empty request list after filtering | Show `.result-box.--warning`: "Add at least one request." |
| Patterns — invalid CIDR line | Collect per-line errors; skip invalid; render warning banner; continue with valid lines |
| Patterns — zero valid prefixes | Show `.result-box.--error`; render no panels |
| Practice — `generateQuestion` | Internally safe; never throws (all inputs are generated, not user-supplied) |
| Practice — empty answer submit | Show inline validation: "Please enter an answer." below the input; do not increment score |
| Practice — localStorage unavailable | Wrap reads/writes in try/catch; degrade gracefully (score display shows "N/A"); no crash |
| Hash state restore failure | Silent skip; tools render their default empty state |

Lib functions throw `Error` with descriptive messages. Tool modules catch at
the outermost event handler and render an error box. Never swallow silently.

---

## Test Surface

### tests/planner.test.mjs (builder-a3)

Imports `parsePlannerRequests` and `formatPlannerTable` from
`../public/js/tools/planner.js`.

| Test | Assertion |
|---|---|
| parsePlannerRequests — host count format | `"Site A, 50"` → `{label:"Site A", size:"50"}` (size as string to pass to allocate) |
| parsePlannerRequests — prefix format | `"WAN, /30"` → `{label:"WAN", size:"/30"}` |
| parsePlannerRequests — blank lines and `#` comments skipped | Only non-blank, non-comment lines in `valid` |
| parsePlannerRequests — malformed line | `errors` contains entry; `valid` excludes that line |
| parsePlannerRequests — whitespace trimming | Leading/trailing spaces stripped from name and size |
| parsePlannerRequests — empty string | `{valid:[], errors:[]}` |
| formatPlannerTable — column alignment | Output is a string; header line contains "Name", "CIDR", "Usable Hosts", "Util%" |
| formatPlannerTable — util calculation | Given a /24 pool and a /25 assignment (126 usable of 254 pool usable), util% = 49.6% |
| formatPlannerTable — free block row | Free blocks appear as rows with name "(free)" |
| formatPlannerTable — no free blocks | Output still valid (no free section appended) |

### tests/patterns.test.mjs (builder-a3)

Imports `buildHistogram` and `buildRfcCounts` from
`../public/js/tools/patterns.js`.

| Test | Assertion |
|---|---|
| buildHistogram — empty array | Returns empty Map |
| buildHistogram — all same prefix | Map has one key; value = count of CIDRs |
| buildHistogram — mixed prefixes | Correct count for each distinct prefix length |
| buildHistogram — /24 × 3 and /16 × 1 | Map.get(24) === 3, Map.get(16) === 1 |
| buildRfcCounts — RFC1918 addresses | "Private (RFC1918)" count matches number of private CIDRs |
| buildRfcCounts — public address | "Public (Global Unicast)" tag counted |
| buildRfcCounts — multi-tag CIDR | Each tag counted independently |
| buildRfcCounts — empty array | Returns empty Map |

### tests/practice.test.mjs (builder-b3)

Imports `generateQuestion` and `checkAnswer` from
`../public/js/tools/practice.js`.

| Test | Assertion |
|---|---|
| generateQuestion — deterministic with seeded RNG | Same RNG seed → same question type, CIDR, answer |
| generateQuestion — returns all four types across enough iterations | With a cycle-through mock RNG, all four types produced |
| generateQuestion — network type answer | `answer` equals canonical network address of generated CIDR |
| generateQuestion — broadcast type answer | `answer` equals canonical broadcast address |
| generateQuestion — hostcount type answer | `answer` equals `String(hostCount(parseCidr(cidr)))` |
| generateQuestion — smallestprefix type answer | `answer` is `"/" + prefixLen`; host count in prompt matches usable hosts of that prefix |
| generateQuestion — prefix always 8–30 | Generated CIDR prefix is in range [8, 30] |
| checkAnswer — exact match | Returns true |
| checkAnswer — leading/trailing whitespace | Returns true after trim |
| checkAnswer — leading zeros in octet | `"010.0.0.1"` matches `"10.0.0.1"` → true |
| checkAnswer — wrong answer | Returns false |
| checkAnswer — prefix with leading slash | `"/24"` matches `"/24"` → true |
| checkAnswer — prefix without slash | `"24"` matches `"/24"` → true (strip leading slash rule applied to both) |
| checkAnswer — wrong prefix | `"/25"` vs `"/24"` → false |

---

## Open Questions

None that block implementation. All decisions are resolved above.

Informational notes:
- Planner's Util% uses IPv4-specific math (pool usable = 2^(32-prefix) - 2 for
  prefix < 31). If IPv6 is added later, the total host denominator must switch
  to `2^(128-prefix)` (no broadcast reservation). The `formatPlannerTable`
  helper can accept an optional `family` param to generalise.
- Practice question prefix range (8–30) was chosen to keep questions readable
  and answers unambiguous. Prefixes /0–/7 produce huge host counts; /31–/32
  have special semantics that complicate the "usable hosts" question. The range
  can be widened by the coder if desired without a design change.
- The histogram bar in Patterns uses an inline-style `width` relative to the
  maximum bar count. A 200 px maximum bar width is suggested; this keeps the
  table usable on narrow viewports without a horizontal scroll. The coder may
  adjust this constant.

---

## File Ownership Summary

**builder-a3** owns:
- `public/js/tools/planner.js` (create; exports `parsePlannerRequests` and `formatPlannerTable` as named exports)
- `public/js/tools/patterns.js` (create; exports `buildHistogram` and `buildRfcCounts` as named exports)
- `tests/planner.test.mjs` (create)
- `tests/patterns.test.mjs` (create)

**builder-b3** owns:
- `public/js/tools/practice.js` (create; exports `generateQuestion` and `checkAnswer` as named exports)
- `tests/practice.test.mjs` (create)
- `public/index.html` (modify — remove `aria-disabled="true"`, add `data-tool` attributes to the three Phase 3 buttons)
- `public/js/app.js` (modify — add `planner`, `patterns`, `practice` to the TOOLS map)

Coordination point: builder-a3 and builder-b3 have no shared file ownership
except the wiring in `index.html` and `app.js`, which belong solely to
builder-b3. builder-a3's tool modules must export their pure helpers as named
exports at module level — this is the only contract builder-b3's test setup
depends on indirectly through the test runner.
