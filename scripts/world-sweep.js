/**
 * Every hover in The World, checked against the chart's own data.
 *
 * The chart's tooltip sweep (scripts/tooltip-sweep.js) for the map view. Paste
 * into the browser console on a published chart with an exact birth time, or
 * run it through the browser tool. It needs nothing cast: it switches through
 * Individual, Transit over the whole chart, Transit Only and a Relationship
 * itself (the Relationship with a fixed second person through /api/connection,
 * the same call the form makes), and in each it:
 *
 *   - hovers every line, edge glyph and paran on the map and checks the hover
 *     names the right person, side, body and sign, and that what lights gold is
 *     that mark and nothing belonging to anyone else;
 *   - checks each mark is painted as who it is (side, transit, second person);
 *   - hovers every row in the place panel and in Compare Places and checks the
 *     same of what lights;
 *   - opens each person's relocated chart and hovers every planet, checking
 *     the sign against the birth and the Gate pill against that person's gates.
 *
 * Prints what disagrees, and a count of what was checked.
 */
(async function worldSweep(opts) {
  opts = opts || {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const until = async (f, ms) => { for (let t = 0; t < (ms || 20000) && !f(); t += 200) await wait(200); return f(); };
  const fails = [], notes = [];
  const counts = {};
  const tally = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const SIDE = { personality: 'Personality', design: 'Design' };
  const first = (n) => String(n || '').split(' ')[0];

  if (!DATA.world) return { error: 'This chart has no exact birth time, so no World.' };
  document.getElementById('mSelf').click();
  document.getElementById('vWorld').click();
  const host = document.getElementById('worldview');
  await until(() => host.world);
  const W = host.world;
  const tip = $('#w-tip');
  const A = DATA.world;
  let B = null;

  const nameOf = (who) => (who === 'b' ? B.person : A.person);
  const whereOf = (who) => (who === 'b' ? B.where : A.where);
  const visible = (el) => !el.classList.contains('off') && el.getBoundingClientRect().width > 0;

  // What lights gold must be the hovered mark's own identity, nobody else's.
  const checkHot = (where, d) => {
    const lit = $$('#w-lines .hot, #w-labels .hot, #w-parans .hot');
    const want = new Set([d.body + '|' + d.angle].concat(d.body2 ? [d.body2 + '|' + d.angle2] : []));
    for (const el of lit) {
      const e = el.dataset;
      const ok = e.side === d.side && (e.who || '') === (d.who || '') && !!e.transit === !!d.transit &&
        (e.body2 ? e.body === d.body && e.body2 === d.body2 : want.has(e.body + '|' + e.angle));
      if (!ok) fails.push(`${where}: hovering ${id(d)} also lit ${id(e)}`);
    }
    if (!lit.some((el) => el.closest('#w-lines,#w-parans'))) notes.push(`${where}: ${id(d)} lit no mark on the map`);
  };
  const id = (d) => [d.who === 'b' ? 'B' : 'A', d.transit ? 'transit' : '', d.side, d.body, d.angle, d.body2 || '', d.angle2 || ''].filter(Boolean).join(' ');

  // Painted as who it is.
  const checkPaint = (where, el) => {
    const d = el.dataset, c = el.classList;
    if (el.tagName === 'path' && c.contains('hit')) return;
    if (!c.contains(d.side)) fails.push(`${where}: ${id(d)} not painted ${d.side}`);
    if (c.contains('who-b') !== (d.who === 'b')) fails.push(`${where}: ${id(d)} painted as the wrong person`);
    if (!d.body2 && c.contains('transit') !== !!d.transit) fails.push(`${where}: ${id(d)} transit paint disagrees`);
    if (d.person !== nameOf(d.who)) fails.push(`${where}: ${id(d)} carries data-person ${d.person}`);
  };

  // The hover's words.
  const checkTip = (where, d, text, pair) => {
    if (pair && !d.transit && !text.startsWith(first(nameOf(d.who)) + ' · ')) fails.push(`${where}: ${id(d)} hover does not start with ${first(nameOf(d.who))}: "${text.slice(0, 60)}"`);
    if (!text.includes(SIDE[d.side])) fails.push(`${where}: ${id(d)} hover misses ${SIDE[d.side]}`);
    if (!text.includes(d.body)) fails.push(`${where}: ${id(d)} hover misses ${d.body}`);
    if (d.body2) { if (!text.includes(d.body2)) fails.push(`${where}: ${id(d)} hover misses ${d.body2}`); return; }
    if (d.transit) { if (!text.startsWith('Transit ' + d.body)) fails.push(`${where}: ${id(d)} hover reads "${text.slice(0, 60)}"`); return; }
    const w = whereOf(d.who)[d.side][d.body];
    if (!text.includes(d.body + ' in ' + w)) fails.push(`${where}: ${id(d)} hover says "${text.slice(0, 70)}", wanted ${d.body} in ${w}`);
  };

  const sweepMap = async (label, pair) => {
    const map = $('#w-map');
    const els = $$('#w-hits [data-side], #w-labels [data-side], #w-parans [data-side]').filter(visible);
    for (const el of els) {
      const d = el.dataset;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      tally(label + ' map');
      checkTip(label + ' map', d, tip.textContent, pair);
      checkHot(label + ' map', d);
      checkPaint(label + ' map', el);
    }
    map.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }));
    // Every visible line has its own visible marks.
    for (const l of W.LN) if (!l.el.classList.contains('off')) checkPaint(label + ' line', l.el);
  };

  const sweepRows = (label, sel) => {
    for (const r of $$(sel)) {
      const d = r.dataset;
      if (!d.side) continue;
      r.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      tally(label + ' rows');
      if (d.angle) checkHot(label + ' ' + sel.split(' ')[0], d);
      r.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    }
  };

  // Two saved places, kept only for the sweep and put back after.
  const STORE = 'acg-places|' + A.person;
  let before = null;
  try { before = localStorage.getItem(STORE); } catch (e) { /* fine */ }

  const openPlace = async () => {
    const pl = $('#w-compare [data-go]');
    if (pl) pl.click();
  };

  const sweepWheels = async (label, people) => {
    await openPlace();
    if (!$('#w-here.open')) { notes.push(label + ': no place open, wheels skipped'); return; }
    const tog = $('#w-here [data-reltog]');
    if (tog && !tog.classList.contains('open')) tog.click();
    for (const who of people) {
      const btn = await until(() => $('#w-here [data-wheel="' + who + '"]'), 30000);
      if (!btn) { fails.push(`${label}: no relocated chart for ${who === 'b' ? 'B' : 'A'}`); continue; }
      btn.click();
      const box = $('#w-wheel');
      for (const which of ['personality', 'design', 'both']) {
        const t = $('#w-wheel [data-wtab="' + which + '"]');
        if (t) t.click();
        await wait(150);
        for (const g of $$('#w-wheel .box [data-aplanet]')) {
          const r = g.getBoundingClientRect();
          if (!r.width) continue;
          box.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 1, clientY: r.top + 1 }));
          g.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 1, clientY: r.top + 1 }));
          const text = tip.textContent;
          tally(label + ' wheel');
          const side = g.dataset.side === 'design' ? 'design' : 'personality';
          const m = /^(Personality|Design) (.+?) in (\S+ \S+)/.exec(text);
          if (!m) { if (text) fails.push(`${label} wheel ${who}: unreadable hover "${text.slice(0, 50)}"`); continue; }
          if (m[1] !== SIDE[side]) fails.push(`${label} wheel ${who}: ${g.dataset.aplanet} hover says ${m[1]}, glyph is ${side}`);
          const want = whereOf(who)[side][m[2]];
          if (want && want !== m[3]) fails.push(`${label} wheel ${who}: ${side} ${m[2]} hover says ${m[3]}, birth has ${want}`);
          const gate = /Gate (\d+\.\d)/.exec(text);
          const G = (who === 'b' ? B.gateOf : A.gateOf)[side][m[2]];
          if (G && (!gate || gate[1] !== G)) fails.push(`${label} wheel ${who}: ${side} ${m[2]} Gate ${gate ? gate[1] : 'missing'}, wanted ${G}`);
        }
      }
      $('#w-wheel').classList.remove('open');
    }
  };

  const run = async (label, pair) => {
    await wait(600);
    await sweepMap(label, pair);
    $('#w-cmpBtn').click();
    if (!$('#w-compare.open')) $('#w-cmpBtn').click();
    await wait(200);
    for (const f of $$('#w-compare [data-fold]')) if (!f.classList.contains('open')) { f.click(); await wait(100); }
    await until(() => !$('#w-compare').textContent.includes('…'), 30000);
    sweepRows(label, '#w-compare tr');
    if (!opts.noWheels) await sweepWheels(label, pair ? ['a', 'b'] : ['a']);
    sweepRows(label, '#w-here .hr');
    const x = $('#w-compare .x'); if (x) x.click();
    const hx = $('#w-here .x'); if (hx) hx.click();
  };

  try {
    localStorage.setItem(STORE, JSON.stringify([
      { n: 'Lisbon', c: 'Portugal', lat: 38.7223, lon: -9.1393 },
      { n: 'Kyoto', c: 'Japan', lat: 35.0116, lon: 135.7681 },
    ]));
  } catch (e) { /* fine */ }
  // The view reads saved places when it mounts; this chart's is mounted, so
  // the sweep saves through the panel instead when storage was not re-read.
  if (!$('#w-cmpBtn').classList.contains('has')) notes.push('Saved places are read on load: reload once and run again for Compare Places.');

  // Every planet and angle on, so nothing is skipped.
  W.state.lines && ['Earth', 'North Node', 'South Node'].forEach((b) => W.state.lines.add(b));
  W.state.extras && ['Chiron', 'Lilith'].forEach((b) => W.state.extras.add(b));

  await run('Individual', false);

  document.getElementById('mTransit').click();
  await wait(300);
  const sel = document.getElementById('trAgainst');
  sel.value = 'whole'; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => W.LN.some((l) => l.tr), 20000);
  await run('Transit', false);
  sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(500);
  await run('Transit Only', false);

  document.getElementById('mRelation').click();
  await wait(300);
  const q = new URLSearchParams({ token: location.pathname.split('/').pop(), date: '1941-05-24', time: '21:05',
    place: 'Duluth, Minnesota, United States', name: 'Bob Dylan' });
  const j = await (await fetch('/api/connection?' + q)).json();
  if (!j.world) { fails.push('Relationship: /api/connection gave no World for an exact second person'); }
  else {
    B = j.world;
    DATA.connection = j;
    if (typeof paintRelationship === 'function') paintRelationship();
    document.getElementById('mSelf').click(); document.getElementById('mRelation').click();
    document.dispatchEvent(new CustomEvent('delphi:connection', { detail: j }));
    await until(() => W.LN.some((l) => l.who === 'b'));
    await run('Relationship', true);
    for (const [btn, gone] of [['partyB', 'b'], ['partyA', 'a']]) {
      document.getElementById(btn).click(); await wait(300);
      const shown = W.LN.filter((l) => !l.el.classList.contains('off'));
      if (shown.some((l) => (l.who === 'b' ? 'b' : 'a') === gone)) fails.push(`Relationship: ${btn} off left that person's lines on the map`);
      tally('people buttons');
      document.getElementById(btn).click(); await wait(300);
    }
  }

  try { before === null ? localStorage.removeItem(STORE) : localStorage.setItem(STORE, before); } catch (e) { /* fine */ }
  return { checked: counts, fails: [...new Set(fails)], notes: [...new Set(notes)].slice(0, 20) };
})();
