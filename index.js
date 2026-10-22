/**
 * Detect the IP candidates a browser exposes through WebRTC.
 *
 * WebRTC asks a STUN server "what address do you see me at", and the browser
 * hands the answer to any script on the page. That is the whole leak: it happens
 * inside the browser, so a tunnel in front of the browser does not stop it.
 *
 * Nothing is sent anywhere by this module. The addresses are returned to the
 * caller and that is the end of them - no storage, no beacon, no third party
 * beyond the STUN server itself, which the caller chooses.
 */

// Google's public STUN server. Named rather than buried, because a privacy
// package that quietly talks to Google would be a strange thing, and because
// the caller may well want to point this at their own.
var DEFAULT_STUN = ["stun:stun.l.google.com:19302"];

/**
 * Is this string an IP address, structurally.
 *
 * Structure rather than a character class, because a character class is what
 * 1.0.0 and 1.0.1 shipped and it was wrong: /[a-f0-9:]{10,}/ matches
 * "e:2703186080" inside the word "candidate:2703186080", since "e" is a hex
 * digit and the foundation that follows is decimal. Every reading came back as
 * that fragment, and the real address - five fields further along - was never
 * reached.
 */
function isIp(s) {
  if (!s) return false;
  var v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    for (var i = 1; i <= 4; i++) {
      if (Number(v4[i]) > 255) return false;
    }
    return true;
  }
  if (s.indexOf(":") === -1) return false;
  // IPv6: eight groups, or fewer with exactly one "::" standing in for the rest.
  var runs = s.split("::");
  if (runs.length > 2) return false;
  var groups = s.split(":").filter(function (g) { return g !== ""; });
  if (groups.length > 8 || (runs.length === 1 && groups.length !== 8)) return false;
  return groups.every(function (g) { return /^[0-9a-f]{1,4}$/i.test(g); });
}

/**
 * The connection address out of an ICE candidate line.
 *
 * RFC 8839 (section 5.1, the candidate-attribute grammar) fixes the field order:
 * candidate:<foundation> <component> <transport> <priority> <address> <port>
 * typ <type> ... so the address is field five, and reading it by position cannot
 * pick up part of another field.
 */
function addressOf(candidate) {
  if (candidate && candidate.address) return candidate.address;      // browsers expose it directly
  var parts = String(candidate && candidate.candidate || "").split(" ");
  return parts.length > 4 ? parts[4] : "";
}

/**
 * @param {number|{timeoutMs?: number, stunUrls?: string[]}} [options]
 *        A number is read as timeoutMs, so detectWebRTCLeak(3000) works.
 * @returns {Promise<{supported: boolean, complete: boolean,
 *          status: "complete"|"incomplete"|"error"|"unsupported", ips: string[], error?: string}>}
 *        status "complete": the browser finished gathering candidates; `ips` is
 *          everything it was willing to reveal.
 *        status "incomplete": the timeout ran out before gathering finished; `ips`
 *          holds what arrived so far and an empty list proves nothing.
 *        status "error": WebRTC exists but creating the offer failed
 *          (createOffer/setLocalDescription threw); `supported` is false.
 *        status "unsupported": no browser, or a browser without WebRTC.
 *        `supported: false` never means "no leak found".
 */
function detectWebRTCLeak(options) {
  var opts = typeof options === "number" ? { timeoutMs: options } : (options || {});
  var timeoutMs = opts.timeoutMs || 2000;
  var stunUrls = opts.stunUrls || DEFAULT_STUN;

  return new Promise(function (resolve) {
    // Guard the environment before touching `window`. Without this the module
    // throws a ReferenceError under server-side rendering and test runners,
    // where `window` does not exist - and it throws from inside a Promise, so
    // it surfaces as an unhandled rejection rather than as a clear error.
    if (typeof window === "undefined") {
      return resolve({ supported: false, complete: false, status: "unsupported", ips: [] });
    }
    var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTC) return resolve({ supported: false, complete: false, status: "unsupported", ips: [] });

    var ips = new Set();
    var pc;
    try {
      pc = new RTC({ iceServers: [{ urls: stunUrls }] });
    } catch (e) {
      return resolve({ supported: false, complete: false, status: "unsupported", ips: [] });
    }

    var done = false;
    var timer = null;
    // Up to 1.0.3 a failed offer and a timeout both resolved as supported:true
    // with whatever had arrived - usually nothing - which read exactly like
    // "the browser revealed nothing". Each ending now says which one it was.
    function finish(status, error) {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      try { pc.close(); } catch (e) { /* already closed */ }
      if (status === "error") {
        return resolve({ supported: false, complete: false, status: "error", ips: [],
          error: error && error.message ? error.message : String(error || "createOffer failed") });
      }
      resolve({ supported: true, complete: status === "complete", status: status, ips: Array.from(ips) });
    }

    try {
      pc.createDataChannel("");
    } catch (e) {
      return finish("error", e);
    }
    pc.onicecandidate = function (e) {
      // A null candidate is the browser saying it has finished gathering, so
      // there is no reason to sit out the rest of the timeout.
      if (!e.candidate) return finish("complete");
      var addr = addressOf(e.candidate);
      // Chrome and Firefox hand out an mDNS name like 8f3c-....local instead of
      // the private address by default - that IS the browser withholding it, so
      // there is nothing to report, and reporting the hostname as an "IP" would
      // be worse than reporting nothing.
      if (/\.local$/i.test(addr)) return;
      if (isIp(addr)) ips.add(addr);
    };
    timer = setTimeout(function () { finish("incomplete"); }, timeoutMs);
    pc.createOffer()
      .then(function (o) { return pc.setLocalDescription(o); })
      .catch(function (err) { finish("error", err); });
  });
}

module.exports = { detectWebRTCLeak: detectWebRTCLeak };
