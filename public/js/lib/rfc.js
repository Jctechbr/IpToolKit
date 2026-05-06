/**
 * RFC/IANA special-purpose registry classification for IPv4 and IPv6 addresses.
 * Returns an array of human-readable tags.
 */
import { ipToNum, parseCidr as parseV4, networkAddress as netV4, prefixToMask } from "./ipv4.js";
import { ipToBigint, parseCidr as parseV6 } from "./ipv6.js";

/* ------------------------------------------------------------------
 * IPv4 special ranges (IANA IPv4 Special-Purpose Address Registry)
 * ------------------------------------------------------------------ */
const V4_RANGES = [
  { tag: "This Network",     cidr: "0.0.0.0/8"        },
  { tag: "Private (RFC1918)",cidr: "10.0.0.0/8"       },
  { tag: "Loopback",         cidr: "127.0.0.0/8"      },
  { tag: "Link-Local",       cidr: "169.254.0.0/16"   },
  { tag: "Private (RFC1918)",cidr: "172.16.0.0/12"    },
  { tag: "IETF Protocol",    cidr: "192.0.0.0/24"     },
  { tag: "Documentation",    cidr: "192.0.2.0/24"     },   // TEST-NET-1
  { tag: "6to4 Relay",       cidr: "192.88.99.0/24"   },
  { tag: "Private (RFC1918)",cidr: "192.168.0.0/16"   },
  { tag: "Benchmarking",     cidr: "198.18.0.0/15"    },
  { tag: "Documentation",    cidr: "198.51.100.0/24"  },   // TEST-NET-2
  { tag: "Documentation",    cidr: "203.0.113.0/24"   },   // TEST-NET-3
  { tag: "Multicast",        cidr: "224.0.0.0/4"      },
  { tag: "Reserved",         cidr: "240.0.0.0/4"      },
  { tag: "Broadcast",        cidr: "255.255.255.255/32"},
  { tag: "CGNAT (RFC6598)",  cidr: "100.64.0.0/10"    },
];

function parseRange(cidr) {
  const { ip, prefix } = parseV4(cidr);
  return { net: netV4({ ip, prefix }), mask: prefixToMask(prefix) };
}

const V4_PARSED = V4_RANGES.map((r) => ({ ...parseRange(r.cidr), tag: r.tag }));

/**
 * Classify an IPv4 address string.
 * @param {string} addr
 * @returns {string[]} array of tags
 */
export function classifyV4(addr) {
  const n = ipToNum(addr.includes("/") ? addr.split("/")[0] : addr);
  const tags = [];
  for (const r of V4_PARSED) {
    if ((n & r.mask) >>> 0 === r.net) {
      if (!tags.includes(r.tag)) tags.push(r.tag);
    }
  }
  if (tags.length === 0) tags.push("Public (Global Unicast)");
  return tags;
}

/* ------------------------------------------------------------------
 * IPv6 special ranges (IANA IPv6 Special-Purpose Address Registry)
 * ------------------------------------------------------------------ */
const V6_RANGES = [
  { tag: "Unspecified",          prefix: "::/128"            },
  { tag: "Loopback",             prefix: "::1/128"           },
  { tag: "IPv4-mapped",          prefix: "::ffff:0:0/96"     },
  { tag: "IPv4-translated",      prefix: "::ffff:0:0:0/96"   },
  { tag: "IPv4/IPv6 Translation",prefix: "64:ff9b::/96"      },   // RFC6052 well-known NAT64
  { tag: "IPv4/IPv6 Translation",prefix: "64:ff9b:1::/48"    },   // RFC8215
  { tag: "Discard",              prefix: "100::/64"          },
  { tag: "Teredo",               prefix: "2001::/32"         },
  { tag: "ORCHID",               prefix: "2001:20::/28"      },
  { tag: "Documentation",        prefix: "2001:db8::/32"     },
  { tag: "6to4",                 prefix: "2002::/16"         },
  { tag: "Unique Local (RFC4193)",prefix: "fc00::/7"         },
  { tag: "Link-Local",           prefix: "fe80::/10"         },
  { tag: "Multicast",            prefix: "ff00::/8"          },
  { tag: "Benchmarking",         prefix: "2001:2::/48"       },
];

function parseV6Range(cidr) {
  const idx = cidr.lastIndexOf("/");
  const ip = cidr.slice(0, idx);
  const prefix = parseInt(cidr.slice(idx + 1), 10);
  const addr = ipToBigint(ip);
  const bits = BigInt(128 - prefix);
  const mask = prefix === 0 ? 0n : ~((1n << bits) - 1n) & ((1n << 128n) - 1n);
  return { net: addr & mask, mask, tag: "" };
}

const V6_PARSED = V6_RANGES.map((r) => ({ ...parseV6Range(r.prefix), tag: r.tag }));

/**
 * Classify an IPv6 address string.
 * @param {string} addr
 * @returns {string[]} array of tags
 */
export function classifyV6(addr) {
  const raw = addr.includes("/") ? addr.split("/")[0] : addr;
  const n = ipToBigint(raw);
  const MASK128 = (1n << 128n) - 1n;
  const tags = [];
  for (const r of V6_PARSED) {
    if ((n & r.mask) === r.net) {
      if (!tags.includes(r.tag)) tags.push(r.tag);
    }
  }
  if (tags.length === 0) tags.push("Global Unicast");
  return tags;
}

/**
 * Auto-detect family and classify.
 * @param {string} addr
 * @returns {string[]}
 */
export function classify(addr) {
  return addr.includes(":") ? classifyV6(addr) : classifyV4(addr);
}
