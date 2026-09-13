// The workshop stage: one screen, no slides. The room's names move across the
// bodygraph and the wheel. Plain script, read from its own file.
(function () {
  var D = JSON.parse(document.getElementById('deck-data').textContent);
  var ROOM = D.room, LIB = D.lib;
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
    '<div class="modes">' + ['Centers', 'Channels', 'The Sky', 'Auras', 'Build a Chart', 'Conditioning'].map(function (m) {
      return '<button data-mode="' + m + '">' + m + '</button>';
    }).join('') + '</div><span class="sp"></span><span class="room">' + ROOM.length + ' in the room</span></div>' +
    '<div class="stage">' +
    '<div class="layer body" id="body">' + D.teachSvg + '</div>' +
    '<div class="layer hide" id="sky">' + D.rings + '</div>' +
    '<div class="layer hide" id="auras"></div>' +
    '<div class="layer hide build" id="build"><div class="split2"><div id="bwheel">' + D.rings + '</div><div id="bbody" class="body">' + D.teachSvg + '</div></div></div>' +
    '<div class="names" id="names"></div></div>' +
    '<div class="note hide" id="note"></div><div id="controls"></div><div class="caption" id="caption"></div>';

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
    el.className = 'nm';
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
    ['body', 'sky', 'auras', 'build'].forEach(function (id) { $('#' + id).classList.toggle('hide', id !== layer); });
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
  var STATE = { defined: 'Defined', undefined: 'Undefined', open: 'Open' };
  function modeCenters() {
    show('body'); resetBody(bodySvg); controls.innerHTML = ''; caption.innerHTML = '';
    focused = {}; rest('left'); say('');
  }
  var focused = {};
  function focusCenter(c) {
    focused.center = c;
    $$('.cshape', bodySvg).forEach(function (el) {
      var on = el.getAttribute('data-center') === c;
      el.classList.toggle('fade', !on); el.classList.toggle('glow', on);
    });
    bodySvg.parentNode.classList.add('dimch');
    var el = $('.cshape[data-center="' + c + '"]', bodySvg), at = centerOf(el);
    var base = Math.max(at.w, at.h) / 2;
    var by = { defined: [], undefined: [], open: [] };
    ROOM.forEach(function (p) { by[p.centers[c]].push(p); });
    // three rings, wider as they go out and as the room grows, so names never pile up
    var grow = 6 * Math.sqrt(ROOM.length);
    ring(by.defined, at.x, at.y, base * 0.6 + 4 * by.defined.length, 'def');
    ring(by.undefined, at.x, at.y, base + 80 + grow, 'und', -Math.PI / 3);
    ring(by.open, at.x, at.y, base + 170 + grow * 1.6, 'open', -Math.PI / 6);
    var L = LIB.centers[D.centerLib[c]] || {};
    var talk = (LIB.slides || {})['Not-Self Talk: ' + D.centerName[c]] || '';
    say('<div class="k">' + esc((L.type || '').split(',').join(' · ')) + '</div><h2>' + esc(D.centerName[c]) + '</h2>' +
      '<p>' + esc(L.themes || '') + '</p>' +
      '<div class="counts"><span class="d" data-state="defined">Defined ' + by.defined.length + '</span><span class="u" data-state="undefined">Undefined ' +
      by.undefined.length + '</span><span class="o" data-state="open">Open ' + by.open.length + '</span></div>' +
      '<p id="statetext">' + (talk ? '<i>' + esc(talk) + '</i>' : '') + '</p>');
    $$('.counts span', note).forEach(function (s) {
      s.onmouseenter = s.onclick = function () {
        $('#statetext').innerHTML = '<b>' + STATE[s.dataset.state] + '.</b> ' + esc(L[s.dataset.state] || '');
      };
    });
  }

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

  // ---- Auras --------------------------------------------------------------------
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
      a.innerHTML = '<div class="glow"></div><div class="t">' + esc(t) + '</div>';
      a.style.cursor = 'pointer';
      a.onclick = function () {
        var L = LIB.types[norm(t)] || {};
        say('<div class="k">' + list.length + ' in the room</div><h2>' + esc(t) + '</h2><p>' + esc(L.basic || '') + '</p><p><b>Strategy.</b> ' + esc(L.strategy || '') + '</p>');
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
  function picker(onPick, multi) {
    controls.innerHTML = '<div class="pickrow">' + ROOM.map(function (p) {
      return '<button data-p="' + esc(p.name) + '">' + esc(p.name) + '</button>';
    }).join('') + '</div>';
    var chosen = [];
    $$('.pickrow button', controls).forEach(function (b) {
      b.onclick = function () {
        if (multi) {
          var i = chosen.indexOf(b.dataset.p);
          if (i > -1) chosen.splice(i, 1); else { chosen.push(b.dataset.p); if (chosen.length > 2) chosen.shift(); }
        } else chosen = [b.dataset.p];
        $$('.pickrow button', controls).forEach(function (x) { x.classList.toggle('on', chosen.indexOf(x.dataset.p) > -1); });
        onPick(chosen.map(function (n) { return ROOM.filter(function (p) { return p.name === n; })[0]; }));
      };
    });
  }
  function modeBuild() {
    show('build'); hideNames(); say(''); caption.innerHTML = '';
    setTimeout(function () { crop(bbodySvg, '.cshape, .ch', 20); blankBuild(); }, 30);
    picker(function (ps) { if (ps[0]) buildChart(ps[0]); });
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
  function modeConditioning() {
    show('body', true); resetBody(bodySvg); hideNames(); say(''); caption.innerHTML = '';
    picker(function (ps) {
      resetBody(bodySvg); hideNames(); say(''); caption.innerHTML = '';
      if (ps.length < 2) { if (ps[0]) caption.innerHTML = esc(ps[0].name); return; }
      var A = ps[0], B = ps[1], aOn = [], bOn = [], both = [];
      bodySvg.parentNode.classList.add('dimch');
      D.centerOrder.forEach(function (c) {
        var a = A.centers[c] === 'defined', b = B.centers[c] === 'defined';
        var el = $('.cshape[data-center="' + c + '"]', bodySvg);
        el.style.fill = a && b ? '#d9a21b' : a ? '#845095' : b ? '#0d9488' : '#ffffff';
        // where one is defined and the other is not, the energy moves across
        if (a !== b) { el.style.animation = 'none'; el.classList.add('glow'); }
        if (a && !b) aOn.push(D.centerName[c]); else if (b && !a) bOn.push(D.centerName[c]); else if (a && b) both.push(D.centerName[c]);
      });
      var bodyBox = bodySvg.getBoundingClientRect();
      place(A.name, bodyBox.left + bodyBox.width * 0.2, bodyBox.top + bodyBox.height * 0.5, 'a');
      place(B.name, bodyBox.left + bodyBox.width * 0.8, bodyBox.top + bodyBox.height * 0.5, 'b');
      caption.innerHTML = '';
      say('<h2>' + esc(A.name) + ' and ' + esc(B.name) + '</h2>' +
        (aOn.length ? '<p><b style="color:#845095">' + esc(A.name) + '</b> conditions ' + esc(B.name) + ' in ' + esc(aOn.join(', ')) + '</p>' : '') +
        (bOn.length ? '<p><b style="color:#0d9488">' + esc(B.name) + '</b> conditions ' + esc(A.name) + ' in ' + esc(bOn.join(', ')) + '</p>' : '') +
        (both.length ? '<p><b style="color:#d9a21b">Both</b> defined in ' + esc(both.join(', ')) + '</p>' : ''));
    }, true);
  }

  // ---- a person, pulled up ------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('.nm[data-person]') : null;
    if (!c) return;
    var p = ROOM.filter(function (x) { return x.name === c.dataset.person; })[0];
    if (!p || !p.chartFile) return;
    var o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(28,26,46,.45);display:flex;align-items:center;justify-content:center;z-index:40';
    o.innerHTML = '<div style="width:96vw;height:94vh;background:#fff;border-radius:18px;overflow:hidden;position:relative">' +
      '<button style="position:absolute;top:10px;right:12px;z-index:2;border:0;background:#fff;border-radius:50%;width:40px;height:40px;font-size:26px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)">&times;</button>' +
      '<iframe src="' + esc(p.chartFile) + '" style="width:100%;height:100%;border:0"></iframe></div>';
    o.onclick = function (ev) { if (ev.target === o || ev.target.tagName === 'BUTTON') o.remove(); };
    document.body.appendChild(o);
  });

  // ---- wiring -------------------------------------------------------------------------
  var MODES = { 'Centers': modeCenters, 'Channels': modeChannels, 'The Sky': modeSky, 'Auras': modeAuras, 'Build a Chart': modeBuild, 'Conditioning': modeConditioning };
  var mode = 'Centers';
  function setMode(m) {
    mode = m; clearInterval(buildTimer); skyFilter = null; focused = {};
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
  setTimeout(function () { cropAll(); setMode('Centers'); }, 60);
})();
