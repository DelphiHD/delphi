/**
 * Every tooltip on a chart, checked against the chart's own data.
 *
 * Six times on 2026-10-08 the same fault was reported one surface at a time:
 * something that describes a placement knew which SIDE it was and not which
 * PERSON, so it answered out of the wrong chart. Each fix was real and the
 * next surface still had it. Kaycee: "How do we get this right? This feels
 * like everything is going off the rails."
 *
 * The answer is not care. It is asking every surface at once. Paste this into
 * the browser console on a published chart with a connection cast, and it
 * hovers every glyph, every summary row, every placement row and every grid
 * header, in both perspectives, and compares the gate each one reports with
 * the gate that person actually has. It prints what disagrees.
 *
 * It found the real bug in one run: planetTip was handed the person and then
 * dropped it when asking for the gate, so the Gate pill was wrong everywhere
 * at once. That is why fixing the callers never finished it.
 */
(async function tooltipSweep() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tip = document.getElementById('tip');
  const C = DATA.connection;
  if (!C) { console.log('Cast a connection first.'); return; }

  const truth = {};
  (DATA.placements || []).filter((p) => p.side === 'personality')
    .forEach((p) => { truth['a|' + p.planet] = p.gate; });
  (C.b.personality || []).forEach((p) => { truth['b|' + p.planet] = p.gate; });

  const gateIn = (t) => { const m = /Gate (\d+)/.exec(t || ''); return m ? Number(m[1]) : null; };
  const hover = (el) => el.dispatchEvent(
    new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 300 }));

  const fails = [];
  let checked = 0;
  const check = (what, el, who, planet) => {
    hover(el); checked++;
    const want = truth[who + '|' + planet];
    const got = gateIn(tip.textContent);
    if (want && got && want !== got) {
      fails.push(`${what} ${planet} (${who}) said gate ${got}, wanted ${want}`);
    }
  };

  const sweep = (label) => {
    const a = document.querySelector('.astro');
    [...a.querySelectorAll('.pglyph[data-person]')]
      .filter((g) => g.getAttribute('data-side') === 'personality')
      .forEach((g) => check(label + ' wheel glyph', g,
        g.getAttribute('data-person'), g.getAttribute('data-aplanet')));
    ['#astrometa', '#astroplanets'].forEach((box) => {
      document.querySelectorAll(box + ' [data-prow][data-person]').forEach((r) =>
        check(label + ' ' + box, r, r.getAttribute('data-person'), r.getAttribute('data-prow')));
    });
  };

  // Every surface in every VIEW, not only the one it opens on. The design
  // grid was reported after the first sweep came back clean, because the
  // sweep had only ever run the grid on the personality. A surface is only
  // checked in the state it is checked in.
  const truthFor = (who, side, planet) => {
    const list = who === 'a'
      ? (DATA.placements || []).filter((p) => p.side === side)
      : ((side === 'design' ? C.b.design : C.b.personality) || []);
    const m = list.find((p) => (p.planet || p.name) === planet);
    return m ? m.gate : null;
  };
  const grid = (side) => {
    document.querySelectorAll('th[data-head]').forEach((h) => {
      hover(h); checked++;
      const want = truthFor(h.getAttribute('data-hperson') || 'a',
        h.getAttribute('data-hside'), h.getAttribute('data-head'));
      const got = gateIn(tip.textContent);
      if (want && got && want !== got) {
        fails.push(`${side} grid header ${h.getAttribute('data-head')} `
          + `(${h.getAttribute('data-hperson')}) said gate ${got}, wanted ${want}`);
      }
    });
  };
  for (const side of ['personality', 'design']) {
    document.getElementById(side === 'design' ? 'asDes' : 'asPers').click();
    await wait(900);
    sweep(side);
    document.getElementById('asGrid').click(); await wait(1000);
    grid(side);
    document.getElementById('asGrid').click(); await wait(600);
  }
  document.getElementById('relswap').click(); await wait(1000);
  sweep('swapped');

  console.log(`${checked} surfaces checked, ${fails.length} disagreed`);
  fails.forEach((f) => console.log('  ' + f));
  return { checked, failures: fails.length, fails };
})();
