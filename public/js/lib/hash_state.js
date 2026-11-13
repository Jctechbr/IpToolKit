/**
 * Encode and decode per-tool state to/from location.hash.
 * Format: #<toolId>?key=val&key2=val2
 */

/** A shared link should not be able to stall the main thread. */
const MAX_HASH_LENGTH = 1_000_000;

function decodeComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function assignParam(params, key, value) {
  // defineProperty does not invoke the __proto__ setter.
  Object.defineProperty(params, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Encode tool state to a hash string.
 * @param {string} toolId
 * @param {Record<string,string>} params
 * @returns {string} e.g. "#calc?ip=10.0.0.0&prefix=24"
 */
export function encode(toolId, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return qs ? `#${toolId}?${qs}` : `#${toolId}`;
}

/**
 * Decode a hash string into toolId + params.
 * @param {string} hash e.g. "#calc?ip=10.0.0.0&prefix=24"
 * @returns {{toolId:string, params:Record<string,string>}}
 */
export function decode(hash) {
  if (!hash || hash === "#") return { toolId: "", params: {} };
  if (hash.length > MAX_HASH_LENGTH) return { toolId: "", params: {} };
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const qIdx = raw.indexOf("?");
  if (qIdx === -1) return { toolId: raw, params: {} };
  const toolId = raw.slice(0, qIdx);
  const qs = raw.slice(qIdx + 1);
  const params = {};
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eIdx = pair.indexOf("=");
    const rawKey = eIdx === -1 ? pair : pair.slice(0, eIdx);
    const rawVal = eIdx === -1 ? "" : pair.slice(eIdx + 1);
    const key = decodeComponent(rawKey);
    const val = decodeComponent(rawVal);
    if (key === null || val === null || key === "") continue;
    assignParam(params, key, val);
  }
  return { toolId, params };
}

/**
 * Push a new hash state without triggering a full navigation.
 * @param {string} toolId
 * @param {Record<string,string>} params
 */
export function push(toolId, params) {
  const hash = encode(toolId, params);
  history.replaceState(null, "", hash);
}
