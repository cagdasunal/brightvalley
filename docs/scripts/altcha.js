/*!
 * Bright Valley — ALTCHA on the Webflow forms (visible box on Contact, hidden on Subscribe)
 * + Webflow Turnstile glue.
 * Served:  https://files.brightvalleymarketing.com/scripts/altcha.min.js   (GitHub Pages)
 * Engine:  https://files.brightvalleymarketing.com/scripts/altcha-engine.min.js   (vendored ALTCHA v3.0.10 UMD)
 * Worker (challenge/verify, cross-origin): https://brightvalley-altcha.cagdasunal.workers.dev
 * Footer tag (Contact, Blog, Blog Categories template):
 *   <script src="https://files.brightvalleymarketing.com/scripts/altcha.min.js" defer></script>
 *
 * BVM-095 (2026-10-10): the cagd.as / CEL pattern (tools/altcha/templates/forms.js.tmpl) with
 * Bright Valley's differences:
 * - "box": the Contact form shows a VISIBLE ALTCHA checkbox above Send. The visitor ticks it,
 *   the widget solves the Worker's signed challenge, and the submit is held until the Worker's
 *   /verify says ok. A "no" from the Worker refuses the send and re-arms the box. The send goes
 *   on without ALTCHA only when the Worker or the engine does not answer (Turnstile, checked by
 *   Webflow's server, still applies).
 * - "hidden": the two Subscribe forms get an invisible ALTCHA (solved in the background on
 *   load, no box, no copy, no space), checked by the Worker the same way; an expired or refused
 *   solution is solved again once before the send.
 * - ALTCHA's own inputs never reach Webflow (Webflow reads every input in a form): the hidden
 *   widget sits after its form, outside it, and the box leaves its form for the synchronous
 *   length of the send, so the client's form data carries no extra field.
 * - Any other Webflow form with a Turnstile sitekey gets the Turnstile half only.
 * - English only (no LANG_MAP / I18N); the engine loads only on a page with one of these forms.
 * Turnstile functions are the template's, unchanged. NOTE: enableSubmit() pokes Webflow's
 * internal jQuery .data(form,'.w-form') state; re-check it whenever Webflow updates webflow.js.
 * Build: python3 scripts/site_deploy.py build --site brightvalley --src altcha
 */

(function () {
  "use strict";

  if (window.__bvAltchaForms_v4) return;
  window.__bvAltchaForms_v4 = true;

  const WORKER = "https://brightvalley-altcha.cagdasunal.workers.dev";
  const CHALLENGE_URL = WORKER + "/challenge";
  const VERIFY_URL = WORKER + "/verify";
  const ALTCHA_LIB = "https://files.brightvalleymarketing.com/scripts/altcha-engine.min.js";
  // Which ALTCHA each form gets.
  const BOX_FORM_SELECTOR = "form#wf-form-Contact-Form";
  const HIDDEN_FORM_SELECTOR = "form#wf-form-Signup-Form, form#wf-form-Hero-Subscribe-Form";
  // Webflow forms whose server requires a cf-turnstile-response token (Turnstile on). The
  // navbar and modal search forms carry no sitekey and are never touched.
  const TS_FORM_SELECTOR = ".w-form form[data-turnstile-sitekey]";
  const TIMEOUT_MS = 8000;
  const ENGINE_WAIT_MS = 20000;
  // The box in the form's own look: the inputs' cream field, 9 px radius and no border, the
  // site's dark text, the green of Send for the tick. Fits the form's width (248 px at 320).
  const BOX_VARS = {
    "--altcha-max-width": "100%",
    "--altcha-border-radius": "9px",
    "--altcha-border-color": "transparent",
    "--altcha-color-base": "var(--_color---color-light-1)",
    "--altcha-color-base-content": "var(--_color---color-dark)",
    "--altcha-color-neutral-content": "var(--_color---color-dark)",
    "--altcha-checkbox-border-color": "var(--_color---color-dark)",
    "--altcha-color-primary": "var(--_color---color-green)",
  };

  const altchaForms = [];

  function loadAltcha() {
    if (window.customElements && customElements.get("altcha-widget")) return;
    if (document.querySelector("script[data-altcha-lib]")) return;
    const s = document.createElement("script");
    s.src = ALTCHA_LIB;
    s.defer = true;
    s.setAttribute("data-altcha-lib", "");
    s.addEventListener("error", function () { altchaForms.forEach(altchaDown); });
    (document.head || document.documentElement).appendChild(s);
  }

  function submitBtn(form) { return form.querySelector('[type="submit"]'); }
  function widgetOf(form) { return form.__bvWidget || null; }
  function stateOf(form) {
    const w = widgetOf(form);
    const el = w && w.querySelector(".altcha[data-state]");
    return el ? el.getAttribute("data-state") : null;
  }
  function payloadOf(form) {
    const w = widgetOf(form);
    if (stateOf(form) === "expired") return null; // the engine keeps the stale value in its field
    const field = w && w.querySelector('input[name="altcha"]');
    return field && field.value ? field.value : null;
  }
  function boxCheckbox(form) {
    const w = widgetOf(form);
    return w ? w.querySelector('input[type="checkbox"]') : null;
  }

  function waitFor(cond, ms) {
    return new Promise(function (resolve) {
      if (cond()) return resolve(true);
      let n = 0;
      const t = setInterval(function () {
        n += 100;
        if (cond()) { clearInterval(t); resolve(true); }
        else if (n >= ms) { clearInterval(t); resolve(false); }
      }, 100);
    });
  }

  // ─── The ALTCHA widget (box or hidden) ─────────────────────────────────────

  // The engine never answered (script error, or no custom element after ENGINE_WAIT_MS), or the
  // widget could not get a challenge from the Worker: ALTCHA can't be solved, so it stops
  // blocking (the box's required checkbox is released) and the send goes on with Turnstile only.
  function altchaDown(form) {
    form.__bvDown = true;
    const cb = form.__bvMode === "box" ? boxCheckbox(form) : null;
    if (cb) cb.required = false;
  }

  function makeWidget(form, hidden) {
    const w = document.createElement("altcha-widget");
    w.setAttribute("challenge", CHALLENGE_URL); // the Worker's signed challenge
    w.setAttribute("name", "altcha");
    if (hidden) w.setAttribute("auto", "onload"); // solve in the background as soon as it loads
    else w.setAttribute("configuration", JSON.stringify({ hideFooter: true }));
    // No class "altcha" on the element (the template sets one): the engine's own .altcha rule
    // hides anything with that class that has no data-visible, which would hide the box.
    w.addEventListener("statechange", function (e) {
      const st = e && e.detail && e.detail.state;
      if (st === "error") altchaDown(form);
      else if (st === "verified" && form.__bvDown) {
        form.__bvDown = false;
        const cb = form.__bvMode === "box" ? boxCheckbox(form) : null;
        if (cb) cb.required = true;
      }
    });
    return w;
  }

  function injectBox(form) {
    if (form.__bvWidget) return;
    const w = makeWidget(form, false);
    for (const k in BOX_VARS) w.style.setProperty(k, BOX_VARS[k]);
    const holder = document.createElement("div");
    holder.className = "form_field-altcha";
    holder.appendChild(w);
    const btn = submitBtn(form);
    if (btn && btn.parentNode === form) form.insertBefore(holder, btn);
    else form.appendChild(holder);
    form.__bvBox = holder;
    form.__bvWidget = w;
  }

  // After the form, outside it: its required checkbox never blocks the submit and its field is
  // never sent. display:none = no box, no "Protected by" line, no space.
  function injectHidden(form) {
    if (form.__bvWidget || !form.parentNode) return;
    const w = makeWidget(form, true);
    w.style.display = "none";
    form.parentNode.insertBefore(w, form.nextSibling);
    form.__bvWidget = w;
  }

  // The hidden widget has no usable payload (expired after the challenge's 5 minutes, or
  // refused by the Worker): solve a fresh challenge.
  async function resolveHidden(form) {
    const w = widgetOf(form);
    if (!w) return null;
    try {
      if (typeof w.reset === "function") w.reset();
      if (typeof w.verify === "function") w.verify();
    } catch (e) { return null; }
    await waitFor(function () { return payloadOf(form) || form.__bvDown; }, TIMEOUT_MS);
    return payloadOf(form);
  }

  function verifyPayload(payload) {
    return Promise.race([
      fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: payload }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { return d && d.ok === true ? "ok" : "fail"; })
        .catch(function () { return "timeout"; }),
      new Promise(function (resolve) { setTimeout(function () { resolve("timeout"); }, TIMEOUT_MS); }),
    ]);
  }

  // "send" / "open" (the Worker or the engine did not answer) / "refuse".
  async function altchaCheck(form) {
    const hidden = form.__bvMode === "hidden";
    if (!widgetOf(form)) { // the engine is still loading
      if (!hidden) return form.__bvDown ? "open" : "refuse";
      await waitFor(function () { return widgetOf(form) || form.__bvDown; }, TIMEOUT_MS);
      if (!widgetOf(form)) return "open";
    }
    let payload = payloadOf(form);
    if (!payload && stateOf(form) === "verifying") {
      await waitFor(function () { return stateOf(form) !== "verifying"; }, TIMEOUT_MS);
      payload = payloadOf(form);
    }
    if (!payload && hidden && !form.__bvDown) payload = await resolveHidden(form);
    if (!payload) return form.__bvDown || hidden ? "open" : "refuse";
    let result = await verifyPayload(payload);
    if (result === "fail" && hidden) { // expired or refused: one fresh solve
      const fresh = await resolveHidden(form);
      result = fresh ? await verifyPayload(fresh) : "timeout";
    }
    if (result === "ok") return "send";
    if (result === "timeout") return "open";
    // The Worker said no (forged or expired): the box is ticked again by the visitor.
    const w = widgetOf(form);
    try { if (!hidden && w && typeof w.reset === "function") w.reset(); } catch (err) { /* no-op */ }
    return "refuse";
  }

  function pointAtBox(form) {
    const cb = form.__bvMode === "box" ? boxCheckbox(form) : null;
    if (cb) { try { cb.focus(); cb.reportValidity(); } catch (e) { /* no-op */ } }
  }

  // ─── Webflow native Turnstile coexistence (template functions, unchanged) ──────────────

  function turnstileSitekey(form) {
    return form.getAttribute("data-turnstile-sitekey") || null;
  }

  // Render an invisible Turnstile (idempotent). Kept full-size + opacity:0 so the
  // challenge actually executes (it won't run inside a display:none container).
  function renderTurnstile(form) {
    if (form.__altchaTsRendered) return;
    const sitekey = turnstileSitekey(form);
    if (!sitekey) return;
    if (!window.turnstile || typeof window.turnstile.render !== "function") return;
    let holder = form.querySelector(".altcha-turnstile-holder");
    if (!holder) {
      holder = document.createElement("div");
      holder.className = "altcha-turnstile-holder";
      holder.style.cssText = "position:fixed;right:0;bottom:0;opacity:0;pointer-events:none;z-index:-1;";
      form.appendChild(holder);
    }
    try {
      form.__altchaTsWidgetId = window.turnstile.render(holder, {
        sitekey: sitekey,
        callback: function (token) { form.__altchaTsToken = token; enableSubmit(form, token); },
        "error-callback": function () { form.__altchaTsToken = null; },
        "expired-callback": function () { form.__altchaTsToken = null; },
      });
      form.__altchaTsRendered = true;
    } catch (e) { /* no-op — fail open */ }
  }

  function waitForTurnstileToken(form) {
    return new Promise(function (resolve) {
      if (form.__altchaTsToken) return resolve(form.__altchaTsToken);
      let n = 0;
      const t = setInterval(function () {
        n++;
        if (form.__altchaTsToken) { clearInterval(t); resolve(form.__altchaTsToken); }
        else if (n >= 80) { clearInterval(t); resolve(form.__altchaTsToken || null); } // ~8s cap
      }, 100);
    });
  }

  function attachTurnstileToken(form) {
    if (!turnstileSitekey(form)) return Promise.resolve(); // not Turnstile-protected
    renderTurnstile(form); // ensure the widget exists (idempotent)
    return waitForTurnstileToken(form).then(function (token) {
      if (!token) return; // FAIL-OPEN: submit without it (no worse than the broken default)
      let inp = form.querySelector('input[name="cf-turnstile-response"]');
      if (!inp) {
        inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = "cf-turnstile-response";
        form.appendChild(inp);
      }
      inp.value = token;
    });
  }

  // Turnstile tokens are single-use; reset so any resubmit gets a fresh one.
  function refreshTurnstile(form) {
    form.__altchaTsToken = null;
    try {
      if (form.__altchaTsWidgetId != null && window.turnstile && typeof window.turnstile.reset === "function") {
        window.turnstile.reset(form.__altchaTsWidgetId);
      }
    } catch (e) { /* no-op */ }
  }

  // Webflow's forms init DISABLES the submit button + adds w-form-loading whenever a
  // Turnstile sitekey is present but its own render hasn't set a token. We feed Webflow's
  // form-state object (jQuery .data) our token so its re-arm keeps the button enabled, and
  // clear the stuck loading state. Best-effort + guarded.
  function enableSubmit(form, token) {
    try {
      if (window.jQuery && typeof window.jQuery.data === "function") {
        const st = window.jQuery.data(form, ".w-form");
        if (st) st.turnstileToken = token || st.turnstileToken || true;
      }
    } catch (e) { /* no-op */ }
    const btn = submitBtn(form);
    if (btn) { btn.disabled = false; btn.classList.remove("w-form-loading"); }
  }

  function prepareTurnstile(form) {
    if (!turnstileSitekey(form)) return;
    form.setAttribute("data-wf-no-turnstile", ""); // stop Webflow's broken native flow
    enableSubmit(form); // undo Webflow's init button-disable so the user can submit
    const onFocus = function () { // pre-solve on first interaction so the token is ready by submit
      form.removeEventListener("focusin", onFocus);
      enableSubmit(form);
      renderTurnstile(form);
    };
    form.addEventListener("focusin", onFocus);
  }

  // ─── The send ────────────────────────────────────────────────────────────

  // Our own re-submit, in a new task (a requestSubmit() from a microtask during a real click is
  // ignored: S02-r3). The box leaves the form for the synchronous length of the submit event,
  // where Webflow's handler reads the fields; the widget keeps its state across the move.
  function send(form) {
    setTimeout(function () {
      const box = form.__bvBox || null;
      const anchor = box ? box.nextSibling : null;
      if (box && form.parentNode) form.parentNode.insertBefore(box, form);
      form.__bvPassed = true;
      try {
        if (typeof form.requestSubmit === "function") form.requestSubmit(submitBtn(form) || undefined);
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } finally {
        form.__bvPassed = false;
        form.__bvHeld = false;
        if (box) form.insertBefore(box, anchor && anchor.parentNode === form ? anchor : submitBtn(form));
        refreshTurnstile(form); // invalidate the single-use token just sent
      }
    }, 0);
  }

  function gate(form) {
    form.addEventListener(
      "submit",
      function (e) {
        if (form.__bvPassed) return; // our own re-submit: let Webflow handle it
        e.preventDefault();
        e.stopImmediatePropagation();
        if (form.__bvHeld) return; // already checking: a second click must not send twice
        form.__bvHeld = true;
        (async function () {
          let verdict = "send";
          try { if (form.__bvMode) verdict = await altchaCheck(form); } catch (err) { verdict = "open"; }
          if (verdict === "refuse") { form.__bvHeld = false; pointAtBox(form); return; }
          try { await attachTurnstileToken(form); } catch (err) { /* fail open */ }
          send(form); // releases __bvHeld once the submit has gone through
        })();
      },
      true, // capture: runs before webflow.js's submit handler
    );
  }

  // mode: "box" | "hidden" | null (Turnstile only)
  function setupForm(form, mode) {
    if (form.__bvReady) return;
    form.__bvReady = true;
    form.__bvMode = mode;
    if (!mode && !turnstileSitekey(form)) return;
    prepareTurnstile(form);
    gate(form); // held from the start; an unticked box never sends
    if (!mode) return;
    altchaForms.push(form);
    loadAltcha();
    let waited = 0;
    const timer = setInterval(function () {
      waited += 100;
      if (window.customElements && customElements.get("altcha-widget")) {
        clearInterval(timer);
        if (mode === "box") injectBox(form);
        else injectHidden(form);
      } else if (form.__bvDown || waited >= ENGINE_WAIT_MS) {
        clearInterval(timer);
        altchaDown(form); // the engine never came: Turnstile only
      }
    }, 100);
  }

  function boot() {
    const box = document.querySelector(BOX_FORM_SELECTOR);
    if (box) setupForm(box, "box");
    const hidden = document.querySelectorAll(HIDDEN_FORM_SELECTOR);
    for (let i = 0; i < hidden.length; i++) setupForm(hidden[i], "hidden");
    const ts = document.querySelectorAll(TS_FORM_SELECTOR);
    for (let i = 0; i < ts.length; i++) setupForm(ts[i], null);
  }

  boot();
})();
