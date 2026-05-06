# IP ToolKit

Self-hosted IPv4/IPv6 networking calculators. Zero dependencies — pure browser-side ES2022 modules, served by `nginx:alpine`.

## Features

| Tool | Description |
|---|---|
| **Calculator** | Full subnet info for any IPv4/IPv6 CIDR, netmask, or address |
| **Embed 4-in-6** | Bidirectional IPv4-in-IPv6 conversion (mapped, 6to4, NAT64, SIIT) |
| **Prefix List** | Validate, sort, aggregate, and export lists of CIDRs |
| **Allocate** | VLSM best-fit subnet allocator with free-block report |
| Tree *(Phase 2)* | Interactive subnet split tree |
| Diffs *(Phase 2)* | Side-by-side prefix list diff |
| Routes *(Phase 2)* | Longest-prefix-match tester + multi-vendor config export |
| Planner *(Phase 3)* | Top-down network design wizard |
| Patterns *(Phase 3)* | Bit-level netmask/wildcard visualizer + ACL playground |
| Practice *(Phase 3)* | Timed subnet quiz with scoring |

All tools include:
- RFC/IANA class detection (RFC1918, RFC6598, ULA, multicast, documentation, NAT64, etc.)
- Reverse DNS zone name generation (`in-addr.arpa` / `ip6.arpa`)
- Shareable URL — every calculation is bookmarkable / copyable

## Quick Start

### Local (no Docker)

```bash
# Node 18+
node --test tests/*.test.mjs      # run tests

# Serve public/ with any static file server
python3 -m http.server --directory public 8080
# Open http://localhost:8080
```

### Docker

```bash
docker build -t iptoolkit:latest .
docker run --rm -p 8080:80 iptoolkit:latest
# Open http://localhost:8080
```

### With Traefik

```bash
COMPOSE_PROJECT_NAME=iptoolkit \
TRAEFIK_HOST=iptoolkit.yourdomain.com \
docker compose up -d
```

## Development

No build step. Edit files in `public/` and reload the browser.

```bash
# Tests (Node 18+ built-in runner, zero npm deps)
node --test tests/*.test.mjs
```

## Architecture

```
public/
  index.html            # Shell, theme script, tab nav
  css/tokens.css        # SLDS-inspired CSS vars (light + dark)
  css/app.css           # Layout + components
  js/app.js             # Hash router + theme + clipboard
  js/lib/               # Pure IPv4/IPv6/prefix math (unit-tested)
  js/tools/             # DOM + lib bindings, one file per tab
tests/                  # node:test suites for every lib
Dockerfile              # nginx:alpine
nginx.conf              # Security headers, CSP, gzip
docker-compose.yml      # Traefik labels
```
