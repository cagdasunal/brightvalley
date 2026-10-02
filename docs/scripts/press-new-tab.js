/*!
 * Bright Valley — /press: every press card's links open in a new tab (PR3-fix, #107; the operator, 10-02:
 * "ADD A JAVASCRIPT FOR THAT PAGE", as the Designer's "Open in new tab" ticks on CMS-bound links can't be done).
 * Page: /press (6a8700f97fa318be3d6c8c94). Served: https://cagdasunal.github.io/brightvalley/scripts/press-new-tab.min.js
 * Footer tag (/press page footer code): see sites/brightvalley/docs/steps/PR3-fix-script-footer-code.html
 * Step: sites/brightvalley/docs/steps/PR3-fix-script-press-links-new-tab.md
 *
 * The two press lists ("Interviews" and "Media features") are Collection Lists of cards. Each card has
 * three links to the outlet: the image (`.blog-post-image-wrap`), the title, and the Arrow Link CTA
 * (`.arrow-link`). Interviews' image and title already open in a new tab; this gives the same to every
 * other card link that lacks it (Media features' image and title, and the Arrow Link in both lists):
 * target="_blank" and rel="noopener". A link that already has a target is left exactly as it is.
 * It runs once from the end of the body (the cards are in the page's HTML by then). With JS off,
 * the links work as today, in the same tab.
 * Build: python3 scripts/site_deploy.py build --site brightvalley --src press-new-tab
 */

(function () {
  "use strict";

  if (window.__bvPressNewTab_v100) return;
  window.__bvPressNewTab_v100 = true;

  document.querySelectorAll(".w-dyn-list").forEach(function (list) {
    if (!list.querySelector(".blog-post-image-wrap")) return; // only the press card lists
    list.querySelectorAll(".w-dyn-item a[href]").forEach(function (link) {
      if (link.hasAttribute("target")) return;
      if (!/^https?:\/\//i.test(link.getAttribute("href"))) return; // outlet pages only
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener");
    });
  });
})();
