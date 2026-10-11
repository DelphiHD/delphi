/**
 * The type and alignment check: run before anything visual goes to Kaycee.
 *
 * Kaycee, 2026-10-11, after slim columns went to her with mismatched glyphs and
 * ragged numbers: "can we do a font style check before sending things to me
 * for review so I don't have to tell you this every single time?" and "My
 * expectation is that fonts will be of similar styles and sizes and that
 * everything on the page will be harmoniously aligned."
 *
 * Paste into the console on a published chart (or run through the browser
 * tool), at the width being reviewed. It looks at what is on screen now:
 *
 *   1. Every visible word is in Montserrat.
 *   2. Words that belong together share a size and weight: the placement
 *      columns against the name over the drawing, headings included.
 *   3. Columns line up: glyphs the same size, glyph centres on one line,
 *      numbers ending on one line, rows evenly spaced.
 *   4. Nothing visible overlaps something it should not: the columns against
 *      the bodygraph's centres, and against each other.
 *
 * Returns { pass, problems }. A clean run is the bar, not a nice-to-have.
 */
(function typeCheck() {
  const problems = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  const round = (n) => Math.round(n * 10) / 10;
  const spread = (arr) => arr.length ? Math.max(...arr) - Math.min(...arr) : 0;

  // 1. Montserrat everywhere a word is visible (glyph drawings excepted).
  const words = [...document.querySelectorAll('body *')].filter((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(el) && !el.closest('script,style,.sgl,.pgl'));
  const offFont = words.filter((el) => !/montserrat/i.test(getComputedStyle(el).fontFamily.split(',')[0]));
  if (offFont.length) problems.push(`Not in Montserrat: ${offFont.slice(0, 6).map((e) => `"${e.textContent.trim().slice(0, 20)}"`).join(', ')}${offFont.length > 6 ? ` and ${offFont.length - 6} more` : ''}`);

  // 2-4. The placement columns, when they are on screen.
  const cols = document.querySelector('div.sidecols');
  const canvas = [...document.querySelectorAll('svg.canvas')].find(vis);
  if (cols && vis(cols) && canvas) {
    // the name over the columns is the reference for size, weight and font
    const name = cols.querySelector('.sname > div') || canvas.querySelector('.cname');
    const ref = name ? getComputedStyle(name) : null;
    const colStyle = getComputedStyle(cols);
    if (ref && colStyle.fontWeight !== ref.fontWeight) problems.push(`Columns weight ${colStyle.fontWeight}, the name ${ref.fontWeight}`);
    if (ref && Math.abs(parseFloat(colStyle.fontSize) - parseFloat(ref.fontSize)) > 0.5) problems.push(`Columns ${colStyle.fontSize}, the name ${ref.fontSize}`);
    if (name && name.closest('svg') && name.getBoundingClientRect().height < 11) problems.push(`The name renders at about ${round(name.getBoundingClientRect().height)}px tall, too small to read`);
    for (const col of cols.querySelectorAll('.scol')) {
      const side = col.classList.contains('left') ? 'left column' : 'right column';
      const parts = [...col.querySelectorAll('.shead, .sn span, .sn')].filter(vis);
      const sizes = new Set(parts.map((p) => getComputedStyle(p).fontSize));
      const weights = new Set(parts.map((p) => getComputedStyle(p).fontWeight));
      if (sizes.size > 1) problems.push(`${side}: ${sizes.size} font sizes (${[...sizes].join(', ')})`);
      if (weights.size > 1) problems.push(`${side}: ${weights.size} font weights (${[...weights].join(', ')})`);
      const rows = [...col.querySelectorAll('.prow, .trow, .srow:not(.shead2)')].filter(vis);
      const g = rows.map((r) => r.querySelector('.sgl')).filter(Boolean).map((s) => s.getBoundingClientRect());
      if (spread(g.map((r) => r.width)) > 0.5 || spread(g.map((r) => r.height)) > 0.5) problems.push(`${side}: glyph boxes differ in size`);
      if (spread(g.map((r) => r.left + r.width / 2)) > 1) problems.push(`${side}: glyphs do not share a centre line (${round(spread(g.map((r) => r.left + r.width / 2)))}px apart)`);
      const n = rows.map((r) => r.querySelector('.sn')).filter(Boolean).map((s) => s.getBoundingClientRect());
      if (spread(n.map((r) => r.right)) > 1 && !col.querySelector('.srow')) problems.push(`${side}: numbers do not end on one line (${round(spread(n.map((r) => r.right)))}px apart)`);
      const tops = rows.map((r) => r.getBoundingClientRect().top), gaps = tops.slice(1).map((t, i) => t - tops[i]);
      if (spread(gaps) > 1.5) problems.push(`${side}: rows unevenly spaced (gaps ${round(Math.min(...gaps))} to ${round(Math.max(...gaps))}px)`);
    }
    // overlaps: a column row over a centre of the bodygraph
    const centres = [...canvas.querySelectorAll('.cshape')].filter(vis).map((c) => c.getBoundingClientRect());
    const hits = [...cols.querySelectorAll('.prow, .trow')].filter(vis).filter((r) => { const a = r.getBoundingClientRect();
      return centres.some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top); });
    if (hits.length) problems.push(`${hits.length} column rows overlap the bodygraph's centres`);
    const [L, Rc] = cols.querySelectorAll('.scol');
    if (L && Rc && L.getBoundingClientRect().right > Rc.getBoundingClientRect().left) problems.push('The two columns overlap each other');
  }
  return { pass: problems.length === 0, problems };
})();
