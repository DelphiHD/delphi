// The workshop stage: one screen, no slides. The room's names move across the
// bodygraph and the wheel. Plain script, read from its own file.
(function () {
  var D = JSON.parse(document.getElementById('deck-data').textContent);
  // Presenter edits to the room, kept on this laptop: a different name on a pill (two
  // people with the same first name) or a person taken off the screen. Made on The
  // Room page with E. Kaycee, 2026-09-14.
  var EDITS = {};
  try { EDITS = JSON.parse(localStorage.getItem('delphi-stage-edits') || '{}') || {}; } catch (e) { EDITS = {}; }
  var editKey = function (p) { return String(p.token || p.fullName || p.name); };
  D.room.forEach(function (p) { p.origName = p.origName || p.name; var e = EDITS[editKey(p)]; if (e && e.name) p.name = e.name; });
  var ROOM = D.room.filter(function (p) { var e = EDITS[editKey(p)]; return !(e && e.hidden); }), LIB = D.lib;
  function saveEdits() { try { localStorage.setItem('delphi-stage-edits', JSON.stringify(EDITS)); } catch (e) {} }
  var app = document.getElementById('app');
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function norm(v) {
    var low = String(v || '').toLowerCase().split(':')[0].split('definition').join(''), out = '';
    for (var i = 0; i < low.length; i++) { var ch = low.charAt(i); if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '/') out += ch; }
    return out;
  }
  var TYPE_ORDER = ['Generator', 'Manifesting Generator', 'Projector', 'Manifestor', 'Reflector'];
  var AURA = { 'Generator': 'gen', 'Manifesting Generator': 'mg', 'Projector': 'pro', 'Manifestor': 'man', 'Reflector': 'ref' };
  var GLYPH = { 'Sun': '☉', 'Earth': '⊕', 'North Node': '☊', 'South Node': '☋', 'Moon': '☽', 'Mercury': '☿',
    'Venus': '♀', 'Mars': '♂', 'Jupiter': '♃', 'Saturn': '♄', 'Uranus': '♅', 'Neptune': '♆', 'Pluto': '♇' };

  app.innerHTML =
    '<div class="bar">' + (D.logo ? '<img src="' + D.logo + '" alt="Delphi">' : '') +
    '<div class="modes">' + ['The Room', 'Origins', 'Living Mandala', 'Build a Chart', 'Centers', 'Authority', 'Definition', 'Profile', 'Auras', 'Conditioning'].map(function (m) {
      return '<button data-mode="' + m + '">' + m + '</button>';
    }).join('') + '</div><span class="sp"></span><span class="room">' + ROOM.length + ' in the room</span></div>' +
    '<div class="stage">' +
    '<div class="layer body" id="body">' + D.teachSvg + '</div>' +
    '<div class="layer hide" id="sky">' + D.rings + '</div>' +
    '<div class="layer hide" id="auras"></div>' +
    '<div class="layer hide" id="buildchart"></div>' +
    '<div class="layer hide roompage" id="room"></div>' +
    '<div class="layer hide" id="defs"></div>' +
    '<div class="layer hide" id="auths"></div>' +
    '<div class="layer hide" id="profiles"></div>' +
    '<div class="layer hide" id="origin"><div class="ogrid"><div class="ocards ol"></div>' +
      '<div class="obody"><div class="ohead"></div><div class="orings">' + D.rings + '</div><div class="osvg body">' + D.teachSvg + '</div></div>' +
      '<div class="oright"><div class="otables"></div><div class="ocards orr"></div></div></div></div>' +
    '<div class="layer hide" id="motion"><iframe title="Living Mandala" style="width:100%;height:100%;border:0;display:block"></iframe></div>' +
    '<div class="layer hide build" id="build"><div class="split2"><div id="bwheel">' + D.rings + '</div><div id="bbody" class="body">' + D.teachSvg + '</div></div></div>' +
    '</div><div class="names" id="names"></div>' +
    '<div class="note hide" id="note"></div><div id="controls"></div><div class="caption" id="caption"></div>' +
    '<aside class="cpanel hide" id="cpanel"></aside>';

  // ---- the drawings, cropped to what matters -------------------------------
  function crop(svg, sel, pad) {
    svg.removeAttribute('width'); svg.removeAttribute('height');
    var sr = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    if (!sr.width || !vb || !vb.width) return;
    var k = Math.max(vb.width / sr.width, vb.height / sr.height);
    // with meet scaling the drawing is centred, so measure from its real origin
    var ox = sr.left + (sr.width - vb.width / k) / 2, oy = sr.top + (sr.height - vb.height / k) / 2;
    var box = null;
    $$(sel, svg).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var x1 = (r.left - ox) * k + vb.x, y1 = (r.top - oy) * k + vb.y, x2 = x1 + r.width * k, y2 = y1 + r.height * k;
      box = box ? { x1: Math.min(box.x1, x1), y1: Math.min(box.y1, y1), x2: Math.max(box.x2, x2), y2: Math.max(box.y2, y2) } : { x1: x1, y1: y1, x2: x2, y2: y2 };
    });
    if (box) svg.setAttribute('viewBox', (box.x1 - pad) + ' ' + (box.y1 - pad) + ' ' + (box.x2 - box.x1 + 2 * pad) + ' ' + (box.y2 - box.y1 + 2 * pad));
  }

  // Line every arrow and flowing beam up with its channel: the channel's axis is
  // measured from the leg shapes themselves, so nothing sits off-centre or tilted.
  function alignFlows(svg) {
    if (!svg) return;
    // centre and long axis of a set of outline points
    function axis(pts) {
      var mx = 0, my = 0, xx = 0, yy = 0, xy = 0;
      pts.forEach(function (q) { mx += q[0]; my += q[1]; });
      mx /= pts.length; my /= pts.length;
      pts.forEach(function (q) { var dx = q[0] - mx, dy = q[1] - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; });
      var th = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(th), uy = Math.sin(th);
      var lo = Infinity, hi = -Infinity, wlo = Infinity, whi = -Infinity;
      pts.forEach(function (q) {
        var t = (q[0] - mx) * ux + (q[1] - my) * uy, w = -(q[0] - mx) * uy + (q[1] - my) * ux;
        lo = Math.min(lo, t); hi = Math.max(hi, t); wlo = Math.min(wlo, w); whi = Math.max(whi, w);
      });
      return { mx: mx, my: my, ux: ux, uy: uy, lo: lo, hi: hi, long: (hi - lo) > 1.4 * (whi - wlo) };
    }
    function onAxis(A, x, y) { var t = (x - A.mx) * A.ux + (y - A.my) * A.uy; return [A.mx + A.ux * t, A.my + A.uy * t, t]; }
    $$('.flows .ch', svg).forEach(function (ch) {
      var all = [], legs = [];
      $$(':scope > .leg', ch).forEach(function (leg) {
        var shape = leg.querySelector(':scope > path, :scope > rect, :scope > polygon');
        if (!shape || !shape.getTotalLength) return;
        var L = shape.getTotalLength(), pts = [];
        for (var i = 0; i < 64; i++) { var q = shape.getPointAtLength(L * i / 64); pts.push([q.x, q.y]); }
        all = all.concat(pts);
        legs.push({ el: leg, A: axis(pts) });
      });
      if (!legs.length) return;
      var C = axis(all);
      // a leg's own axis when it is clearly long, else the whole channel's
      legs.forEach(function (l) { if (!l.A.long) { var p = onAxis(C, l.A.mx, l.A.my); l.A = { mx: p[0], my: p[1], ux: C.ux, uy: C.uy, lo: l.A.lo, hi: l.A.hi }; } });
      legs.forEach(function (l) {
        $$('g[transform^="rotate"]', l.el).forEach(function (g) {
          var m = g.getAttribute('transform').match(/rotate\(([-\d.]+)/);
          var old = m ? +m[1] * Math.PI / 180 : 0, A = l.A;
          var sgn = Math.cos(old) * A.ux + Math.sin(old) * A.uy < 0 ? -1 : 1;
          var ang = Math.atan2(A.uy * sgn, A.ux * sgn) * 180 / Math.PI;
          g.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ' ' + A.mx.toFixed(2) + ' ' + A.my.toFixed(2) + ')');
          var r = g.querySelector('rect');
          if (r) { r.setAttribute('x', (A.mx - 10).toFixed(2)); r.setAttribute('y', (A.my - (+r.getAttribute('height')) / 2).toFixed(2)); }
        });
      });
      $$(':scope > .arrow', ch).forEach(function (ar) {
        var P = ar.getAttribute('points').trim().split(/[\s,]+/).map(Number);
        if (P.length < 6) return;
        var tip = [P[0], P[1]], bm = [(P[2] + P[4]) / 2, (P[3] + P[5]) / 2];
        var len = Math.hypot(tip[0] - bm[0], tip[1] - bm[1]), hw = Math.hypot(P[2] - P[4], P[3] - P[5]) / 2;
        var ox = (tip[0] + bm[0]) / 2, oy = (tip[1] + bm[1]) / 2;
        // the leg the arrow was drawn on: nearest to it, allowing for its length
        var best = null, bd = Infinity;
        legs.forEach(function (l) {
          var p = onAxis(l.A, ox, oy), off = Math.hypot(ox - p[0], oy - p[1]);
          var past = Math.max(0, l.A.lo - p[2], p[2] - l.A.hi);
          if (off + past < bd) { bd = off + past; best = l; }
        });
        var A = best.A, p = onAxis(A, ox, oy);
        var t = Math.max(A.lo + len / 2, Math.min(A.hi - len / 2, p[2]));
        var cx = A.mx + A.ux * t, cy = A.my + A.uy * t, dx = A.ux, dy = A.uy;
        if (dx * (tip[0] - bm[0]) + dy * (tip[1] - bm[1]) < 0) { dx = -dx; dy = -dy; }
        var nx = -dy, ny = dx, f = function (x, y) { return x.toFixed(2) + ',' + y.toFixed(2); };
        ar.setAttribute('points', [f(cx + dx * len / 2, cy + dy * len / 2),
          f(cx - dx * len / 2 + nx * hw, cy - dy * len / 2 + ny * hw),
          f(cx - dx * len / 2 - nx * hw, cy - dy * len / 2 - ny * hw)].join(' '));
      });
    });
  }
  // arrows on parallel channels between the same two centers sit level with each other
  function levelArrows(svg) {
    if (!svg) return;
    var shapes = $$('.cshape', svg);
    function centerOf(gate) {
      var t = svg.querySelector('.gnum[data-gate="' + gate + '"]');
      if (!t) return null;
      var b = t.getBBox(), pt = svg.createSVGPoint(); pt.x = b.x + b.width / 2; pt.y = b.y + b.height / 2;
      for (var i = 0; i < shapes.length; i++) if (shapes[i].isPointInFill && shapes[i].isPointInFill(pt)) return shapes[i].getAttribute('data-center');
      return null;
    }
    var groups = {};
    $$('.flows .ch', svg).forEach(function (ch) {
      var ar = ch.querySelector(':scope > .arrow');
      if (!ar) return;
      var ids = (ch.getAttribute('data-ch') || '').split('-');
      var a = centerOf(ids[0]), b = centerOf(ids[1]);
      if (!a || !b) return;
      var P = ar.getAttribute('points').trim().split(/[\s,]+/).map(Number);
      var tip = [P[0], P[1]], bm = [(P[2] + P[4]) / 2, (P[3] + P[5]) / 2];
      var ang = Math.atan2(Math.abs(tip[1] - bm[1]), Math.abs(tip[0] - bm[0]));
      // along-channel extent of the legs, in page units
      var lo = Infinity, hi = -Infinity, vert = ang > Math.PI / 4;
      $$(':scope > .leg > path, :scope > .leg > rect, :scope > .leg > polygon', ch).forEach(function (sh) {
        var bb = sh.getBBox();
        lo = Math.min(lo, vert ? bb.y : bb.x); hi = Math.max(hi, vert ? bb.y + bb.height : bb.x + bb.width);
      });
      var key = [a, b].sort().join('|');
      (groups[key] = groups[key] || []).push({ ar: ar, P: P, ang: ang, vert: vert, lo: lo, hi: hi });
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length < 2) return;
      var ang0 = g[0].ang;
      if (g.some(function (x) { return Math.abs(x.ang - ang0) > 0.09 || x.vert !== g[0].vert; })) return;
      var lo = Math.max.apply(null, g.map(function (x) { return x.lo; })), hi = Math.min.apply(null, g.map(function (x) { return x.hi; }));
      if (!(hi > lo)) return;
      var mid = (lo + hi) / 2;
      g.forEach(function (x) {
        var P = x.P, c = x.vert ? (P[1] + (P[3] + P[5]) / 2) / 2 : (P[0] + (P[2] + P[4]) / 2) / 2, d = mid - c, out = [];
        for (var i = 0; i < 6; i += 2) out.push(x.vert ? P[i].toFixed(2) + ',' + (P[i + 1] + d).toFixed(2) : (P[i] + d).toFixed(2) + ',' + P[i + 1].toFixed(2));
        x.ar.setAttribute('points', out.join(' '));
      });
    });
  }
  alignFlows($('#body svg')); alignFlows($('#bbody svg'));
  var bodySvg = $('#body svg'), bbodySvg = $('#bbody svg'), skySvg = $('#sky svg'), bwheelSvg = $('#bwheel svg');
  function cropAll() {
    crop(bodySvg, '.cshape, .ch, .clabel, .chip', 20);
    crop(bbodySvg, '.cshape, .ch', 20);
  }
  function centerOf(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }
  function wheelPoint(svg, lon, r) {
    var fromTop = ((lon - D.top) % 360 + 360) % 360, a = Math.PI / 2 + fromTop * Math.PI / 180;
    var p = svg.createSVGPoint();
    p.x = D.wheelGeo.cx + r * Math.cos(a); p.y = D.wheelGeo.cy - r * Math.sin(a);
    var s = p.matrixTransform(svg.getScreenCTM());
    return { x: s.x, y: s.y, sx: p.x, sy: p.y };
  }

  // ---- the names ------------------------------------------------------------
  var namesEl = $('#names');
  var chip = {};
  ROOM.forEach(function (p) {
    var el = document.createElement('div');
    // hidden until a view places it, so nothing flashes in the middle on load
    el.className = 'nm gone';
    el.textContent = p.name;
    el.dataset.person = p.name;
    el.style.left = (window.innerWidth / 2) + 'px'; el.style.top = (window.innerHeight / 2) + 'px';
    namesEl.appendChild(el);
    chip[p.name] = el;
  });
  function place(name, x, y, cls) {
    var el = chip[name];
    el.className = 'nm' + (cls ? ' ' + cls : '');
    el.style.left = Math.max(40, Math.min(window.innerWidth - 40, x)) + 'px';
    el.style.top = Math.max(80, Math.min(window.innerHeight - 20, y)) + 'px';
  }
  function hideNames() { ROOM.forEach(function (p) { chip[p.name].className = 'nm gone'; }); }
  // a ring of names around a point
  function ring(list, cx, cy, r, cls, start) {
    var n = list.length;
    list.forEach(function (p, i) {
      var a = (start || -Math.PI / 2) + (2 * Math.PI * i) / Math.max(1, n);
      place(p.name, cx + r * Math.cos(a) * 1.7, cy + r * Math.sin(a), cls);
    });
  }
  // a column of names down one side, the resting place
  function rest(side) {
    var x = side === 'right' ? window.innerWidth - 110 : 110;
    var gap = Math.min(40, (window.innerHeight - 140) / Math.max(1, ROOM.length));
    ROOM.forEach(function (p, i) { place(p.name, x, 100 + i * gap, ''); });
  }

  // ---- her words in the corner ------------------------------------------------
  var note = $('#note');
  function say(html) {
    var top = note.classList.contains('top');
    if (!html) { note.className = 'note hide' + (top ? ' top' : ''); return; }
    note.innerHTML = html; note.className = 'note' + (top ? ' top' : '');
  }
  var controls = $('#controls'), caption = $('#caption');

  function show(layer, roomForPicker) {
    ['body', 'sky', 'auras', 'build', 'motion', 'buildchart', 'room', 'defs', 'auths', 'origin', 'profiles'].forEach(function (id) { $('#' + id).classList.toggle('hide', id !== layer); });
    if (typeof panelOpen === 'function' && mode !== 'Centers') panelOpen(false);
    controls.innerHTML = '';
    // a row of name buttons along the bottom gets its own space, and the note moves up
    $('#body').style.bottom = roomForPicker ? '84px' : '';
    note.classList.toggle('top', !!roomForPicker);
    if (layer === 'body') crop(bodySvg, '.cshape, .ch, .clabel, .chip', 20);
  }
  function resetBody(svg) {
    $$('.cshape', svg).forEach(function (el) { el.classList.remove('fade', 'glow'); el.style.fill = ''; el.style.animation = ''; });
    $$('.ch', svg).forEach(function (el) { el.classList.remove('lit'); el.style.opacity = ''; });
    $$('.leg', svg).forEach(function (el) { el.style.opacity = ''; });
    $$('.arrow', svg).forEach(function (el) { el.style.opacity = ''; });
    $$('.gnum', svg).forEach(function (el) { el.style.fill = ''; el.style.fontWeight = ''; });
    svg.parentNode.classList.remove('dimch', 'quiet');
  }

  // ---- Centers ---------------------------------------------------------------
  // One panel on the right holds everything: the room's names wait there, and
  // clicking a center regroups them into Defined, Undefined and Open with her
  // text for each. Kaycee, 2026-09-13: "one main panel for text when clicking on
  // centers... maybe just have them rearrange themselves on the right hand side
  // into their associated categories".
  var STATE = { defined: 'Defined', undefined: 'Undefined', open: 'Open' };
  var centerTab = 'defined';
  var FNS = ['Pressure', 'Motor', 'Awareness', 'Identity', 'Manifestation'];
  var focused = {};
  var off = { fn: {}, circuit: {} };
  function centerFns(c) { return ((LIB.centers[D.centerLib[c]] || {}).type || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }

  document.addEventListener('scroll', function (e) { if (e.target && e.target.id === 'cpanel') settle(true); }, true);
  function panelOpen(on) {
    $('#cpanel').classList.toggle('hide', !on);
    $('#body').style.right = on ? '470px' : '';
    $('#body').style.left = on ? '230px' : '';
  }
  // the dock: switch center types and circuits on and off, as on the charts
  function dock() {
    var fam = {};
    (D.circuits || []).forEach(function (c) { (fam[c.group] = fam[c.group] || []).push(c); });
    var allNone = function (k) { return '<span class="an"><button data-all="' + k + '">All</button><button data-none="' + k + '">None</button></span>'; };
    controls.innerHTML = '<div class="dock"><div class="dh">Center Types' + allNone('fn') + '</div>' + FNS.map(function (f) {
      return '<label><input type="checkbox" data-fn="' + f + '"' + (off.fn[f] ? '' : ' checked') + '> ' + f + '</label>';
    }).join('') + '<div class="dh dsep">Circuitry' + allNone('circ') + '</div>' + Object.keys(fam).map(function (g) {
      // every family gets its own heading, Integration included: it stands alone
      return '<div class="dg" data-tip="' + esc(g) + '">' + esc(g) + '</div>' + fam[g].map(function (c) {
        return '<label data-tip="' + esc(c.name) + '"><input type="checkbox" data-circ="' + c.id + '"' + (off.circuit[c.id] ? '' : ' checked') + '><span class="sw" style="background:' + c.color + '"></span>' +
          esc(c.name.replace(/^[^:]+:\s*/, '')) + '</label>';
      }).join('');
    }).join('') + '</div>';
    $$('.dock input', controls).forEach(function (b) {
      b.onchange = function () {
        if (b.dataset.fn) off.fn[b.dataset.fn] = !b.checked; else off.circuit[b.dataset.circ] = !b.checked;
        applyOff();
      };
    });
    // her Delphi Basic for each circuit family and circuit, on hover
    $$('.dock [data-tip]', controls).forEach(function (el) {
      var txt = (LIB.circuit || {})[el.dataset.tip];
      if (!txt) return;
      el.onmouseenter = function () {
        var r = el.getBoundingClientRect();
        tip.innerHTML = '<b>' + esc(el.dataset.tip) + '</b>' + esc(txt);
        tip.style.left = (r.right + 12) + 'px'; tip.style.top = r.top + 'px'; tip.className = 'gtip';
      };
      el.onmouseleave = function () { tip.className = 'gtip hide'; };
    });
    $$('.dock .an button', controls).forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.all || b.dataset.none, on = !!b.dataset.all;
        $$('.dock input[data-' + k + ']', controls).forEach(function (i) {
          i.checked = on;
          if (k === 'fn') off.fn[i.dataset.fn] = !on; else off.circuit[i.dataset.circ] = !on;
        });
        applyOff();
      };
    });
  }
  function applyOff() {
    D.centerOrder.forEach(function (c) {
      var hide = centerFns(c).length && centerFns(c).every(function (f) { return off.fn[f]; });
      // when only some types are chosen, the chosen centers step forward
      var pick = !hide && FNS.some(function (f) { return off.fn[f]; }) && centerFns(c).length;
      $$('[data-center="' + c + '"]', bodySvg).forEach(function (el) { el.classList.toggle('typeoff', !!hide); el.classList.toggle('typeon', !!pick); });
    });
    $$('.ch', bodySvg).forEach(function (el) { el.classList.toggle('circoff', !!off.circuit[el.getAttribute('data-circuit')]); });
    restripe(bodySvg);
  }
  // A leg shared by two channels is drawn as side-by-side stripes. When one of those
  // channels is switched off, the stripes still showing share the full width, so a
  // gate is never left half filled (Kaycee, 2026-09-13: gate 20).
  function restripe(svg) {
    var groups = {};
    $$('.flows .ch > .leg', svg).forEach(function (leg) {
      var cp = leg.querySelector(':scope > clipPath > *');
      var rects = $$(':scope > g[clip-path] > g > rect:not(.beam)', leg);
      if (!cp || !rects.length) return;
      var key = cp.getAttribute('points') || cp.getAttribute('d') || '';
      rects.forEach(function (r) {
        if (!r.hasAttribute('data-y0')) { r.setAttribute('data-y0', r.getAttribute('y')); r.setAttribute('data-h0', r.getAttribute('height')); }
        (groups[key] = groups[key] || []).push(r);
      });
    });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k];
      var top = Math.min.apply(null, list.map(function (r) { return +r.getAttribute('data-y0'); }));
      var full = list.reduce(function (t, r) { return t + (+r.getAttribute('data-h0')); }, 0);
      var on = list.filter(function (r) { return !r.closest('.ch').classList.contains('circoff'); });
      on.sort(function (a, b) { return +a.getAttribute('data-y0') - +b.getAttribute('data-y0'); });
      on.forEach(function (r, i) {
        r.setAttribute('y', (top + i * full / on.length).toFixed(2));
        r.setAttribute('height', (full / on.length).toFixed(2));
      });
    });
  }

  // before a center is chosen: the room's count for every center
  function roster() {
    hideNames();
    var P = $('#cpanel');
    P.innerHTML = '<div class="k">' + ROOM.length + ' in the room</div><h2>Centers</h2><div class="cover">' +
      D.centerOrder.map(function (c) {
        var n = { defined: 0, undefined: 0, open: 0 };
        ROOM.forEach(function (p) { n[p.centers[c]]++; });
        var w = function (k) { return ROOM.length ? (n[k] / ROOM.length * 100) : 0; };
        return '<div class="crow" data-c="' + c + '"><span>' + esc(D.centerName[c]) + '</span><div class="cbar">' +
          '<i class="def" style="width:' + w('defined') + '%"></i><i class="und" style="width:' + w('undefined') + '%"></i><i class="opn" style="width:' + w('open') + '%"></i></div>' +
          '<b>' + n.defined + ' · ' + n.undefined + ' · ' + n.open + '</b></div>';
      }).join('') + '</div><div class="ckey"><span class="def"></span>Defined <span class="und"></span>Undefined <span class="opn"></span>Open</div>';
    $$('#cpanel .crow').forEach(function (r) { r.onclick = function () { focusCenter(r.dataset.c); }; });
  }
  // move every name to its slot in the panel
  function settle(instant) {
    requestAnimationFrame(function () {
      var box = $('#cpanel').getBoundingClientRect();
      ROOM.forEach(function (p) {
        var slot = $('#cpanel .slot[data-n="' + CSS.escape(p.name) + '"]');
        if (!slot) { chip[p.name].className = 'nm gone'; return; }
        var r = slot.getBoundingClientRect();
        var el = chip[p.name];
        if (instant) el.style.transition = 'none';
        el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top + r.height / 2) + 'px';
        // a name scrolled out of the panel is not left floating over the chart
        var inside = r.top >= box.top + 4 && r.bottom <= box.bottom - 4;
        el.className = 'nm' + (slot.dataset.cls ? ' ' + slot.dataset.cls : '') + (inside ? '' : ' gone');
        if (instant) { el.offsetHeight; el.style.transition = ''; }
      });
    });
  }
  function modeCenters() {
    show('body'); resetBody(bodySvg); caption.innerHTML = ''; say('');
    focused = {}; panelOpen(true); dock(); applyOff();
    setTimeout(function () { crop(bodySvg, '.cshape, .ch, .clabel, .chip', 20); roster(); }, 40);
  }
  function focusCenter(c) {
    focused.center = c;
    $$('.cshape', bodySvg).forEach(function (el) {
      var on = el.getAttribute('data-center') === c;
      el.classList.toggle('fade', !on); el.classList.toggle('glow', on);
    });
    bodySvg.parentNode.classList.add('dimch');
    var by = { defined: [], undefined: [], open: [] };
    ROOM.forEach(function (p) { by[p.centers[c]].push(p); });
    var L = LIB.centers[D.centerLib[c]] || {};
    var talk = (LIB.slides || {})['Not-Self Talk: ' + D.centerName[c]] || '';
    var cls = { defined: 'def', undefined: 'und', open: 'open' };
    var ns = (LIB.notSelf || {})[D.centerLib[c]] || '';
    var pct = function (st) { return ROOM.length ? Math.round(by[st].length / ROOM.length * 100) : 0; };
    var bul = ((LIB.centerBullets || {})[D.centerLib[c]] || {});
    $('#cpanel').innerHTML = '<button class="x" aria-label="Back to the room">&times;</button>' +
      '<div class="k">' + esc(centerFns(c).join(' · ')) + '</div><h2>' + esc(D.centerName[c]) + '</h2>' +
      '<p class="themes">' + esc(L.themes || '') + '</p>' +
      '<div class="tabs">' + ['defined', 'undefined', 'open'].map(function (st) {
        return '<button class="tab ' + cls[st] + (st === centerTab ? ' on' : '') + '" data-st="' + st + '"><b>' + STATE[st] + '</b><span>' + by[st].length + ' · ' + pct(st) + '%</span></button>';
      }).join('') + '</div>' +
      ['defined', 'undefined', 'open'].map(function (st) {
        return '<section class="st ' + cls[st] + '" data-st="' + st + '"' + (st === centerTab ? '' : ' hidden') + '>' +
          (st !== 'defined' && ns ? '<p class="ns"><span>Not-Self Theme</span>' + esc(ns) + '</p>' : '') +
          (st !== 'defined' && talk ? '<p class="talk">' + esc(talk) + '</p>' : '') +
          '<ul class="bul">' + (bul[st] || []).filter(function (x) { return !/^Not-Self:/.test(x); }).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
          '<div class="slots">' + by[st].map(function (p) {
            return '<span class="slot" data-cls="' + cls[st] + '" data-n="' + esc(p.name) + '">' + esc(p.name) + '</span>';
          }).join('') + '</div>' +
          '<ul class="pnote">' + GENERAL[st].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="pnote">' + esc(L[st] || '') + '</p></section>';
      }).join('');
    $$('#cpanel .tab').forEach(function (t) {
      t.onclick = function () {
        centerTab = t.dataset.st;
        $$('#cpanel .tab').forEach(function (x) { x.classList.toggle('on', x === t); });
        $$('#cpanel section.st').forEach(function (x) { x.hidden = x.dataset.st !== centerTab; });
        settle();
      };
    });
    $('#cpanel .x').onclick = function () { modeCenters(); };
    settle();
  }
  // what every defined, undefined or open center has in common, for the presenter
  var GENERAL = {
    defined: ['Consistent, reliable energy', 'How you affect others', 'Yours to trust and rely on', 'Works best when used correctly, not forced'],
    undefined: ['Inconsistent, variable energy', 'Takes in and amplifies others', 'Where wisdom grows over time', 'Not-Self: acting on borrowed energy as if it were yours'],
    open: ['No fixed energy, fully receptive', 'Reflects the environment back', 'Your greatest potential for wisdom', 'Not-Self: chasing or avoiding what it takes in']
  };
  // N shows or hides the full text under the bullets, as presenter notes
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'e' || e.key === 'E') && mode === 'The Room' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      document.body.classList.toggle('roomedit'); modeRoom(); return;
    }
    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA/.test(e.target.tagName)) document.body.classList.toggle('notes');
  });
  // gate number and name on hover, with the pressure for Head and Root gates
  var tip = document.createElement('div');
  tip.className = 'gtip hide';
  document.body.appendChild(tip);
  bodySvg.addEventListener('mousemove', function (e) {
    var g = e.target.closest ? e.target.closest('.gnum, .leg') : null;
    var n = g && +g.getAttribute('data-gate');
    var name = n && (LIB.gateName || {})[n];
    if (!name || mode !== 'Centers') { tip.className = 'gtip hide'; return; }
    var pr = (LIB.pressure || {})[n], gn = (LIB.gateNote || {})[n];
    tip.innerHTML = '<b>' + n + ': ' + esc(name) + '</b>' +
      (gn ? '<span class="wave">' + esc(gn.k) + (gn.g ? ' · ' + esc(gn.g) : '') + '</span>' : '') +
      (pr ? '<i>' + esc(pr) + '</i>' : '') + (gn && gn.t ? '<i>' + esc(gn.t) + '</i>' : '');
    // show it first at the top left so its full size is known, then keep it on screen:
    // above the pointer when there is no room below, left of it when there is no room right
    tip.style.left = '0px'; tip.style.top = '0px'; tip.className = 'gtip';
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  });
  bodySvg.addEventListener('mouseleave', function () { tip.className = 'gtip hide'; });

  // ---- Channels --------------------------------------------------------------
  function channelCounts() {
    var count = {};
    ROOM.forEach(function (p) { p.channels.forEach(function (c) { (count[c] = count[c] || []).push(p); }); });
    return count;
  }
  function modeChannels() {
    show('body'); resetBody(bodySvg); controls.innerHTML = ''; caption.innerHTML = '';
    focused = {}; hideNames(); say('');
    var count = channelCounts(), max = 1;
    Object.keys(count).forEach(function (k) { max = Math.max(max, count[k].length); });
    // how strongly each channel runs through this room
    $$('.ch', bodySvg).forEach(function (el) {
      var n = (count[el.getAttribute('data-ch')] || []).length;
      el.style.opacity = n ? (0.35 + 0.65 * n / max).toFixed(2) : '0.07';
    });
  }
  function focusChannel(id) {
    focused.channel = id;
    var count = channelCounts(), list = count[id] || [];
    $$('.ch', bodySvg).forEach(function (el) {
      var on = el.getAttribute('data-ch') === id;
      el.classList.toggle('lit', on);
      el.style.opacity = on ? '1' : '0.08';
    });
    var el = $('.ch[data-ch="' + id + '"]', bodySvg), r = el.getBoundingClientRect();
    hideNames();
    var vertical = r.height > r.width;
    list.forEach(function (p, i) {
      var t = (i + 1) / (list.length + 1);
      var x = vertical ? r.left + r.width / 2 + (i % 2 ? 70 : -70) : r.left + r.width * t;
      var y = vertical ? r.top + r.height * t : r.top + r.height / 2 + (i % 2 ? 26 : -26);
      place(p.name, x, y, 'def');
    });
    var L = (LIB.channels || {})[id] || {};
    say('<div class="k">' + list.length + ' in the room</div><h2>' + esc(id + ' ' + (L.name || '')) + '</h2><p>' + esc(L.basic || '') + '</p>');
  }

  // ---- Living Mandala: the moving mandala built alongside this page ----------
  // Kaycee, 2026-09-13: Channels removed for now, and The Sky replaced by the moving mandala.
  function modeMotion() {
    show('motion'); controls.innerHTML = ''; caption.innerHTML = ''; say('');
    ROOM.forEach(function (p) { chip[p.name].className = 'nm gone'; });
    var f = $('#motion iframe');
    if (!f.getAttribute('src')) f.setAttribute('src', 'Living Mandala.html#year&paused');
  }
  // ---- The Sky ----------------------------------------------------------------
  var skyFilter = null;
  function modeSky() {
    show('sky'); controls.innerHTML = ''; caption.innerHTML = ''; say('');
    setTimeout(function () {
      ROOM.forEach(function (p, i) {
        var pt = wheelPoint(skySvg, p.sunLon, D.wheelGeo.rIn - 60 - (i % 3) * 46);
        place(p.name, pt.x, pt.y, '');
      });
      applySky();
    }, 50);
    var groups = [
      ['Type', 'type', TYPE_ORDER.filter(function (t) { return ROOM.some(function (p) { return p.type === t; }); })],
      ['Authority', 'authority', uniq('authority')],
      ['Definition', 'definition', uniq('definition')],
      ['Profile', 'profile', uniq('profile')]
    ];
    controls.innerHTML = '<div class="filters"><button data-f="">Everyone</button>' + groups.map(function (g) {
      return '<span class="lab">' + g[0] + '</span>' + g[2].map(function (v) {
        return '<button data-f="' + g[1] + '|' + esc(v) + '">' + esc(v) + '</button>';
      }).join('');
    }).join('') + '</div>';
    $$('.filters button', controls).forEach(function (b) { b.onclick = function () { skyFilter = b.dataset.f || null; applySky(); }; });
  }
  function uniq(key) { var s = {}; ROOM.forEach(function (p) { s[p[key]] = 1; }); return Object.keys(s).sort(); }
  function applySky() {
    $$('.filters button', controls).forEach(function (b) { b.classList.toggle('on', (b.dataset.f || null) === skyFilter); });
    if (!skyFilter) { ROOM.forEach(function (p) { chip[p.name].classList.remove('dim', 'hi'); }); say(''); return; }
    var kv = skyFilter.split('|'), key = kv[0], val = kv.slice(1).join('|');
    var hits = ROOM.filter(function (p) { return String(p[key]) === val; });
    ROOM.forEach(function (p) {
      var on = String(p[key]) === val;
      chip[p.name].classList.toggle('dim', !on); chip[p.name].classList.toggle('hi', on);
    });
    var text = key === 'type' ? ((LIB.types[norm(val)] || {}).basic || '')
      : key === 'authority' ? (LIB.authority[(hits[0] || {}).authorityKey] || '')
      : key === 'definition' ? (LIB.definition[norm(val)] || '')
      : (LIB.profile[norm(val)] || '');
    say('<div class="k">' + hits.length + ' in the room</div><h2>' + esc(val) + '</h2><p>' + esc(text) + '</p>');
  }

  // ---- Origins: the elements of the bodygraph and where they come from, on Ra's chart --
  var ORIGIN = [
    { el: 'centers', side: 'ol', name: 'Nine Centers', src: 'The Hindu-Brahmin Chakras', text: 'The seven chakras, evolved into nine centers' },
    { el: 'channels', side: 'ol', name: '36 Channels', src: 'The Kabbalah', text: 'The paths of the Tree of Life connect the centers' },
    { el: 'gates', side: 'ol', name: '64 Gates', src: 'The I Ching', text: 'One gate for each hexagram, echoing the 64 codons of DNA' },
    { el: 'lines', side: 'ol', name: 'Six Lines', src: 'The I Ching', text: 'The six lines of every hexagram' },
    { el: 'planets', side: 'orr', name: 'The Planets', src: 'Astrology', text: 'Where the Sun, Moon, Nodes and planets stood' },
    { el: 'sides', side: 'orr', name: 'Design and Personality', src: 'The movement of the Sun', text: 'Personality at birth, Design when the Sun was 88 degrees earlier, about three months before' },
    { el: 'wheel', side: 'orr', name: 'The Wheel', src: 'The Zodiac and the I Ching', text: 'The 64 hexagrams laid around the zodiac' },
    { el: 'story', side: 'orr', name: 'It Started with Sanduleak', src: 'The story', text: 'From Uranus in 1781 to a star that exploded in 1987' }
  ];
  // The story of Human Design, for the Origins page's timeline, from Kaycee's piece
  // "It Started with Sanduleak" (2026-09-14). A third field marks a highlighted moment.
  var STORY = [
    ['March 13, 1781', 'William Herschel discovers Uranus, the first planet found by telescope. Ra marked 1781 as the start of the Cross of Planning and the nine-centered human.'],
    ['August 12, 1831', '{blavatsky|Helena Blavatsky} is born, fifty years into the new era.'],
    ['1875', 'Blavatsky co-founds the Theosophical Society, carrying a cosmology of a humanity still evolving, including channeled teachings of nine-centered beings mutating into eleven centers.'],
    ['April 9, 1948', 'Alan Robert Krakower, later Ra Uru Hu, is born in Montreal.'],
    ['1970 · The Sanduleak detail', 'Astronomer {sanduleak|Nicholas Sanduleak} catalogues a blue supergiant in the Large Magellanic Cloud: Sanduleak -69° 202. Sanduleak was a committed skeptic, co-founder of the Cleveland chapter of the Committee for the Scientific Investigation of Claims of the Paranormal, and author of \u201cThe Moon Is Acquitted of Murder in Cleveland,\u201d debunking the idea that the full Moon drives crime. The star that seeded the transmission carries a skeptic\u2019s name.', true],
    ['January 3, 1987', 'On Ibiza, Ra encounters the Voice. Over eight days and nights the Human Design System is transmitted, including neutrinos as the carrier of conditioning. Ra says neutrinos have mass, while physics still treats them as massless.'],
    ['February 23, 1987', 'Seven weeks later, Sanduleak\u2019s star explodes 168,000 light years away: SN 1987A, the brightest supernova seen from Earth in nearly 400 years, and the largest neutrino burst ever recorded from beyond our solar system.'],
    ['May 7, 1990', 'Nicholas Sanduleak dies of cardiac arrest, three years after his star\u2019s neutrinos reached Earth.'],
    ['2002', 'A Nobel Prize in Physics for detecting cosmic neutrinos, work in which the burst from SN 1987A was central.'],
    ['March 12, 2011', 'Ra Uru Hu dies.'],
    ['2015', 'The Nobel Prize in Physics goes to Takaaki Kajita and Arthur McDonald for neutrino oscillations, the proof that neutrinos have mass, as Ra said in 1987.'],
    ['2027', 'The next threshold.']
  ];
  var originPainted = false;
  function modeOrigins() {
    show('origin'); hideNames(); say(''); caption.innerHTML = '';
    var R = D.ra, layer = $('#origin');
    ['ol', 'orr'].forEach(function (k) {
      $('.ocards.' + k, layer).innerHTML = ORIGIN.filter(function (o) { return o.side === k; }).map(function (o) {
        return '<div class="ocard" data-el="' + o.el + '"><div class="k">' + esc(o.src) + '</div><h3>' + esc(o.name) + '</h3><p>' + esc(o.text) + '</p></div>';
      }).join('');
    });
    // with Ra's own Delphi chart in the folder, that is what sits in the middle,
    // tables and all, and the cards light parts of it
    var frame = null;
    if (D.raChart) {
      layer.classList.add('realchart');
      var ob = $('.obody', layer);
      if (!ob.querySelector('iframe')) ob.innerHTML = '<iframe title="Ra Uru Hu" src="' + esc(D.raChart) + '#origin-view"></iframe>';
      frame = ob.querySelector('iframe');
    }
    $$('.ocard', layer).forEach(function (c) {
      var on = function () {
        layer.className = 'layer hl-' + c.dataset.el + (D.raChart ? ' realchart' : '');
        $$('.ocard', layer).forEach(function (x) { x.classList.toggle('on', x === c); });
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'delphi-stage-hl', el: c.dataset.el }, '*');
      };
      c.onmouseenter = on;
      c.onclick = function () {
        on();
        // 64 Gates pops the sixty-four hexagrams up over the bodygraph; the page
        // underneath does not move, and a click anywhere on the pop-up closes it
        var pic = $('.otrigrams.grid', layer);
        if (pic) pic.hidden = c.dataset.el === 'gates' ? !pic.hidden : true;
        var story = $('.otrigrams.story', layer);
        if (story) story.hidden = c.dataset.el === 'story' ? !story.hidden : true;
      };
    });
    if (!$('.otrigrams.story', layer)) {
      var st = document.createElement('div');
      st.className = 'otrigrams story'; st.hidden = true;
      st.innerHTML = '<div class="obox otl"><button class="ox" aria-label="Close">&times;</button><div class="othead">' + (D.raPhoto ? '<span class="raface"><img src="' + D.raPhoto + '" alt="Ra Uru Hu"></span>' : '') + '<div><div class="k">The Story of Human Design</div><h3>It Started with Sanduleak</h3></div></div><ol>' +
        STORY.map(function (r) {
        // {key|Name} is a person whose chart variations open from their name
        var text = esc(r[1]).replace(/\{(\w+)\|([^}]+)\}/g, function (m, key, name) {
          return (D.figures || []).some(function (f) { return f.key === key; }) ? '<button class="sandname" data-fig="' + key + '">' + name + '</button>' : name;
        });
        return '<li' + (r[2] ? ' class="hl"' : '') + '><b>' + esc(r[0]) + '</b><span>' + text + '</span></li>';
      }).join('') + '</ol></div>';
      st.onclick = function (ev) {
        // his name opens his charts over the timeline; anything else closes it
        var nm = ev.target.closest('.sandname');
        if (nm) { var pop = $('.otrigrams.sand[data-fig="' + nm.dataset.fig + '"]', layer); if (pop) pop.hidden = false; return; }
        st.hidden = true;
      };
      $('.obody', layer).appendChild(st);
    }
    (D.figures || []).forEach(function (S) {
      if ($('.otrigrams.sand[data-fig="' + S.key + '"]', layer)) return;
      var raGates = {};
      (D.ra && D.ra.acts || []).forEach(function (a) { raGates[a.gate] = 1; });
      var GL = { 'Sun': '\u2609', 'Earth': '\u2295', 'North Node': '\u260A', 'South Node': '\u260B', 'Moon': '\u263D', 'Mercury': '\u263F', 'Venus': '\u2640', 'Mars': '\u2642', 'Jupiter': '\u2643', 'Saturn': '\u2644', 'Uranus': '\u2645', 'Neptune': '\u2646', 'Pluto': '\u2647' };
      var col = function (list, cls) {
        return '<div class="scol ' + cls + '">' + list.map(function (a) { return '<div><span>' + (GL[a.planet] || '') + '</span>' + a.gate + '.' + a.line + '</div>'; }).join('') + '</div>';
      };
      var sv = document.createElement('div');
      sv.className = 'otrigrams sand'; sv.hidden = true; sv.setAttribute('data-fig', S.key);
      sv.innerHTML = '<div class="obox sbox"><button class="ox" aria-label="Close">&times;</button>' +
        '<div class="k">Chart variations across the day</div><h3>' + esc(S.name) + '</h3><div class="sborn">' + esc(S.born) + '</div>' +
        '<div class="svars">' + S.variations.map(function (v) {
          var g = {}; v.personality.concat(v.design).forEach(function (a) { g[a.gate] = 1; });
          // electromagnetic with Ra: one gate each, a channel neither has alone
          var em = allChannels().filter(function (ch) {
            var x = ch.gates[0], y = ch.gates[1];
            return (g[x] && !g[y] && raGates[y] && !raGates[x]) || (g[y] && !g[x] && raGates[x] && !raGates[y]);
          }).map(function (ch) { return ch.name.replace(/^The Channel of (the )?/i, '') + ' (' + ch.gates.join('-') + ')'; });
          return '<div class="svar"><div class="stime">' + esc(v.from) + ' to ' + esc(v.to) + '</div>' +
            '<div class="sfacts"><b>' + esc(v.profile.replace(/\s/g, '')) + ' ' + esc(v.type) + '</b><span>' + esc(v.authority) + ' · ' + esc(v.definition.replace(/ Definition$/, '')) + '</span></div>' +
            '<div class="schart">' + col(v.design, 'd') + '<div class="ssvg">' + v.svg + '</div>' + col(v.personality, 'p') + '</div>' +
            '<div class="sem"><div class="k">Electromagnetic with Ra</div>' + (em.length ? esc(em.join(', ')) : 'None') + '</div></div>';
        }).join('') + '</div></div>';
      sv.onclick = function (ev) { ev.stopPropagation(); sv.hidden = true; };
      $('.obody', layer).appendChild(sv);
    });
    if (D.trigrams && !$('.otrigrams.grid', layer)) {
      var pic = document.createElement('div');
      pic.className = 'otrigrams grid'; pic.hidden = true;
      pic.innerHTML = '<div class="obox"><button class="ox" aria-label="Close">&times;</button><img src="' + D.trigrams + '" alt="The Sixty-Four Hexagrams"></div>';
      pic.onclick = function () { pic.hidden = true; };
      $('.obody', layer).appendChild(pic);
    }
    if (D.raChart) return;
    if (!R) { $('.ohead', layer).innerHTML = '<h2>Ra Uru Hu</h2>'; return; }
    $('.ohead', layer).innerHTML = '<h2>Ra Uru Hu</h2><div class="osub">April 9, 1948 · 12:05 AM · Montreal, Quebec</div>' +
      '<div class="osub">' + esc(R.type) + ' · ' + esc(R.profile) + ' · ' + esc(R.authority) + '</div>';
    var ORDER = ['Sun', 'Earth', 'North Node', 'South Node', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
    var table = function (side, title) {
      return '<div class="otable ' + side + '"><div class="oth">' + title + '</div>' + ORDER.map(function (pl) {
        var a = R.acts.filter(function (x) { return x.side === side && x.planet === pl; })[0];
        return a ? '<div class="orow"><span class="gl">' + (GLYPH[pl] || '') + '</span><span class="gt">' + a.gate + '</span><span class="ln">.' + a.line + '</span></div>' : '';
      }).join('') + '</div>';
    };
    $('.otables', layer).innerHTML = table('design', 'Design') + table('personality', 'Personality');
    var svg = $('.osvg svg', layer);
    setTimeout(function () {
      crop(svg, '.cshape, .ch', 16);
      if (originPainted) return;
      originPainted = true;
      var sides = {};
      R.acts.forEach(function (a) { sides[a.gate] = (sides[a.gate] || '') + (a.side === 'design' ? 'd' : 'p'); });
      $$('.leg', svg).forEach(function (leg) {
        var g = leg.getAttribute('data-gate'), sd = sides[g];
        if (!sd) { leg.style.opacity = '0.08'; return; }
        var col = sd.indexOf('p') > -1 ? '#2f2a33' : '#e06666';
        $$(':scope > path, :scope > rect, :scope > polygon, :scope > g[clip-path] > g > rect:not(.beam)', leg).forEach(function (sh) {
          sh.style.fill = col; sh.style.fillOpacity = '1';
          if (sd.indexOf('p') > -1 && sd.indexOf('d') > -1) { sh.style.stroke = '#e06666'; sh.style.strokeWidth = '2'; }
        });
      });
      $$('.gnum', svg).forEach(function (t) {
        var sd = sides[t.getAttribute('data-gate')];
        if (sd) { t.classList.add('on'); t.style.fontWeight = '700'; t.style.fill = sd.indexOf('p') > -1 ? '#2f2a33' : '#e06666'; }
      });
      $$('.ch', svg).forEach(function (ch) {
        var ids = ch.getAttribute('data-ch').split('-');
        if (sides[ids[0]] && sides[ids[1]]) ch.classList.add('lit');
      });
      $$('.cshape', svg).forEach(function (c) {
        if ((R.defined || []).indexOf(c.getAttribute('data-center')) < 0) c.style.fill = '#ffffff';
      });
    }, 60);
  }

  // ---- The Room: who is here, at a glance, while everyone settles in -------------
  function modeRoom() {
    show('room'); hideNames(); say(''); caption.innerHTML = '';
    var pct = function (n) { return ROOM.length ? Math.round(n / ROOM.length * 100) : 0; };
    var card = function (title, keys, keyOf) {
      var count = {};
      ROOM.forEach(function (p) { var k = keyOf(p); if (k) count[k] = (count[k] || 0) + 1; });
      var list = (keys || Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })).filter(function (k) { return count[k]; });
      var max = Math.max.apply(null, list.map(function (k) { return count[k]; }).concat([1]));
      return '<div class="rcard"><div class="k">' + title + '</div>' + list.map(function (k) {
        return '<div class="rrow"><span>' + esc(k) + '</span><div class="rtrack"><i style="width:' + (count[k] / max * 100) + '%"></i></div><b>' + count[k] + '</b><em>' + pct(count[k]) + '%</em></div>';
      }).join('') + '</div>';
    };
    var DEF_ORDER = ['Single', 'Simple Split', 'Wide Split', 'Triple Split', 'Quadruple Split', 'No Definition'];
    var editing = document.body.classList.contains('roomedit');
    var namesHtml = editing
      ? D.room.map(function (p) {
          var e = EDITS[editKey(p)] || {};
          return '<span class="redit' + (e.hidden ? ' off' : '') + '" data-k="' + esc(editKey(p)) + '"><input value="' + esc(p.name) + '" aria-label="Name on screen">' +
            '<button class="rhide">' + (e.hidden ? 'Show' : 'Hide') + '</button></span>';
        }).join('') + '<button class="rdone">Done</button>'
      : ROOM.map(function (p, i) { return '<span style="animation-delay:' + (i * 40) + 'ms">' + esc(p.name) + '</span>'; }).join('');
    $('#room').innerHTML = '<div class="rhead"><div class="rnum">' + ROOM.length + '</div><div class="rsub">in the room</div></div>' +
      '<div class="rnames">' + namesHtml + '</div>' +
      '<div class="rgrid">' +
        card('Type', TYPE_ORDER, function (p) { return p.type; }) +
        card('Authority', null, function (p) { return p.authority; }) +
        card('Definition', DEF_ORDER, function (p) { return p.definition; }) +
        card('Profile', null, function (p) { return p.profile; }) +
      '</div>';
    if (!editing) return;
    $$('#room .redit').forEach(function (row) {
      var k = row.dataset.k;
      row.querySelector('input').onchange = function (ev) {
        var v = ev.target.value.trim(), p = D.room.filter(function (x) { return editKey(x) === k; })[0];
        EDITS[k] = EDITS[k] || {};
        if (!v || v === p.origName) delete EDITS[k].name; else EDITS[k].name = v;
        saveEdits();
      };
      row.querySelector('.rhide').onclick = function () {
        EDITS[k] = EDITS[k] || {};
        EDITS[k].hidden = !EDITS[k].hidden;
        saveEdits();
        row.classList.toggle('off', EDITS[k].hidden);
        this.textContent = EDITS[k].hidden ? 'Show' : 'Hide';
      };
    });
    // the room is drawn once from these names, so a fresh start picks the edits up
    $('#room .rdone').onclick = function () { location.reload(); };
  }

  // ---- Profile ----------------------------------------------------------------------
  // Hexagram 25 drawn in Delphi's colours, its six lines named, beside the room's
  // profiles. Kaycee, 2026-09-14. Line 1 is at the bottom, as a hexagram is read.
  var LINES = [
    { n: 1, name: 'Investigator', theme: 'Foundation', yang: true },
    { n: 2, name: 'Hermit', theme: 'Natural talent, called out', yang: false },
    { n: 3, name: 'Martyr', theme: 'Trial and error', yang: false },
    { n: 4, name: 'Opportunist', theme: 'Network and friendship', yang: true },
    { n: 5, name: 'Heretic', theme: 'Projection and practical solutions', yang: true },
    { n: 6, name: 'Role Model', theme: 'Wisdom lived through', yang: true }
  ];
  var PROFILE_ORDER = ['1/3', '1/4', '2/4', '2/5', '3/5', '3/6', '4/6', '4/1', '5/1', '5/2', '6/2', '6/3'];
  function hexagramSvg() {
    var W = 660, rowH = 78, top = 70, barX = 150, barW = 230, gap = 34, H = top + rowH * 6 + 40;
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Montserrat, sans-serif">' +
      '<text x="' + (barX + barW / 2) + '" y="28" text-anchor="middle" font-size="15" letter-spacing="5" fill="#845095">HEXAGRAM 25</text>' +
      '<text x="' + (barX + barW / 2) + '" y="52" text-anchor="middle" font-size="22" font-weight="600" fill="#1c1a2e">' + esc((LIB.gateName || {})[25] || 'Innocence') + '</text>';
    LINES.slice().reverse().forEach(function (l, i) {
      var y = top + i * rowH + 20, h = 26;
      out += '<g class="hline" data-line="' + l.n + '">' +
        '<rect x="0" y="' + (y - 22) + '" width="' + W + '" height="' + rowH + '" fill="transparent"></rect>' +
        // the line as it is written, 25.1 to 25.6, the gate number a little smaller
        '<rect x="' + (barX - 82) + '" y="' + (y + h / 2 - 19) + '" width="64" height="38" rx="19" class="hnum"></rect>' +
        '<text x="' + (barX - 50) + '" y="' + (y + h / 2 + 6) + '" text-anchor="middle" class="hnumt"><tspan font-size="12" font-weight="500" class="hgate">25.</tspan><tspan font-size="17" font-weight="600">' + l.n + '</tspan></text>' +
        (l.yang
          ? '<rect x="' + barX + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="5" class="hbar"></rect>'
          : '<rect x="' + barX + '" y="' + y + '" width="' + (barW - gap) / 2 + '" height="' + h + '" rx="5" class="hbar"></rect>' +
            '<rect x="' + (barX + (barW + gap) / 2) + '" y="' + y + '" width="' + (barW - gap) / 2 + '" height="' + h + '" rx="5" class="hbar"></rect>') +
        '<text x="' + (barX + barW + 22) + '" y="' + (y + 11) + '" font-size="16" font-weight="600" fill="#1c1a2e">' + esc(l.name) + '</text>' +
        '<text x="' + (barX + barW + 22) + '" y="' + (y + 30) + '" font-size="12.5" fill="#6b6478">' + esc(l.theme) + '</text></g>';
    });
    // the two trigrams
    var mid = top + rowH * 3 + 7;
    out += '<line x1="' + (barX - 10) + '" y1="' + mid + '" x2="' + (barX + barW + 10) + '" y2="' + mid + '" stroke="#c9b6e4" stroke-dasharray="4 5"></line>' +
      '<text x="20" y="' + (top + rowH * 1.5 + 30) + '" font-size="10.5" letter-spacing="2" fill="#9a93a8" transform="rotate(-90 20 ' + (top + rowH * 1.5 + 30) + ')" text-anchor="middle">TRANSPERSONAL</text>' +
      '<text x="20" y="' + (top + rowH * 4.5 + 30) + '" font-size="10.5" letter-spacing="2" fill="#9a93a8" transform="rotate(-90 20 ' + (top + rowH * 4.5 + 30) + ')" text-anchor="middle">PERSONAL</text>';
    return out + '</svg>';
  }
  function modeProfile() {
    show('profiles'); hideNames(); say(''); caption.innerHTML = '';
    var host = $('#profiles');
    var present = PROFILE_ORDER.filter(function (k) { return ROOM.some(function (p) { return p.profile === k; }); });
    host.innerHTML = '<div class="pgrid2"><div class="hexbox">' + hexagramSvg() + '</div><div class="pcards">' + present.map(function (k) {
      var list = ROOM.filter(function (p) { return p.profile === k; }), pct = ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0;
      var a = +k.split('/')[0], b = +k.split('/')[1];
      return '<div class="pcard" data-k="' + k + '"><div class="phd"><b>' + k + '</b><span>' + list.length + ' · ' + pct + '%</span></div>' +
        '<div class="pnm">' + esc(LINES[a - 1].name + ' ' + LINES[b - 1].name) + '</div>' +
        '<div class="dnames">' + list.map(function (p) { return '<span class="nm-open" data-person="' + esc(p.name) + '">' + esc(p.name) + '</span>'; }).join('') + '</div></div>';
    }).join('') + '</div></div>';
    var svg = $('.hexbox svg', host);
    var light = function (a, b) {
      $$('.hline', svg).forEach(function (g) {
        var n = +g.getAttribute('data-line');
        g.classList.toggle('pers', n === a); g.classList.toggle('des', n === b && n !== a);
        g.classList.toggle('dim', !!a && n !== a && n !== b);
      });
    };
    // clicking the same line or card again, or anywhere empty, clears the selection
    var clearProfile = function () {
      $$('.pcard', host).forEach(function (x) { x.classList.remove('on'); });
      light(0, 0); say('');
    };
    host.onclick = function (ev) { if (!ev.target.closest('.pcard, .hline, .nm-open')) clearProfile(); };
    $$('.pcard', host).forEach(function (card) {
      card.onclick = function (ev) {
        if (ev.target.closest('.nm-open')) return;
        // a second click on the same card lets it go
        if (card.classList.contains('on')) { clearProfile(); return; }
        var k = card.dataset.k, a = +k.split('/')[0], b = +k.split('/')[1];
        var list = ROOM.filter(function (p) { return p.profile === k; });
        $$('.pcard', host).forEach(function (x) { x.classList.toggle('on', x === card); });
        light(a, b);
        say('<div class="k">' + list.length + ' in the room · ' + (ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0) + '%</div><h2>' + k + ' ' + esc(LINES[a - 1].name + ' ' + LINES[b - 1].name) + '</h2>' +
          '<ul class="bul"><li><b style="color:#845095">' + a + '</b> Personality, conscious: ' + esc(LINES[a - 1].name) + ', ' + esc(LINES[a - 1].theme.toLowerCase()) + '</li>' +
          '<li><b style="color:#e06666">' + b + '</b> Design, unconscious: ' + esc(LINES[b - 1].name) + ', ' + esc(LINES[b - 1].theme.toLowerCase()) + '</li></ul>' +
          '<p class="pnote">' + esc(LIB.profile[norm(k)] || '') + '</p>');
      };
    });
    $$('.hline', svg).forEach(function (g) {
      g.onclick = function (ev) {
        ev.stopPropagation();
        var n = +g.getAttribute('data-line'), l = LINES[n - 1];
        if (g.classList.contains('pers') && !$('.pcard.on', host)) { clearProfile(); return; }
        $$('.pcard', host).forEach(function (x) { x.classList.remove('on'); });
        light(n, n);
        say('<div class="k">Line ' + n + '</div><h2>' + esc(l.name) + '</h2><ul class="bul"><li>' + esc(l.theme) + '</li><li>' + (n <= 3 ? 'Personal: the lower trigram' : 'Transpersonal: the upper trigram') + '</li></ul>' +
          '<p class="pnote">' + esc((LIB.line || {})[String(n)] || '') + '</p>');
      };
    });
  }

  // ---- Authority --------------------------------------------------------------------
  // in the order of the hierarchy; bullets distilled from her Delphi Basic, full text in the N notes
  var AUTH = [
    { key: 'emotional', name: 'Emotional', center: 'Solar Plexus', bullets: ['Defined Solar Plexus', 'Clarity comes over time, riding the wave', 'No truth in the now', 'Wait out the highs and lows'] },
    { key: 'sacral', name: 'Sacral', center: 'Sacral', bullets: ['Defined Sacral, Solar Plexus not defined', 'A gut response in the moment', 'Uh-huh or uhn-un', 'Hesitation means not yet'] },
    { key: 'splenic', name: 'Splenic', center: 'Spleen', bullets: ['Defined Spleen, no Solar Plexus or Sacral', 'An instant knowing in the moment', 'Quiet, and it does not repeat', 'Trust it without second-guessing'] },
    { key: 'egomanifested', name: 'Ego Manifested', center: 'Heart', bullets: ['Heart connected to the Throat', 'Truth in what you say in the moment', 'Trust your voice, do not script it', 'Manifestors only'] },
    { key: 'egoprojected', name: 'Ego Projected', center: 'Heart', bullets: ['Heart connected to the G Center', 'Wait for the invitation', 'Put your own desires first', 'Balance work and rest'] },
    { key: 'selfprojected', name: 'Self Projected', center: 'G Center', bullets: ['G Center connected to the Throat', 'Listen to what you say', 'Truth expressed through identity', 'Talk it through with others'] },
    { key: 'environmentmentalprojectors', name: 'Environment', center: 'Mental Projectors', bullets: ['No inner authority below the Throat', 'Senses the right environment', 'Talk it out with trusted advisers', 'Your own insight over their opinions'] },
    { key: 'lunarauthority', name: 'Lunar', center: 'Reflectors', bullets: ['No defined centers', 'A full lunar cycle before big decisions', 'Environment matters most', 'Trusted advisers help articulate'] }
  ];
  function modeAuthority() {
    show('auths'); hideNames(); say(''); caption.innerHTML = '';
    var byKey = function (a) { return ROOM.filter(function (p) { return norm(p.authorityKey || p.authority) === a.key || p.authorityKey === a.key; }); };
    var present = AUTH.filter(function (a) { return byKey(a).length; });
    var host = $('#auths');
    host.innerHTML = '<div class="dcols">' + present.map(function (a) {
      var list = byKey(a), pct = ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0;
      return '<div class="dcol" data-a="' + a.key + '"><div class="acenter">' + esc(a.center) + '</div>' +
        '<h3>' + esc(a.name) + '</h3><div class="dcount">' + list.length + ' · ' + pct + '%</div>' +
        '<div class="dnames">' + list.map(function (p) { return '<span class="nm-open" data-person="' + esc(p.name) + '">' + esc(p.name) + '</span>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
    $$('#auths .dcol').forEach(function (col) {
      col.onclick = function (ev) {
        if (ev.target.closest('.nm-open')) return;
        var a = AUTH.filter(function (x) { return x.key === col.dataset.a; })[0], list = byKey(a);
        $$('#auths .dcol').forEach(function (x) { x.classList.toggle('on', x === col); });
        say('<div class="k">' + list.length + ' in the room · ' + (ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0) + '%</div><h2>' + esc(a.name) + '</h2>' +
          '<ul class="bul">' + a.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
          '<p class="pnote">' + esc(LIB.authority[a.key] || '') + '</p>');
      };
    });
  }

  // ---- Definition ------------------------------------------------------------------
  // presentation bullets per definition, distilled from her Delphi Basic; the full text is in the N notes
  var DEF_BULLETS = {
    'Single': ['All defined centers connected as one', 'An inherent sense of wholeness', 'Stable, reliable inner guidance', 'Open centers become wisdom with awareness'],
    'Simple Split': ['Two areas joined by a single bridging gate', 'Feels like something is missing', 'That missing gate shapes the conditioning', 'Seeks what seems absent'],
    'Wide Split': ['Two areas a channel or more apart', 'Takes a full channel or more to bridge', 'Tends to see the problem in others', 'Conditioned by those who connect it'],
    'Triple Split': ['Three autonomous areas, each with its own agenda', 'Integrates best in public, around many auras', 'Open centers condition strongly', 'Patience and processing before acting'],
    'Quadruple Split': ['Four distinct areas of definition, rare', 'A fixed, focused flow that resists intrusion', 'Many connections bridge its areas', 'Clarity comes gradually'],
    'No Definition': ['No defined centers', 'No fixed inner authority', 'Flexibility and trust in what unfolds', 'Insight emerges over time']
  };
  var DEF_ISLANDS = { 'Single': 1, 'Simple Split': 2, 'Wide Split': 2, 'Triple Split': 3, 'Quadruple Split': 4, 'No Definition': 0 };
  function modeDefinition() {
    show('defs'); hideNames(); say(''); caption.innerHTML = '';
    var order = ['Single', 'Simple Split', 'Wide Split', 'Triple Split', 'Quadruple Split', 'No Definition'];
    var present = order.filter(function (d) { return ROOM.some(function (p) { return p.definition === d; }); });
    var host = $('#defs');
    host.innerHTML = '<div class="dcols">' + present.map(function (d) {
      var list = ROOM.filter(function (p) { return p.definition === d; });
      var pct = ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0;
      var dots = '';
      for (var i = 0; i < DEF_ISLANDS[d]; i++) dots += '<i class="' + (d === 'Wide Split' && i === 1 ? 'far' : '') + '"></i>';
      if (!DEF_ISLANDS[d]) dots = '<i class="none"></i>';
      return '<div class="dcol" data-d="' + esc(d) + '"><div class="islands' + (d === 'Wide Split' ? ' wide' : '') + '">' + dots + '</div>' +
        '<h3>' + esc(d) + '</h3><div class="dcount">' + list.length + ' · ' + pct + '%</div>' +
        '<div class="dnames">' + list.map(function (p) { return '<span class="nm-open" data-person="' + esc(p.name) + '">' + esc(p.name) + '</span>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
    $$('#defs .dcol').forEach(function (col) {
      col.onclick = function (ev) {
        if (ev.target.closest('.nm-open')) return;
        var d = col.dataset.d, list = ROOM.filter(function (p) { return p.definition === d; });
        $$('#defs .dcol').forEach(function (x) { x.classList.toggle('on', x === col); });
        say('<div class="k">' + list.length + ' in the room · ' + (ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0) + '%</div><h2>' + esc(d) + '</h2>' +
          '<ul class="bul">' + (DEF_BULLETS[d] || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
          '<p class="pnote">' + esc(LIB.definition[norm(d)] || '') + '</p>');
      };
    });
  }

  // ---- Auras --------------------------------------------------------------------
  // presentation bullets per Type, distilled from her Delphi Basic; the full text is in the N notes
  var TYPE_BULLETS = {
    'Generator': ['Defined Sacral, with no motor connected to the Throat', 'Open, enveloping aura', 'Sustainable life-force energy', 'Draws questions and opportunities', 'Masters work step by step'],
    'Manifesting Generator': ['Defined Sacral, with a motor connected to the Throat', 'Magnetic, enveloping aura', 'Moves quickly from response to action', 'The gift of efficiency', 'Finds the essential steps'],
    'Projector': ['Undefined Sacral, with no motor connected to the Throat', 'Focused, penetrating aura', 'Sees the bigger picture', 'Guides through insightful questions', 'Thrives with rest and selective engagement'],
    'Manifestor': ['Undefined Sacral, with a motor connected to the Throat', 'Closed, repelling aura', 'Here to initiate and impact', 'Independent and self-contained', 'Informing creates peace'],
    'Reflector': ['No defined centers', 'Resistant, sampling aura', 'Mirrors the environment', 'Senses the health of a community', 'Lunar rhythm for big decisions']
  };
  function modeAuras() {
    show('auras'); controls.innerHTML = ''; caption.innerHTML = ''; say('');
    var host = $('#auras'); host.innerHTML = '';
    var present = TYPE_ORDER.filter(function (t) { return ROOM.some(function (p) { return p.type === t; }); });
    var W = window.innerWidth, H = window.innerHeight;
    present.forEach(function (t, i) {
      var list = ROOM.filter(function (p) { return p.type === t; });
      var x = W * (i + 0.5) / present.length, y = H * 0.52;
      var size = Math.min(W / present.length * 0.95, H * 0.66, 240 + 90 * Math.sqrt(list.length));
      var a = document.createElement('div');
      a.className = 'aura ' + AURA[t];
      a.style.left = x + 'px'; a.style.top = (y - 62) + 'px'; a.style.width = size + 'px'; a.style.height = size + 'px';
      var pct = ROOM.length ? Math.round(list.length / ROOM.length * 100) : 0;
      a.innerHTML = '<div class="glow"></div><div class="t">' + esc(t) + '<small>' + list.length + ' · ' + pct + '%</small></div>';
      a.style.cursor = 'pointer';
      a.onclick = function () {
        var L = LIB.types[norm(t)] || {};
        say('<div class="k">' + list.length + ' in the room · ' + pct + '%</div><h2>' + esc(t) + '</h2>' +
          '<ul class="bul">' + (TYPE_BULLETS[t] || []).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
          '<div class="facts">' + [['Strategy', L.strategyName], ['Signature', L.signature], ['Not-Self Theme', L.notSelf]].filter(function (f) { return f[1]; })
            .map(function (f) { return '<div><span>' + f[0] + '</span>' + esc(f[1]) + '</div>'; }).join('') + '</div>' +
          '<p class="pnote">' + esc(L.basic || '') + '</p><p class="pnote">' + esc(L.strategy || '') + '</p>');
      };
      host.appendChild(a);
      list.forEach(function (p, k) {
        // stacked down the middle of the aura, so long names never collide
        var rows = list.length, gap = Math.min(34, size * 0.7 / Math.max(1, rows));
        // the aura layer starts below the bar, so its centre on screen is y
        place(p.name, x, y + (k - (rows - 1) / 2) * gap, '');
      });
    });
    ROOM.forEach(function (p) { if (!present.some(function (t) { return t === p.type; })) chip[p.name].className = 'nm gone'; });
  }

  // ---- Build a Chart -------------------------------------------------------------
  var buildTimer = null;
  function picker(onPick, multi, extras) {
    var pool = ROOM.concat(extras || []);
    controls.innerHTML = '<div class="pickrow">' + pool.map(function (p) {
      return '<button data-p="' + esc(p.name) + '"' + (p.isSky ? ' class="sky"' : '') + '>' + esc(p.label || p.name) + '</button>';
    }).join('') + '</div>';
    var chosen = [];
    $$('.pickrow button', controls).forEach(function (b) {
      b.onclick = function () {
        if (multi) {
          var i = chosen.indexOf(b.dataset.p);
          if (i > -1) chosen.splice(i, 1); else { chosen.push(b.dataset.p); if (chosen.length > 2) chosen.shift(); }
        } else chosen = [b.dataset.p];
        $$('.pickrow button', controls).forEach(function (x) { x.classList.toggle('on', chosen.indexOf(x.dataset.p) > -1); });
        onPick(chosen.map(function (n) { return pool.filter(function (p) { return p.name === n; })[0]; }));
      };
    });
  }
  // Build a Chart: the person's own chart, opened on The Wheel with the placement
  // tables beside it, building design side first (the chart page runs it).
  function modeBuild() {
    show('buildchart'); hideNames(); say(''); caption.innerHTML = '';
    var host = $('#buildchart');
    host.classList.remove('hide'); host.innerHTML = '';
    picker(function (ps) {
      var p = ps[0];
      if (!p || !p.chartFile) { host.innerHTML = ''; return; }
      host.innerHTML = '<iframe title="' + esc(p.name) + '" src="' + esc(p.chartFile) + '#stage-build&n=' + encodeURIComponent(p.name) + '" style="width:100%;height:100%;border:0;display:block"></iframe>';
    });
  }
  function blankBuild() {
    resetBody(bbodySvg);
    bbodySvg.parentNode.classList.add('quiet');
    $$('.leg', bbodySvg).forEach(function (el) { el.style.opacity = '0.06'; });
    $$('.arrow', bbodySvg).forEach(function (el) { el.style.opacity = '0'; });
    $$('.cshape', bbodySvg).forEach(function (el) { el.style.fill = '#ffffff'; });
    $$('.planet', bwheelSvg).forEach(function (el) { el.remove(); });
  }
  function buildChart(p) {
    clearInterval(buildTimer);
    blankBuild();
    var acts = p.acts.slice(), i = 0, active = {};
    var NS = 'http://www.w3.org/2000/svg';
    buildTimer = setInterval(function () {
      if (i >= acts.length) {
        clearInterval(buildTimer);
        caption.innerHTML = esc(p.name) + '<small>' + esc(p.type) + ' · ' + esc(p.profile) + ' · ' + esc(p.definition) + '</small>';
        return;
      }
      var a = acts[i++], design = a.side === 'design';
      if (design && acts[i - 2] && acts[i - 2].side !== 'design') caption.innerHTML = 'Design<small>about 88 days before birth</small>';
      else if (i === 1) caption.innerHTML = 'Personality<small>the moment of birth</small>';
      // on the wheel
      var r = D.wheelGeo.rIn - (design ? 150 : 70);
      var pt = wheelPoint(bwheelSvg, a.lon, r);
      var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'planet');
      var col = design ? '#e06666' : '#1c1a2e';
      g.innerHTML = '<circle cx="' + pt.sx + '" cy="' + pt.sy + '" r="17" fill="' + col + '"></circle>' +
        '<text x="' + pt.sx + '" y="' + (pt.sy + 6) + '" text-anchor="middle" font-size="18" fill="#fff">' + (GLYPH[a.planet] || '') + '</text>';
      bwheelSvg.appendChild(g);
      // into the bodygraph
      active[a.gate] = true;
      $$('.leg[data-gate="' + a.gate + '"]', bbodySvg).forEach(function (el) { el.style.opacity = '1'; });
      $$('.gnum[data-gate="' + a.gate + '"]', bbodySvg).forEach(function (el) { el.style.fill = col; el.style.fontWeight = '700'; });
      $$('.ch', bbodySvg).forEach(function (el) {
        var ids = el.getAttribute('data-ch').split('-');
        if (active[ids[0]] && active[ids[1]]) {
          el.classList.add('lit');
          $$('.arrow', el.parentNode).forEach(function (ar) { if (ar.getAttribute('data-g1') == ids[0] || ar.getAttribute('data-g2') == ids[1]) ar.style.opacity = '1'; });
        }
      });
      // a centre fills once a channel reaches it, as it does in the chart
      D.centerOrder.forEach(function (c) {
        if (p.centers[c] !== 'defined') return;
        var any = p.channels.some(function (ch) { var ids = ch.split('-'); return active[ids[0]] && active[ids[1]] && gatesIn(c, ids); });
        if (any) $$('.cshape[data-center="' + c + '"]', bbodySvg).forEach(function (el) { el.style.fill = '#c9b6e4'; });
      });
      caption.innerHTML = caption.innerHTML.split('<small>')[0] + '<small>' + (design ? 'Design ' : 'Personality ') + esc(a.planet) + ' · ' + a.gate + '.' + a.line + '</small>';
    }, 420);
  }
  var CENTER_GATES = {
    head: [64, 61, 63], ajna: [47, 24, 4, 17, 43, 11], throat: [62, 23, 56, 35, 12, 45, 33, 8, 31, 20, 16],
    g: [7, 1, 13, 10, 15, 2, 46, 25], heart: [21, 40, 26, 51], spleen: [48, 57, 44, 50, 32, 28, 18],
    'solar-plexus': [6, 37, 22, 36, 30, 55, 49], sacral: [5, 14, 29, 59, 9, 3, 42, 27, 34], root: [53, 60, 52, 19, 39, 41, 58, 38, 54]
  };
  function gatesIn(c, ids) { return CENTER_GATES[c].indexOf(+ids[0]) > -1 || CENTER_GATES[c].indexOf(+ids[1]) > -1; }

  // ---- Conditioning ----------------------------------------------------------------
  // Conditioning: the first person's own chart in its Relationship view, with the
  // pair worked out here from both real charts, offline, for any two people.
  var PAIR_NAME = { head: 'Head Center', ajna: 'Ajna Center', throat: 'Throat Center', g: 'G Center', heart: 'Heart Center',
    spleen: 'Splenic Center', 'solar-plexus': 'Solar Plexus Center', sacral: 'Sacral Center', root: 'Root Center' };
  var KNOWN_CHANNELS = null;
  function allChannels() {
    if (KNOWN_CHANNELS) return KNOWN_CHANNELS;
    KNOWN_CHANNELS = Object.keys(LIB.channels || {}).map(function (id) {
      var g = id.split('-').map(Number);
      return { id: id, gates: g, name: (LIB.channels[id] || {}).name || id };
    });
    return KNOWN_CHANNELS;
  }
  function centerOfGate(g) {
    for (var c in CENTER_GATES) if (CENTER_GATES[c].indexOf(g) > -1) return c;
    return null;
  }
  function side(p) {
    var pl = function (s) { return p.acts.filter(function (x) { return x.side === s; }).map(function (x) { return { planet: x.planet, gate: x.gate, line: x.line }; }); };
    var def = D.centerOrder.filter(function (c) { return p.centers[c] === 'defined'; });
    return { name: p.name, type: p.type, strategy: p.strategy, authority: p.authority, profile: p.profile, definition: p.definition,
      incarnationCross: p.cross, signature: p.signature, notSelfTheme: p.notSelf,
      definedCenters: def.map(function (c) { return PAIR_NAME[c]; }),
      openCenters: D.centerOrder.filter(function (c) { return def.indexOf(c) < 0; }).map(function (c) { return PAIR_NAME[c]; }),
      channels: p.channels.slice(), gates: p.gates.slice(), personality: pl('personality'), design: pl('design') };
  }
  function pairOf(A, B) {
    var ga = {}, gb = {};
    A.gates.forEach(function (g) { ga[g] = 1; }); B.gates.forEach(function (g) { gb[g] = 1; });
    var channels = [], defined = {}, links = [];
    allChannels().forEach(function (ch) {
      var x = ch.gates[0], y = ch.gates[1];
      var aFull = ga[x] && ga[y], bFull = gb[x] && gb[y];
      var union = (ga[x] || gb[x]) && (ga[y] || gb[y]);
      if (!union) return;
      var aAny = ga[x] || ga[y], bAny = gb[x] || gb[y], kind;
      if (aFull && bFull) kind = 'companionship';
      else if (aFull || bFull) kind = (aFull ? bAny : aAny) ? 'compromise' : 'dominance';
      else kind = 'electromagnetic';
      channels.push({ kind: kind, label: 'Channel of ' + ch.name + ' (' + x + '-' + y + ')', name: ch.name, gates: [x, y] });
      var c1 = centerOfGate(x), c2 = centerOfGate(y);
      if (c1 && c2) { defined[c1] = 1; defined[c2] = 1; links.push([c1, c2]); }
    });
    // islands: defined centers joined by a completed channel
    var parent = {};
    var find = function (c) { while (parent[c] !== c) c = parent[c]; return c; };
    Object.keys(defined).forEach(function (c) { parent[c] = c; });
    links.forEach(function (l) { parent[find(l[0])] = find(l[1]); });
    var roots = {}; Object.keys(defined).forEach(function (c) { roots[find(c)] = 1; });
    var n = Object.keys(roots).length;
    var label = ['No Definition', 'Single Definition', 'Split Definition', 'Triple Split Definition', 'Quadruple Split Definition'][n] || 'Split Definition';
    return { a: side(A), b: side(B),
      definedTogether: D.centerOrder.filter(function (c) { return defined[c]; }).map(function (c) { return PAIR_NAME[c]; }),
      openTogether: D.centerOrder.filter(function (c) { return !defined[c]; }).map(function (c) { return PAIR_NAME[c]; }),
      definitionLabel: label, channels: channels };
  }
  var pendingPair = null, pendingPanels = {};
  window.addEventListener('message', function (ev) {
    var m = ev.data || {};
    if (m.type === 'delphi-stage-ready' && pendingPair && ev.source) ev.source.postMessage({ type: 'delphi-stage-pair', conn: pendingPair, panelA: pendingPanels.a, panelB: pendingPanels.b, newCenters: pendingPanels.newCenters }, '*');
  });
  // The day's sky as a stand-in for a person, so a chart can be read under transit
  // the same way as with another person (Kaycee, 2026-09-13).
  var SKY = null;
  function skyPerson() {
    if (SKY || !D.sky || !D.sky.positions || !D.sky.positions.length) return SKY;
    var gates = [];
    D.sky.positions.forEach(function (x) { if (gates.indexOf(x.gate) < 0) gates.push(x.gate); });
    var have = {}; gates.forEach(function (g) { have[g] = 1; });
    var channels = [], defined = {}, parent = {};
    var find = function (c) { while (parent[c] !== c) c = parent[c]; return c; };
    allChannels().forEach(function (ch) {
      if (!have[ch.gates[0]] || !have[ch.gates[1]]) return;
      channels.push(ch.id);
      var c1 = centerOfGate(ch.gates[0]), c2 = centerOfGate(ch.gates[1]);
      defined[c1] = defined[c2] = 1;
      if (!parent[c1]) parent[c1] = c1; if (!parent[c2]) parent[c2] = c2;
      parent[find(c1)] = find(c2);
    });
    var roots = {}; Object.keys(parent).forEach(function (c) { roots[find(c)] = 1; });
    var n = Object.keys(roots).length;
    var centers = {};
    D.centerOrder.forEach(function (c) { centers[c] = defined[c] ? 'defined' : CENTER_GATES[c].some(function (g) { return have[g]; }) ? 'undefined' : 'open'; });
    var d = new Date(D.sky.date + 'T12:00:00');
    SKY = { name: 'Sky', isSky: true, label: 'Sky \u00b7 ' + d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      acts: D.sky.positions.map(function (x) { return { side: 'personality', planet: x.planet, gate: x.gate, line: x.line }; }),
      gates: gates.sort(function (a, b) { return a - b; }), channels: channels, centers: centers,
      definition: ['No Definition', 'Single', 'Simple Split', 'Triple Split', 'Quadruple Split'][n] || 'Split',
      type: 'Transit', strategy: '', authority: '', profile: '', cross: '', signature: '', notSelf: '' };
    return SKY;
  }
  function modeConditioning() {
    show('buildchart', true); hideNames(); say(''); caption.innerHTML = '';
    var host = $('#buildchart'); host.innerHTML = '';
    caption.innerHTML = 'Choose two people';
    picker(function (ps) {
      if (ps.length < 2) { host.innerHTML = ''; pendingPair = null; say(''); document.body.classList.remove('pairnote'); caption.innerHTML = ps[0] ? esc(ps[0].name) + '<small>and one more</small>' : 'Choose two people'; return; }
      caption.innerHTML = '';
      var A = ps[0], B = ps[1];
      // the chart on screen is always a person's; the sky is the one layered on
      if (A.isSky) { var t = A; A = B; B = t; }
      if (!A.chartFile) { host.innerHTML = ''; return; }
      pendingPair = pairOf(A, B);
      // who conditions whom, center by center, as before
      var aOn = [], bOn = [], both = [], made = [], madeKeys = [];
      var together = {}; pendingPair.definedTogether.forEach(function (n) { together[n] = 1; });
      D.centerOrder.forEach(function (c) {
        var a = A.centers[c] === 'defined', b = B.centers[c] === 'defined';
        if (a && !b) aOn.push(D.centerName[c]); else if (b && !a) bOn.push(D.centerName[c]); else if (a && b) both.push(D.centerName[c]);
        else if (together[PAIR_NAME[c]]) { made.push(D.centerName[c]); madeKeys.push(c); }
      });
      // bridging: a channel completed with the other person's gates that joins two of
      // one person's islands. Pure graph math on the two real charts.
      var islandsOf = function (p) {
        var parent = {}, find = function (c) { while (parent[c] !== c) c = parent[c]; return c; };
        p.channels.forEach(function (id) {
          var g = id.split('-').map(Number), c1 = centerOfGate(g[0]), c2 = centerOfGate(g[1]);
          if (!c1 || !c2) return;
          if (!parent[c1]) parent[c1] = c1; if (!parent[c2]) parent[c2] = c2;
          parent[find(c1)] = find(c2);
        });
        var out = {}; Object.keys(parent).forEach(function (c) { out[c] = find(c); });
        return out;
      };
      var bridges = function (X, Y) {
        var isl = islandsOf(X), roots = {};
        Object.keys(isl).forEach(function (c) { roots[isl[c]] = 1; });
        if (Object.keys(roots).length < 2) return [];
        var gx = {}; X.gates.forEach(function (g) { gx[g] = 1; });
        var gy = {}; Y.gates.forEach(function (g) { gy[g] = 1; });
        // a bridge gate: they already hang one gate of the channel, the other person
        // supplies the missing one, and the channel joins two of their islands
        var byGate = {}, order = [];
        allChannels().forEach(function (ch) {
          var x = ch.gates[0], y = ch.gates[1];
          if (!!gx[x] === !!gx[y]) return;
          var missing = gx[x] ? y : x;
          if (!gy[missing]) return;
          var c1 = centerOfGate(x), c2 = centerOfGate(y);
          if (!isl[c1] || !isl[c2] || isl[c1] === isl[c2]) return;
          if (!byGate[missing]) { byGate[missing] = []; order.push(missing); }
          byGate[missing].push(x + '-' + y);
        });
        return order.map(function (g) { return g + ' (' + byGate[g].join(', ') + ')'; });
      };
      // a wide split: the islands are a channel or more apart, so bridging takes whole
      // channels. Shortest route between two islands over channels the pair completes.
      var wideBridges = function (X, Y) {
        var isl = islandsOf(X), roots = {};
        Object.keys(isl).forEach(function (c) { roots[isl[c]] = 1; });
        var rl = Object.keys(roots);
        if (rl.length < 2) return [];
        var gx = {}; X.gates.forEach(function (g) { gx[g] = 1; });
        var gy = {}; Y.gates.forEach(function (g) { gy[g] = 1; });
        var edges = [];
        allChannels().forEach(function (ch) {
          var x = ch.gates[0], y = ch.gates[1];
          if (!((gx[x] || gy[x]) && (gx[y] || gy[y]))) return;
          var c1 = centerOfGate(x), c2 = centerOfGate(y);
          if (!c1 || !c2) return;
          edges.push({ a: c1, b: c2, id: x + '-' + y, own: !!(gx[x] && gx[y]), give: [x, y].filter(function (g) { return !gx[g]; }) });
        });
        var used = {}, out = [];
        for (var i = 0; i < rl.length; i++) for (var j = i + 1; j < rl.length; j++) {
          // 0-1 search: their own channels are free, a completed one costs one
          var start = Object.keys(isl).filter(function (c) { return isl[c] === rl[i]; });
          var dist = {}, prev = {}, dq = [];
          start.forEach(function (c) { dist[c] = 0; dq.push(c); });
          while (dq.length) {
            var c = dq.shift();
            edges.forEach(function (e) {
              var n = e.a === c ? e.b : e.b === c ? e.a : null;
              if (!n) return;
              var w = e.own ? 0 : 1, nd = dist[c] + w;
              if (dist[n] === undefined || nd < dist[n]) { dist[n] = nd; prev[n] = { from: c, e: e }; if (w) dq.push(n); else dq.unshift(n); }
            });
          }
          var ends = Object.keys(isl).filter(function (c) { return isl[c] === rl[j] && dist[c] !== undefined; });
          if (!ends.length) continue;
          ends.sort(function (p, q) { return dist[p] - dist[q]; });
          var at = ends[0], path = [];
          while (prev[at] && dist[at] > 0) { if (!prev[at].e.own) path.unshift(prev[at].e); at = prev[at].from; }
          if (!path.length) continue;
          var ids = path.map(function (e) { return e.id; }).join(', ');
          if (used[ids]) continue;
          used[ids] = 1;
          var gs = [];
          path.forEach(function (e) { e.give.forEach(function (g) { if (gs.indexOf(g) < 0) gs.push(g); }); });
          var mids = [];
          path.forEach(function (e) { [e.a, e.b].forEach(function (c) { if (!isl[c] && mids.indexOf(c) < 0) mids.push(c); }); });
          out.push({ gates: gs, ids: ids, n: path.length, via: mids.map(function (c) { return D.centerName[c]; }) });
        }
        return out;
      };
      var wideLine = function (X, Y, col) {
        if (X.definition !== 'Wide Split') return '';
        var w = wideBridges(X, Y);
        if (!w.length) return '';
        return '<p><b style="color:' + col + '">' + esc(Y.name) + '</b> bridges ' + esc(X.name) + '\u2019s wide split with ' +
          esc(w.map(function (x) { return (x.gates.length > 1 ? 'gates ' + x.gates.slice(0, -1).join(', ') + ' and ' + x.gates[x.gates.length - 1] : 'gate ' + x.gates[0]) + ' (' + x.ids + ')' +
            ', ' + (['', 'one channel', 'two channels', 'three channels'][x.n] || x.n + ' channels') + ' away' + (x.via.length ? ', through the ' + x.via.join(' and ') : ''); }).join('; ')) + '</p>';
      };
      var gateList = function (l) { return (l.length > 1 ? 'gates ' + l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1] : 'gate ' + l[0]); };
      var bA = A.definition === 'Wide Split' ? [] : bridges(A, B), bB = B.definition === 'Wide Split' ? [] : bridges(B, A);
      // Conditioning score, how much X conditions Y, following Kaycee's priorities by
      // definition (2026-09-13): Single open centers; Simple, Wide and Quadruple bridges
      // then centers; Triple centers then bridges. Undefined centers weigh more than open
      // (a hanging gate reaches). Completing Y's Throat to their authority center adds.
      // Weights are a draft for her to tune.
      var AUTH_CENTER = function (a) {
        a = String(a || '').toLowerCase();
        return a.indexOf('emotional') > -1 ? 'solar-plexus' : a.indexOf('sacral') > -1 ? 'sacral' : a.indexOf('splenic') > -1 ? 'spleen'
          : a.indexOf('ego') > -1 ? 'heart' : a.indexOf('self') > -1 ? 'g' : null;
      };
      var throatReach = function (gates, target) {
        var have = {}; gates.forEach(function (g) { have[g] = 1; });
        var adj = {};
        allChannels().forEach(function (ch) {
          if (!have[ch.gates[0]] || !have[ch.gates[1]]) return;
          var c1 = centerOfGate(ch.gates[0]), c2 = centerOfGate(ch.gates[1]);
          (adj[c1] = adj[c1] || []).push(c2); (adj[c2] = adj[c2] || []).push(c1);
        });
        var seen = { throat: 1 }, q = ['throat'];
        while (q.length) { var c = q.shift(); (adj[c] || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; q.push(n); } }); }
        return !!seen[target];
      };
      var score = function (X, Y, yBridges) {
        // centers lead for Single and Triple Split, at the weight a bridge carries for
        // a split or a Quadruple (Kaycee, 2026-09-15); elsewhere they come second
        var def = Y.definition, centersLead = def === 'Single' || def === 'Triple Split';
        var centers = 0;
        D.centerOrder.forEach(function (c) {
          if (X.centers[c] !== 'defined' || Y.centers[c] === 'defined') return;
          centers += Y.centers[c] === 'undefined' ? (centersLead ? 6 : 2) : (centersLead ? 4 : 1);
        });
        var per = def === 'Triple Split' ? 2 : /Simple Split|Wide Split|Quadruple Split/.test(def) ? 6 : 0;
        var nb = def === 'Wide Split' ? wideBridges(Y, X).length : yBridges.length;
        // No Definition: what the pair defines for them leads, a defined Throat most
        // (Kaycee, 2026-09-13, speculative); open centers follow at their usual weight
        if (def === 'No Definition') {
          var made = 0, throat = 0;
          // centers X already defines count once, as centers; these are the ones only
          // the two of them together define
          pairOf(X, Y).definedTogether.forEach(function (n) {
            var key = Object.keys(PAIR_NAME).filter(function (k) { return PAIR_NAME[k] === n; })[0];
            if (key === 'throat') throat = 5;
            if (X.centers[key] !== 'defined') made += 3;
          });
          return { total: made + throat + centers, centers: centers, bridges: 0, reach: 0, made: made + throat };
        }
        var auth = AUTH_CENTER(Y.authority), reach = 0;
        // a Throat not yet connected to the authority center is a hook for every
        // definition, Single included: +5 for all (Kaycee, 2026-09-15)
        if (auth && !throatReach(Y.gates, auth) && throatReach(Y.gates.concat(X.gates), auth)) reach = 5;
        return { total: centers + per * nb + reach, centers: centers, bridges: per * nb, reach: reach };
      };
      // bB is B's split bridged by A, so it belongs to how much A conditions B
      var sAB = score(A, B, bB), sBA = score(B, A, bA);
      var scoreTip = function (x) { return x.made != null ? 'definition created ' + x.made + ', centers ' + x.centers : 'centers ' + x.centers + ', bridges ' + x.bridges + ', throat to authority ' + x.reach; };
      // one panel beside the bodygraph: each person, then Both, then Together
      var section = function (X, Y, sc, inCenters, gives, wide, col) {
        var items = (inCenters.length ? '<li>Conditions ' + esc(Y.name) + ' via ' + esc(inCenters.join(', ')) + '</li>' : '') +
          (gives.length ? '<li>Bridges ' + esc(Y.name) + '\u2019s split with ' + esc(gateList(gives)) + '</li>' : '') +
          (wide ? '<li>' + wide.replace(/^<p>/, '').replace(/<\/p>$/, '') + '</li>' : '') +
          (sc.reach ? '<li>Connects ' + esc(Y.name) + '\u2019s Throat to their authority</li>' : '') +
          (sc.made ? '<li>Creates definition for ' + esc(Y.name) + '</li>' : '');
        return '<div class="sec"><div class="hd"><span style="color:' + col + '">' + esc(X.name) + '</span>' +
          '<b style="color:' + col + '" title="' + scoreTip(sc) + '">' + sc.total + '</b></div>' +
          '<ul>' + (items || '<li>Nothing that conditions ' + esc(Y.name) + '</li>') + '</ul></div>';
      };
      // the bigger score always sits on top
      var secA = B.isSky ? '' : section(A, B, sAB, aOn, bB, wideLine(B, A, '#845095'), '#845095');
      var secB = section(B, A, sBA, bOn, bA, wideLine(A, B, '#0d9488'), '#0d9488');
      var panelHtml = (!B.isSky && sBA.total > sAB.total ? secB + secA : secA + secB) +
        (both.length ? '<div class="sec"><div class="hd"><span style="color:#6b6790">Both</span></div><ul><li>Defined in ' + esc(both.join(', ')) + '</li></ul></div>' : '') +
        (made.length ? '<div class="sec"><div class="hd"><span style="color:#c9971c">Together</span></div><ul><li>Define ' + esc(made.join(', ')) + '</li></ul></div>' : '');
      pendingPanels = { a: panelHtml, b: '', newCenters: madeKeys };
      say(''); document.body.classList.remove('pairnote');
      host.innerHTML = '<iframe title="' + esc(A.name) + ' and ' + esc(B.name) + '" src="' + esc(A.chartFile) + '#stage-cond&n=' + encodeURIComponent(A.name) + '" style="width:100%;height:100%;border:0;display:block"></iframe>';
    }, true, skyPerson() ? [skyPerson()] : []);
  }

  // ---- a person, pulled up ------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('.nm[data-person], .nm-open[data-person]') : null;
    if (!c) return;
    var p = ROOM.filter(function (x) { return x.name === c.dataset.person; })[0];
    if (!p || !p.chartFile) return;
    var o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(28,26,46,.45);display:flex;align-items:center;justify-content:center;z-index:40';
    o.innerHTML = '<div style="width:96vw;height:94vh;background:#fff;border-radius:18px;overflow:hidden;position:relative">' +
      '<button style="position:absolute;top:10px;right:12px;z-index:2;border:0;background:#fff;border-radius:50%;width:40px;height:40px;font-size:26px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)">&times;</button>' +
      '<iframe src="' + esc(p.chartFile) + '#stage-view&n=' + encodeURIComponent(p.name) + '" style="width:100%;height:100%;border:0"></iframe></div>';
    o.onclick = function (ev) { if (ev.target === o || ev.target.tagName === 'BUTTON') o.remove(); };
    document.body.appendChild(o);
  });

  // ---- wiring -------------------------------------------------------------------------
  var MODES = { 'The Room': modeRoom, 'Origins': modeOrigins, 'Living Mandala': modeMotion, 'Build a Chart': modeBuild, 'Centers': modeCenters, 'Authority': modeAuthority, 'Definition': modeDefinition, 'Profile': modeProfile, 'Auras': modeAuras, 'Conditioning': modeConditioning };
  var mode = 'The Room';
  function setMode(m) {
    mode = m; document.body.classList.remove('pairnote'); clearInterval(buildTimer); skyFilter = null; focused = {};
    $$('.bar .modes button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === m); });
    MODES[m]();
  }
  $$('.bar .modes button').forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });
  bodySvg.addEventListener('click', function (e) {
    var cs = e.target.closest('.cshape'), ch = e.target.closest('.ch');
    if (mode === 'Centers' && cs) focusCenter(cs.getAttribute('data-center'));
    else if (mode === 'Channels' && ch) focusChannel(ch.getAttribute('data-ch'));
    else if (mode === 'Centers' && !cs) modeCenters();
  });
  document.addEventListener('keydown', function (e) {
    var order = Object.keys(MODES), i = order.indexOf(mode);
    if (e.key === 'ArrowRight') setMode(order[Math.min(order.length - 1, i + 1)]);
    if (e.key === 'ArrowLeft') setMode(order[Math.max(0, i - 1)]);
    if (e.key === 'Escape') { var o = document.querySelector('iframe') && document.querySelector('iframe').closest('div[style*="inset:0"]'); if (o) o.remove(); }
  });
  // going full screen on the TV resizes the window: redraw where things are,
  // keeping what is selected
  var resizeT = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      cropAll();
      if (mode === 'The Sky') { var keep = skyFilter; MODES[mode](); skyFilter = keep; setTimeout(applySky, 80); }
      else if (mode === 'Centers' && focused.center) focusCenter(focused.center);
      else if (mode === 'Channels' && focused.channel) focusChannel(focused.channel);
      else if (mode === 'Centers' || mode === 'Channels' || mode === 'Auras') MODES[mode]();
    }, 200);
  });
  setTimeout(function () { cropAll(); setMode('The Room'); }, 60);
})();
