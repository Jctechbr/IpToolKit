/**
 * VLSM best-fit subnet allocator.
 * Assigns aligned sub-prefixes from a pool to a list of size requests.
 */
import { parseCidr as parseV4, networkAddress as netV4, numToIp, prefixToMask, ipToNum } from "./ipv4.js";
import { parseCidr as parseV6, networkAddress as netV6, ipToBigint, bigintToIp } from "./ipv6.js";

/**
 * Calculate the minimum prefix length that fits at least `hostCount` hosts.
 * IPv4: reserves 2 addresses (network + broadcast) unless /31 or /32.
 * IPv6: no broadcast reservation.
 * @param {number|bigint} hostCount
 * @param {"v4"|"v6"} family
 * @returns {number} prefix length
 */
export function hostsToPrefixLen(hostCount, family) {
  const maxBits = family === "v4" ? 32 : 128;
  const n = BigInt(hostCount);
  if (n <= 0n) throw new Error(`Invalid host count: ${hostCount}`);
  for (let p = maxBits; p >= 0; p--) {
    const total = 1n << BigInt(maxBits - p);
    const usable = family === "v4" && p < 31 ? total - 2n : total;
    if (usable >= n) return p;
  }
  throw new Error(`Host count ${hostCount} does not fit in IPv${family === "v4" ? "4" : "6"}`);
}

/** @param {string} size @param {"v4"|"v6"} family @returns {{prefixLen?:number, error?:string}} */
function parseRequestedPrefix(size, family) {
  const max = family === "v4" ? 32 : 128;
  const t = String(size).trim();
  if (!/^\/(?:0|[1-9]\d{0,2})$/.test(t)) return { error: `invalid prefix "${size}"` };
  const prefixLen = Number(t.slice(1));
  if (prefixLen > max) {
    return { error: `prefix ${t} is outside 0–${max} for IPv${family === "v4" ? "4" : "6"}` };
  }
  return { prefixLen };
}

/** @param {number|string} size @returns {bigint|null} */
function parseHostCount(size) {
  if (typeof size === "number") {
    if (!Number.isSafeInteger(size) || size <= 0) return null;
    return BigInt(size);
  }
  const t = String(size).trim();
  // Bound the digit run so a multi-megabyte paste cannot reach BigInt().
  if (!/^[1-9]\d{0,39}$/.test(t)) return null;
  return BigInt(t);
}

/**
 * Allocate subnets from a pool using best-fit VLSM.
 * @param {string} poolCidr  e.g. "10.0.0.0/8"
 * @param {Array<{label:string, size:number|string}>} requests
 *   size can be a host count (number) or a prefix string like "/24"
 * @returns {{assignments:Array, free:Array, errors:string[]}}
 */
export function allocate(poolCidr, requests) {
  const errors = [];
  const family = poolCidr.includes(":") ? "v6" : "v4";
  const maxBits = family === "v4" ? 32n : 128n;

  let poolAddr, poolPrefix;
  if (family === "v4") {
    const { ip, prefix } = parseV4(poolCidr);
    poolAddr = BigInt(netV4({ ip, prefix }) >>> 0);
    poolPrefix = prefix;
  } else {
    const { ip, prefix } = parseV6(poolCidr);
    poolAddr = ipToBigint(netV6(ip, prefix));
    poolPrefix = prefix;
  }
  const poolEnd = poolAddr + (1n << (maxBits - BigInt(poolPrefix)));

  // Parse each request and determine needed prefix length
  const parsed = requests.map((req, idx) => {
    let prefixLen;
    const sizeText = typeof req.size === "string" ? req.size.trim() : req.size;
    if (typeof sizeText === "string" && sizeText.startsWith("/")) {
      const parsedPrefix = parseRequestedPrefix(sizeText, family);
      if (parsedPrefix.error) {
        errors.push(`Request ${idx + 1} (${req.label}): ${parsedPrefix.error}`);
        return null;
      }
      prefixLen = parsedPrefix.prefixLen;
    } else {
      const hosts = parseHostCount(sizeText);
      if (hosts === null) {
        errors.push(`Request ${idx + 1} (${req.label}): invalid host count "${req.size}"`);
        return null;
      }
      try {
        prefixLen = hostsToPrefixLen(hosts, family);
      } catch (err) {
        errors.push(`Request ${idx + 1} (${req.label}): ${err.message}`);
        return null;
      }
    }
    return { label: req.label, prefixLen, origIdx: idx };
  }).filter(Boolean);

  // Sort largest first (smallest prefix number = largest block)
  parsed.sort((a, b) => a.prefixLen - b.prefixLen);

  const assignments = [];
  let cursor = poolAddr;

  for (const req of parsed) {
    const blockSize = 1n << (maxBits - BigInt(req.prefixLen));
    // Align cursor to blockSize boundary
    const rem = cursor % blockSize;
    if (rem !== 0n) cursor += blockSize - rem;
    if (cursor + blockSize > poolEnd) {
      errors.push(`Pool exhausted: cannot fit "${req.label}" (/${req.prefixLen})`);
      continue;
    }
    const addrStr = family === "v4" ? numToIp(Number(cursor)) : bigintToIp(cursor);
    assignments.push({
      label: req.label,
      cidr: `${addrStr}/${req.prefixLen}`,
      prefixLen: req.prefixLen,
      firstHost: family === "v4"
        ? (req.prefixLen >= 31 ? addrStr : numToIp(Number(cursor + 1n)))
        : (req.prefixLen >= 127 ? addrStr : bigintToIp(cursor + 1n)),
      lastHost: family === "v4"
        ? (req.prefixLen >= 31
            ? numToIp(Number(cursor + blockSize - 1n))
            : numToIp(Number(cursor + blockSize - 2n)))
        : (req.prefixLen >= 127
            ? bigintToIp(cursor + blockSize - 1n)
            : bigintToIp(cursor + blockSize - 2n)),
      hostCount: family === "v4" && req.prefixLen < 31
        ? blockSize - 2n
        : blockSize,
    });
    cursor += blockSize;
  }

  // Identify free blocks between assignments and pool end
  const free = [];
  let freeStart = poolAddr;
  const sortedAssign = [...assignments].sort((a, b) => {
    const aAddr = family === "v4" ? BigInt(ipToNum(a.cidr.split("/")[0]) >>> 0) : ipToBigint(a.cidr.split("/")[0]);
    const bAddr = family === "v4" ? BigInt(ipToNum(b.cidr.split("/")[0]) >>> 0) : ipToBigint(b.cidr.split("/")[0]);
    return aAddr < bAddr ? -1 : aAddr > bAddr ? 1 : 0;
  });
  for (const a of sortedAssign) {
    const aAddr = family === "v4"
      ? BigInt(ipToNum(a.cidr.split("/")[0]) >>> 0)
      : ipToBigint(a.cidr.split("/")[0]);
    const aSize = 1n << (maxBits - BigInt(a.prefixLen));
    if (aAddr > freeStart) {
      // There is a gap — find the largest aligned prefix that fits
      const gapSize = aAddr - freeStart;
      const gapStr = family === "v4" ? numToIp(Number(freeStart)) : bigintToIp(freeStart);
      // Find prefix for this gap (approximation — report as raw gap)
      free.push({ start: gapStr, end: family === "v4" ? numToIp(Number(aAddr - 1n)) : bigintToIp(aAddr - 1n), size: gapSize });
    }
    freeStart = aAddr + aSize;
  }
  if (freeStart < poolEnd) {
    const gapStr = family === "v4" ? numToIp(Number(freeStart)) : bigintToIp(freeStart);
    const endStr = family === "v4" ? numToIp(Number(poolEnd - 1n)) : bigintToIp(poolEnd - 1n);
    free.push({ start: gapStr, end: endStr, size: poolEnd - freeStart });
  }

  return { assignments, free, errors };
}
