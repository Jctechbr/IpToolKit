/**
 * Practice tool — randomised IPv4 subnetting quiz with score tracking.
 *
 * Exported pure functions (no DOM, no localStorage) are used both by the
 * tool UI and by the test suite.
 */
import {
  parseCidr,
  subnetInfo,
  networkAddress,
  broadcastAddress,
  hostCount,
  numToIp,
} from "../lib/ipv4.js";
import { push } from "../lib/hash_state.js";

// ---- Constants --------------------------------------------------------------

/** Question types understood by generateQuestion(). */
export const QUESTION_TYPES = ["network", "broadcast", "hosts", "prefix"];

const LS_KEY = "itx-practice";

// ---- Pure exported helpers --------------------------------------------------

/**
 * Generate a subnetting question for a given type and CIDR string.
 *
 * @param {"network"|"broadcast"|"hosts"|"prefix"} type
 * @param {string} cidr  Canonical CIDR string, e.g. "10.0.0.0/24"
 * @returns {{question: string, answer: string, explanation: string}}
 */
export function generateQuestion(type, cidr) {
  const parsed = parseCidr(cidr);
  const net = networkAddress(parsed);
  const bcast = broadcastAddress(parsed);
  const hosts = hostCount(parsed);
  const prefix = parsed.prefix;
  const netStr = numToIp(net);
  const bcastStr = numToIp(bcast);
  const canonicalCidr = `${netStr}/${prefix}`;

  switch (type) {
    case "network":
      return {
        question: `What is the network address of ${canonicalCidr}?`,
        answer: netStr,
        explanation: `The network address is formed by applying the /${prefix} mask to the host address, zeroing out the host bits. Result: ${netStr}.`,
      };

    case "broadcast":
      return {
        question: `What is the broadcast address of ${canonicalCidr}?`,
        answer: bcastStr,
        explanation: `The broadcast address is the network address with all host bits set to 1. For /${prefix} that gives ${bcastStr}.`,
      };

    case "hosts": {
      const hostStr = String(hosts);
      let hostsExplanation;
      if (prefix >= 32) {
        hostsExplanation = `A /${prefix} is a host route representing a single address — it has 1 usable address (RFC 3021 / RFC 4632).`;
      } else if (prefix === 31) {
        hostsExplanation = `A /31 (RFC 3021) is a point-to-point link with 2 addresses, both usable — there is no dedicated network or broadcast address.`;
      } else {
        hostsExplanation = `A /${prefix} subnet has 2^(32-${prefix}) = ${Math.pow(2, 32 - prefix).toLocaleString()} total addresses. Subtracting the network and broadcast addresses gives ${hostStr} usable hosts.`;
      }
      return {
        question: `How many usable hosts does ${canonicalCidr} provide?`,
        answer: hostStr,
        explanation: hostsExplanation,
      };
    }

    case "prefix": {
      // Question asks what prefix fits at least `hosts` usable hosts.
      // The answer is derived from the CIDR itself; we phrase it as:
      // "What is the smallest prefix length that accommodates N hosts?"
      // where N = hostCount of the given CIDR.
      const hostStr = String(hosts);
      return {
        question: `What is the smallest prefix length (e.g. /24) that accommodates ${hostStr} usable hosts?`,
        answer: `/${prefix}`,
        explanation: `You need at least ${hostStr} usable hosts. 2^(32-${prefix})-2 = ${hosts.toLocaleString()} hosts fit in a /${prefix}. A /${prefix + 1} would only hold ${Math.max(0, Math.pow(2, 32 - (prefix + 1)) - 2).toLocaleString()}, which is not enough.`,
      };
    }

    default:
      throw new Error(`Unknown question type: ${type}`);
  }
}

/**
 * Check whether a user's answer matches the correct answer.
 * Comparison is case-insensitive and trims surrounding whitespace.
 *
 * @param {string} userInput
 * @param {string} correctAnswer
 * @returns {boolean}
 */
export function checkAnswer(userInput, correctAnswer) {
  return (
    String(userInput).trim().toLowerCase() ===
    String(correctAnswer).trim().toLowerCase()
  );
}

// ---- CIDR generation (used only at runtime, not exported) -------------------

/**
 * Generate a random IPv4 CIDR with prefix length between /8 and /28.
 * The network address is always canonical (host bits zeroed).
 *
 * @returns {string}  e.g. "172.16.32.0/20"
 */
function randomCidr() {
  const prefix = 8 + Math.floor(Math.random() * 21); // /8–/28
  // Build a random 32-bit address, then mask it to get the network address.
  const raw =
    (Math.floor(Math.random() * 256) << 24) |
    (Math.floor(Math.random() * 256) << 16) |
    (Math.floor(Math.random() * 256) << 8) |
    Math.floor(Math.random() * 256);
  const parsed = { ip: raw >>> 0, prefix };
  const net = networkAddress(parsed);
  return `${numToIp(net)}/${prefix}`;
}

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---- Score helpers (localStorage, not exported) -----------------------------

/**
 * @typedef {{total: number, correct: number}} Score
 */

/** @returns {Score} */
function loadScore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { total: 0, correct: 0 };
    const parsed = JSON.parse(raw);
    return {
      total: Number(parsed.total) || 0,
      correct: Number(parsed.correct) || 0,
    };
  } catch {
    return { total: 0, correct: 0 };
  }
}

/** @param {Score} score */
function saveScore(score) {
  localStorage.setItem(LS_KEY, JSON.stringify(score));
}

/** @param {Score} score @returns {string} */
function formatScore(score) {
  const pct =
    score.total === 0
      ? "0%"
      : Math.round((score.correct / score.total) * 100) + "%";
  return `${score.correct} / ${score.total} correct (${pct})`;
}

// ---- XSS helper (local copy — app.js's esc() is not importable in tests) ---

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- UI --------------------------------------------------------------------

/**
 * Initialise the Practice tool inside the given container element.
 * @param {HTMLElement} container
 */
export function init(container) {
  push("practice", {});

  let currentQuestion = null; // {question, answer, explanation}
  let score = loadScore();

  // ---- Render shell ---------------------------------------------------------

  container.innerHTML = `
  <div class="tool-header">
    <h1>Subnetting Practice</h1>
    <p>Answer randomised IPv4 subnetting questions to sharpen your skills.</p>
  </div>

  <div class="card" id="practice-score-card">
    <div class="practice-score-row">
      <span id="practice-score-label">${esc(formatScore(score))}</span>
      <button class="btn btn--secondary btn--sm" id="practice-reset-btn">Reset Score</button>
    </div>
  </div>

  <div class="card" id="practice-question-card">
    <p id="practice-question" class="practice-question-text"></p>
    <div class="field">
      <label class="field__label" for="practice-answer-input">Your answer</label>
      <input class="field__input" id="practice-answer-input"
             type="text" autocomplete="off" autocorrect="off" spellcheck="false"
             placeholder="Type your answer here" />
    </div>
    <div class="btn-row">
      <button class="btn btn--primary" id="practice-submit-btn">Submit</button>
      <button class="btn btn--secondary" id="practice-skip-btn">Skip</button>
    </div>
  </div>

  <div id="practice-feedback" style="display:none"></div>`;

  // ---- Element references --------------------------------------------------

  const scoreLabel = container.querySelector("#practice-score-label");
  const resetBtn = container.querySelector("#practice-reset-btn");
  const questionEl = container.querySelector("#practice-question");
  const answerInput = container.querySelector("#practice-answer-input");
  const submitBtn = container.querySelector("#practice-submit-btn");
  const skipBtn = container.querySelector("#practice-skip-btn");
  const feedbackEl = container.querySelector("#practice-feedback");

  // ---- Core logic ----------------------------------------------------------

  function updateScoreDisplay() {
    scoreLabel.textContent = formatScore(score);
  }

  function loadQuestion() {
    const type = randomItem(QUESTION_TYPES);
    const cidr = randomCidr();
    currentQuestion = generateQuestion(type, cidr);

    questionEl.textContent = currentQuestion.question;
    answerInput.value = "";
    feedbackEl.style.display = "none";
    feedbackEl.innerHTML = "";

    // Restore submit/skip buttons; hide "Next" if it exists
    submitBtn.style.display = "";
    skipBtn.style.display = "";
    answerInput.disabled = false;
    answerInput.focus();
  }

  function showFeedback(isCorrect) {
    const boxClass = isCorrect ? "result-box --success" : "result-box --error";
    const verdict = isCorrect ? "Correct!" : "Incorrect";
    feedbackEl.innerHTML = `
      <div class="${boxClass}">
        <strong>${esc(verdict)}</strong>
        The answer is <strong>${esc(currentQuestion.answer)}</strong>.
        <br><span class="practice-explanation">${esc(currentQuestion.explanation)}</span>
      </div>
      <div class="btn-row" style="margin-top:var(--space-md)">
        <button class="btn btn--primary" id="practice-next-btn">Next Question</button>
      </div>`;

    feedbackEl.style.display = "";
    submitBtn.style.display = "none";
    skipBtn.style.display = "none";
    answerInput.disabled = true;

    container
      .querySelector("#practice-next-btn")
      .addEventListener("click", loadQuestion);
  }

  function handleSubmit() {
    if (!currentQuestion) return;
    const userInput = answerInput.value;
    const isCorrect = checkAnswer(userInput, currentQuestion.answer);

    score.total += 1;
    if (isCorrect) score.correct += 1;
    saveScore(score);
    updateScoreDisplay();

    showFeedback(isCorrect);
  }

  // ---- Event listeners -----------------------------------------------------

  resetBtn.addEventListener("click", () => {
    score = { total: 0, correct: 0 };
    saveScore(score);
    updateScoreDisplay();
  });

  submitBtn.addEventListener("click", handleSubmit);

  skipBtn.addEventListener("click", loadQuestion);

  answerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !answerInput.disabled) handleSubmit();
  });

  // ---- Initial question ----------------------------------------------------

  loadQuestion();
}
