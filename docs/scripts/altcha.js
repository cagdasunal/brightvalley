/*!
 * Bright Valley — ALTCHA check on the Contact form (browser-only, no server).
 * Served:  https://cagdasunal.github.io/brightvalley/scripts/altcha.min.js   (GitHub Pages)
 * Engine:  https://cagdasunal.github.io/brightvalley/scripts/altcha-engine.min.js   (vendored ALTCHA v3.0.10 UMD)
 * Footer tag (Contact page only): <script src="https://cagdasunal.github.io/brightvalley/scripts/altcha.min.js" defer></script>
 *
 * S02-r2 (2026-10-01): Webflow's Turnstile is off and there is no Cloudflare worker. This script
 * makes the proof-of-work challenge in the browser, a hidden ALTCHA widget solves it, and the
 * form's submit waits for the solution. Nothing checks the solution on a server, so a bot that
 * posts straight to Webflow's form endpoint is not stopped by this. It fails open: a visitor
 * whose browser can't solve it within TIMEOUT_MS still sends their message.
 * Build: python3 scripts/site_deploy.py build --site brightvalley --src altcha
 */

(function () {
  "use strict";

  if (window.__bvAltchaForms_v3) return;
  window.__bvAltchaForms_v3 = true;

  const ALTCHA_LIB = "https://files.brightvalleymarketing.com/scripts/altcha-engine.min.js";
  // Webflow form blocks carry both attributes; the navbar and modal search forms carry neither.
  const FORM_SELECTOR = "form[data-wf-page-id][data-wf-element-id]";
  const MAX_NUMBER = 100000; // the same cost as the cagd.as / CEL workers' challenges
  const TIMEOUT_MS = 8000;

  function loadAltcha() {
    if (window.customElements && customElements.get("altcha-widget")) return;
    if (document.querySelector("script[data-altcha-lib]")) return;
    const s = document.createElement("script");
    s.src = ALTCHA_LIB;
    s.defer = true;
    s.setAttribute("data-altcha-lib", "");
    (document.head || document.documentElement).appendChild(s);
  }

  function hex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  // A classic ALTCHA challenge (salt, SHA-256 of salt + secret number); the v3 engine converts
  // this shape itself. There is no signature: nothing on a server checks it.
  async function makeChallenge() {
    const salt = new Uint8Array(12);
    crypto.getRandomValues(salt);
    const pick = new Uint32Array(1);
    crypto.getRandomValues(pick);
    const saltHex = hex(salt.buffer);
    const number = pick[0] % (MAX_NUMBER + 1);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(saltHex + number));
    return { algorithm: "SHA-256", challenge: hex(digest), maxnumber: MAX_NUMBER, salt: saltHex, signature: "" };
  }

  function submitBtn(form) { return form.querySelector('[type="submit"]'); }

  // The widget sits next to the form, not inside it, so its hidden field is never sent to Webflow.
  function injectWidget(form, challenge) {
    const w = document.createElement("altcha-widget");
    w.setAttribute("challenge", JSON.stringify(challenge));
    w.setAttribute("auto", "onload"); // solve in the background as soon as it loads
    w.className = "altcha";
    w.style.display = "none"; // invisible: no checkbox, no "Protected by" line
    w.addEventListener("verified", function () { form.__bvAltchaSolved = true; });
    w.addEventListener("statechange", function (e) {
      if (e && e.detail && e.detail.state === "verified") form.__bvAltchaSolved = true;
    });
    form.parentNode.insertBefore(w, form.nextSibling);
    return w;
  }

  function waitForSolution(form) {
    return new Promise(function (resolve) {
      if (form.__bvAltchaSolved) return resolve(true);
      let n = 0;
      const t = setInterval(function () {
        n++;
        if (form.__bvAltchaSolved) { clearInterval(t); resolve(true); }
        else if (n * 100 >= TIMEOUT_MS) { clearInterval(t); resolve(false); } // fail open
      }, 100);
    });
  }

  function resubmit(form) {
    form.__bvAltchaPassed = true;
    try {
      if (typeof form.requestSubmit === "function") form.requestSubmit(submitBtn(form) || undefined);
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    } finally {
      form.__bvAltchaPassed = false;
    }
  }

  function gate(form) {
    form.addEventListener(
      "submit",
      function (e) {
        // Solved (the usual case: it solves in the background at load), or our own re-submit:
        // let this very event reach Webflow's handler.
        if (form.__bvAltchaPassed || form.__bvAltchaSolved) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (form.__bvAltchaHeld) return; // already waiting: a second click must not send twice
        form.__bvAltchaHeld = true;
        waitForSolution(form).then(function () {
          // A new task, never a microtask: during a real click the browser is still firing this
          // submit event, and requestSubmit() called then is silently ignored. v2 re-submitted
          // from a microtask, so real clicks did nothing (S02-r2 fix, 2026-10-01).
          setTimeout(function () { form.__bvAltchaHeld = false; resubmit(form); }, 0);
        });
      },
      true, // capture: runs before webflow.js's submit handler
    );
  }

  function setup(form) {
    if (form.__bvAltchaReady || !form.parentNode) return;
    form.__bvAltchaReady = true;
    gate(form); // hold the submit from the start; the solution releases it
    makeChallenge()
      .then(function (challenge) { injectWidget(form, challenge); })
      .catch(function () { form.__bvAltchaSolved = true; }); // no crypto.subtle: fail open
  }

  function boot() {
    const forms = document.querySelectorAll(FORM_SELECTOR);
    if (!forms.length) return;
    loadAltcha();
    for (let i = 0; i < forms.length; i++) setup(forms[i]);
  }

  boot();
})();
