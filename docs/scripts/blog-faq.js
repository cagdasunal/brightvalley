/*!
 * Bright Valley — a post's FAQ as toggles (BL12, #97).
 * Served:  https://cagdasunal.github.io/brightvalley/scripts/blog-faq.min.js   (GitHub Pages)
 * Footer tag (Blog Posts template page): <script src="https://cagdasunal.github.io/brightvalley/scripts/blog-faq.min.js" defer></script>
 *
 * The FAQ lives in each post's rich text: an h2 "FAQ" / "FAQs" / "Frequently Asked Questions",
 * then h3 questions, each followed by its answer (paragraphs, lists). This turns every question
 * into a toggle; answers start closed. The look is native Webflow classes, published on the
 * template by a hidden holder element: Post FAQ Question, Post FAQ Icon (+ Is Open), Post FAQ
 * Answer (+ Is Open). An answer is closed by its class, not by `hidden` alone: in the published
 * sheet Webflow's [hidden] rule comes before the classes, so a class display would win over it.
 * The chevron is cloned from the holder's own image. With JS off, or with no holder, the
 * FAQ stays as it is today (questions and answers all shown).
 * Build: python3 scripts/site_deploy.py build --site brightvalley --src blog-faq
 */

(function () {
  "use strict";

  if (window.__bvBlogFaq_v1) return;
  window.__bvBlogFaq_v1 = true;

  const FAQ_TITLE = /^(faqs?|frequently asked questions)$/i;
  const OPEN = "is-open";

  function setOpen(head, panel, icon, open) {
    head.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
    panel.classList.toggle(OPEN, open);
    if (icon) icon.classList.toggle(OPEN, open);
  }

  function build(body, holderIcon) {
    const h2 = Array.prototype.find.call(body.querySelectorAll("h2"), function (h) {
      return FAQ_TITLE.test(h.textContent.trim());
    });
    if (!h2) return;
    let node = h2.nextElementSibling;
    let n = 0;
    while (node && node.tagName !== "H2") {
      if (node.tagName !== "H3") { node = node.nextElementSibling; continue; }
      const q = node;
      n++;
      const id = "bv-faq-" + n;
      // answer = everything up to the next question or section
      const panel = document.createElement("div");
      panel.className = "post-faq-answer";
      panel.id = id;
      let a = q.nextElementSibling;
      while (a && a.tagName !== "H3" && a.tagName !== "H2") {
        const next = a.nextElementSibling;
        panel.appendChild(a);
        a = next;
      }
      q.parentNode.insertBefore(panel, a);
      // question = the h3 itself (kept as a heading), its text in a keyboard-reachable button role
      const head = document.createElement("div");
      head.setAttribute("role", "button");
      head.setAttribute("tabindex", "0");
      head.setAttribute("aria-controls", id);
      while (q.firstChild) head.appendChild(q.firstChild);
      q.appendChild(head);
      q.classList.add("post-faq-question");
      const icon = holderIcon.cloneNode(true);
      icon.classList.remove(OPEN);
      icon.setAttribute("alt", "");
      icon.setAttribute("aria-hidden", "true");
      q.appendChild(icon);
      setOpen(head, panel, icon, false);
      const toggle = function () { setOpen(head, panel, icon, panel.hidden); };
      q.addEventListener("click", toggle);
      head.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); toggle(); }
      });
      node = a;
    }
  }

  function boot() {
    const body = document.querySelector(".article");
    const holderIcon = document.querySelector(".post-faq-holder .post-faq-icon");
    if (!body || !holderIcon) return; // no styles published here: leave the FAQ as it is
    build(body, holderIcon);
  }

  boot();
})();
