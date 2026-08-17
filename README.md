# @myipscan/leak-check

Detect the IP addresses a browser hands out through WebRTC. Zero dependencies,
browser-side, nothing leaves the page except the STUN request itself.

```bash
npm install @myipscan/leak-check
```

```js
const { detectWebRTCLeak } = require("@myipscan/leak-check");

const { supported, ips } = await detectWebRTCLeak();
// supported: false  -> the check could not run (no browser, or no WebRTC)
// ips: ["192.168.1.24", "203.0.113.7"]
```

## Why this is not something a VPN fixes

WebRTC is an API inside the browser. A script on the page asks the browser for
its addresses and the browser answers, using a STUN server to learn the public
one. A tunnel sitting in front of the browser is not in that conversation, so it
has nothing to block. This is why the fix is a browser setting rather than an
app setting, and why several VPN vendors document it that way rather than
claiming to prevent it.

## Options

```js
await detectWebRTCLeak({
  timeoutMs: 2000,                            // default
  stunUrls: ["stun:stun.l.google.com:19302"], // default
});
```

`detectWebRTCLeak(3000)` also works — a number is read as `timeoutMs`.

The default STUN server is Google's, which is the conventional public one. It is
an option rather than a constant because a privacy tool quietly talking to Google
is a fair thing to object to; point it at your own if you would rather.

## What it does and does not do

- Sends nothing to myipscan.net or anywhere else. The addresses are returned to
  your code and that is the end of them.
- Stores nothing. No cookies, no localStorage, no telemetry.
- No dependencies, so nothing else comes along with it.
- Resolves early once the browser finishes gathering candidates, rather than
  always waiting out the timeout.
- Returns `{ supported: false }` under server-side rendering and in test runners
  instead of throwing. That state means the check could not run — never that
  nothing was found.

## Interpreting the result

An address in `ips` is one the browser was willing to reveal to page scripts. A
private address such as `192.168.x.x` says something about the local network; a
public one is the address a site would record. Whether either is a problem
depends on what the reader expected to be visible, which is a question about
their session and not about this function.

## The rest of it

Made by [MyIPScan](https://myipscan.net) — browser privacy checks that run
in the open, with no account and nothing stored:

- [WebRTC leak test](https://myipscan.net/tools/webrtc-leak-test)
- [DNS leak test](https://myipscan.net/tools/dns-leak-test)
- [IPv6 leak test](https://myipscan.net/tools/ipv6-leak-test)
- [Browser fingerprint](https://myipscan.net/tools/browser-fingerprint)
- [Kill-switch drop recorder](https://myipscan.net/tools/vpn-kill-switch-test)
- [Methodology](https://myipscan.net/methodology) — what these checks can and
  cannot establish

MIT License.
