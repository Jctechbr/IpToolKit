/**
 * Encode and decode per-tool state to/from location.hash.
 * Format: #<toolId>?key=val&key2=val2
 */

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
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const qIdx = raw.indexOf("?");
  if (qIdx === -1) return { toolId: raw, params: {} };
  const toolId = raw.slice(0, qIdx);
  const qs = raw.slice(qIdx + 1);
  const params = {};
  for (const pair of qs.split("&")) {
    if (!pair) continue;
    const eIdx = pair.indexOf("=");
    if (eIdx === -1) {
      params[decodeURIComponent(pair)] = "";
    } else {
      params[decodeURIComponent(pair.slice(0, eIdx))] = decodeURIComponent(pair.slice(eIdx + 1));
    }
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
