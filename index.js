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

var IP = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9:]{10,})/i;

/**
 * @param {number|{timeoutMs?: number, stunUrls?: string[]}} [options]
 *        A number is read as timeoutMs, so detectWebRTCLeak(3000) works.
 * @returns {Promise<{supported: boolean, ips: string[]}>}
 *        `supported: false` means the check could not run at all - no browser,
 *        or a browser without WebRTC. It never means "no leak found".
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
      return resolve({ supported: false, ips: [] });
    }
    var RTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!RTC) return resolve({ supported: false, ips: [] });

    var ips = new Set();
    var pc;
    try {
      pc = new RTC({ iceServers: [{ urls: stunUrls }] });
    } catch (e) {
      return resolve({ supported: false, ips: [] });
    }

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      try { pc.close(); } catch (e) { /* already closed */ }
      resolve({ supported: true, ips: Array.from(ips) });
    }

    pc.createDataChannel("");
    pc.onicecandidate = function (e) {
      // A null candidate is the browser saying it has finished gathering, so
      // there is no reason to sit out the rest of the timeout.
      if (!e.candidate) return finish();
      var m = IP.exec(e.candidate.candidate);
      if (m) ips.add(m[1]);
    };
    pc.createOffer()
      .then(function (o) { return pc.setLocalDescription(o); })
      .catch(finish);

    setTimeout(finish, timeoutMs);
  });
}

module.exports = { detectWebRTCLeak: detectWebRTCLeak };
