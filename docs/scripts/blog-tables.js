/*!
 * Bright Valley — post tables read as cards on phones (BVM-118).
 * Served:  https://files.brightvalleymarketing.com/scripts/blog-tables.min.js   (serving repo)
 * Footer tag (Blog Posts template page): <script src="https://files.brightvalleymarketing.com/scripts/blog-tables.min.js" defer></script>
 *
 * A wide table cannot sit in a phone's column, so the template's head CSS turns a table with four or
 * more columns into one card per row at 767px and below. A card needs the name of each value: this
 * script copies it from the table's own header row (a first row of <th> cells), as a span with a
 * data-label attribute at the start of every cell. The span is made here, at run time: no class, no
 * attribute and no change in any post's text. The head CSS keeps the labels hidden and shows them
 * only inside a card. A table with no header row gets no labels and shows its values as they are;
 * with JS off or a header the script cannot map (rowspan), the table stays a table that scrolls
 * inside its own box. Merged cells (colspan) are labelled by the column they start in.
 * Build: python3 scripts/site_deploy.py build --site brightvalley --src blog-tables
 */

(function () {
  "use strict";

  if (window.__bvBlogTables_v1) return;
  window.__bvBlogTables_v1 = true;

  const LABEL = "[data-label]";
  const MIN_COLUMNS = 4; // narrower tables fit a phone as they are and stay tables

  function cells(row) { return Array.prototype.slice.call(row.cells); }

  function addLabels(table) {
    const rows = Array.prototype.slice.call(table.rows);
    const head = rows[0];
    if (!head || !cells(head).every(function (c) { return c.tagName === "TH"; })) return;
    if (rows.some(function (r) { return cells(r).some(function (c) { return c.rowSpan > 1; }); })) return;
    const names = [];
    cells(head).forEach(function (c) {
      const name = c.textContent.replace(/\s+/g, " ").trim();
      for (let i = 0; i < c.colSpan; i++) names.push(name);
    });
    if (names.length < MIN_COLUMNS) return;
    rows.slice(1).forEach(function (row) {
      let col = 0;
      cells(row).forEach(function (cell) {
        const name = names[col];
        col += cell.colSpan;
        if (cell.tagName !== "TD" || !name || cell.querySelector(LABEL)) return;
        const label = document.createElement("span");
        label.setAttribute("data-label", "");
        label.textContent = name;
        cell.insertBefore(label, cell.firstChild);
      });
    });
  }

  function boot() {
    const body = document.querySelector(".article");
    if (!body) return;
    Array.prototype.forEach.call(body.querySelectorAll("table"), addLabels);
  }

  boot();
})();
