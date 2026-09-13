// The workshop deck in the browser. Plain script, read from its own file, so
// nothing here passes through a template literal.
(function () {
  var D = JSON.parse(document.getElementById('deck-data').textContent);
  var ROOM = D.room, LIB = D.lib;
  var app = document.getElementById('app');

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function norm(v) {
    var low = String(v || '').toLowerCase().split(':')[0].split('definition').join('');
    var out = '';
    for (var i = 0; i < low.length; i++) {
      var ch = low.charAt(i);
      if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '/') out += ch;
    }
    return out;
  }
  function by(key) {
    var g = {};
    ROOM.forEach(function (p) { var k = typeof key === 'function' ? key(p) : p[key]; (g[k] = g[k] || []).push(p); });
    return g;
  }
  function chips(list, sel) {
    if (!list || !list.length) return '<span class="small">Nobody here</span>';
    return '<div class="chips">' + list.map(function (p) {
      return '<span class="chip' + (sel && sel.indexOf(p.name) > -1 ? ' sel' : '') + '" data-person="' + esc(p.name) + '">' + esc(p.name) + '</span>';
    }).join('') + '</div>';
  }
  var TYPE_ORDER = ['Generator', 'Manifesting Generator', 'Projector', 'Manifestor', 'Reflector'];
  var TYPE_COLOR = { 'Generator': '#f3a9a2', 'Manifesting Generator': '#f0dca6', 'Projector': '#a5dbe6', 'Manifestor': '#e7bff0', 'Reflector': '#c9b6e4' };
  var DEF_ORDER = ['Single', 'Simple Split', 'Wide Split', 'Split', 'Triple Split', 'Quadruple Split', 'No Definition'];

  // ---- her bodygraph, blank, with the centers painted ------------------------
  // Drawn as markup, then painted once it is on the page, where the shapes can
  // be measured for their labels.
  // The teaching bodygraph, circuit coloured, exactly as the tool draws it.
  function bodyHtml(id) { return '<div class="schematic" id="' + id + '">' + (D.teachSvg || D.blank) + '</div>'; }
  function paintBody(id, fillFor, labelFor) {
    var host = document.getElementById(id);
    if (!host) return;
    var svg = host.querySelector('svg');
    if (!svg) return;
    svg.removeAttribute('width'); svg.removeAttribute('height');
    // Measure on screen, then convert to the drawing's own units: shapes sit
    // inside moved groups, so their local boxes would put the crop in the wrong place.
    var toSvg = function (el) {
      var sr = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, r = el.getBoundingClientRect();
      var k = vb && vb.width ? vb.width / sr.width : 1;
      return { x: (r.left - sr.left) * k + (vb ? vb.x : 0), y: (r.top - sr.top) * k + (vb ? vb.y : 0), w: r.width * k, h: r.height * k };
    };
    var box = null;
    [].forEach.call(svg.querySelectorAll('[data-center], .ch, .chgrp'), function (el) {
      var b = toSvg(el);
      if (!b.w) return;
      box = box ? { x1: Math.min(box.x1, b.x), y1: Math.min(box.y1, b.y), x2: Math.max(box.x2, b.x + b.w), y2: Math.max(box.y2, b.y + b.h) }
        : { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h };
    });
    var centersAt = {};
    D.centerOrder.forEach(function (c) {
      var el = svg.querySelector('.cshape[data-center="' + c + '"]');
      if (el) centersAt[c] = toSvg(el);
    });
    if (box) svg.setAttribute('viewBox', (box.x1 - 16) + ' ' + (box.y1 - 16) + ' ' + (box.x2 - box.x1 + 32) + ' ' + (box.y2 - box.y1 + 32));
    D.centerOrder.forEach(function (c) {
      var el = svg.querySelector('.cshape[data-center="' + c + '"]') || svg.querySelector('#' + D.centerSvgId[c]);
      if (!el) return;
      el.setAttribute('fill', fillFor(c));
      el.style.fill = fillFor(c);
      el.setAttribute('data-center', c);
      el.classList.add('c');
      var lab = labelFor ? labelFor(c) : '';
      if (lab && centersAt[c]) {
        var cb = centersAt[c];
        var b = { x: cb.x, y: cb.y, width: cb.w, height: cb.h };
        var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', b.x + b.width / 2); t.setAttribute('y', b.y + b.height / 2 + 6);
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'clabel');
        t.textContent = lab;
        svg.appendChild(t);
      }
    });
  }
  function share(c, state) {
    return ROOM.filter(function (p) { return p.centers[c] === state; }).length;
  }

  // ---- slides --------------------------------------------------------------
  var slides = [];
  function add(title, section, render, after) { slides.push({ title: title, section: section, render: render, after: after }); }

  add('Welcome', 'Welcome', function () {
    return '<div class="hero">' + (D.logo ? '<img class="logo" src="' + D.logo + '" alt="Delphi">' : '') +
      '<h1>Human Design</h1><p class="lede">' + ROOM.length + ' designs in the room today</p>' +
      chips(ROOM) + (D.know ? '<img class="know" src="' + D.know + '" alt="Know thyself">' : '') + '</div>';
  });

  add('The Room', 'The Room', function () {
    var g = by('type');
    return '<h1>The Room</h1><div class="grid cols' + Math.min(5, Math.max(2, Object.keys(g).length)) + '" style="grid-template-columns:repeat(' + Math.max(2, Object.keys(g).length) + ',minmax(0,1fr))">' +
      TYPE_ORDER.filter(function (t) { return g[t]; }).map(function (t) {
        return '<div class="card" style="border-top:6px solid ' + TYPE_COLOR[t] + '"><div class="n">' + g[t].length + '</div><h3>' + esc(t) + '</h3>' +
          '<div class="small">' + esc(g[t][0].strategy) + '</div><div style="margin-top:12px">' + chips(g[t]) + '</div></div>';
      }).join('') + '</div>';
  });

  add('The Wheel', 'The Wheel', function () {
    return '<h1>The Wheel</h1><div class="tabs"><button class="on" data-wheel="live">The Sky Moving</button><button data-wheel="suns">Our Birth Suns</button></div>' +
      '<div id="wheelbox"></div>';
  }, function () {
    var box = document.getElementById('wheelbox');
    function show(which) {
      [].forEach.call(document.querySelectorAll('[data-wheel]'), function (b) { b.classList.toggle('on', b.dataset.wheel === which); });
      if (which === 'live') {
        box.innerHTML = '<iframe class="frame" src="Living Mandala.html"></iframe>';
      } else {
        var marks = D.marks.map(function (m) {
          return '<g class="mk" data-person="' + esc(m.name) + '" style="cursor:pointer"><circle cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="7"></circle>' +
            '<text x="' + m.lx.toFixed(1) + '" y="' + (m.ly + 5).toFixed(1) + '" text-anchor="middle">' + esc(m.name) + '</text></g>';
        }).join('');
        var ringsSvg = D.rings.replace('</svg>', marks + '</svg>');
        box.innerHTML = '<div class="split"><div class="wheel">' + ringsSvg + '</div><div>' +
          chips(ROOM.slice().sort(function (a, b) { return a.sunLon - b.sunLon; })) + '</div></div>';
      }
    }
    [].forEach.call(document.querySelectorAll('[data-wheel]'), function (b) { b.onclick = function () { show(b.dataset.wheel); }; });
    show('live');
  });

  add('The Bodygraph', 'The Bodygraph', function () {
    return '<h1>The Bodygraph</h1><iframe class="frame" src="Bodygraph.html"></iframe>';
  });

  add('Nine Centers', 'Centers', function () {
    return '<h1>Nine Centers in This Room</h1><div class="split">' + bodyHtml('heat') +
      '<div class="bars"><h2>Defined</h2>' + D.centerOrder.map(function (c) {
        var n = share(c, 'defined');
        return '<div class="row" data-goto="center-' + c + '"><span>' + esc(D.centerName[c]) + '</span><div class="track"><div class="fill" style="width:' +
          Math.round(100 * n / Math.max(1, ROOM.length)) + '%"></div></div><b>' + n + '</b></div>';
      }).join('') + '</div></div>';
  }, function () {
    paintBody('heat', function (c) {
      var d = share(c, 'defined') / Math.max(1, ROOM.length);
      return 'rgba(132,80,149,' + (0.08 + d * 0.8).toFixed(2) + ')';
    }, function (c) { return share(c, 'defined') + '/' + ROOM.length; });
    [].forEach.call(document.querySelectorAll('.schematic .c'), function (el) {
      el.onclick = function () { go(indexOf('center-' + el.dataset.center)); };
    });
  });

  D.centerOrder.forEach(function (c) {
    add(D.centerName[c], 'Centers', function () {
      var L = LIB.centers[D.centerLib[c]] || {};
      var col = function (state, label, cls) {
        var list = ROOM.filter(function (p) { return p.centers[c] === state; });
        // names first, so the room finds itself before the reading
        return '<div class="card ' + cls + '"><div class="n">' + list.length + '</div><h3>' + label + '</h3>' +
          chips(list) + '<div class="txt">' + esc(L[state] || '') + '</div></div>';
      };
      return '<h1>' + esc(D.centerName[c]) + '</h1>' +
        (L.type ? L.type.split(',').map(function (t) { return '<span class="pill">' + esc(t.trim()) + '</span>'; }).join('') : '') +
        '<p class="lede">' + esc(L.themes || '') + '</p>' +
        '<div class="split" style="grid-template-columns:minmax(300px,34%) 1fr">' + bodyHtml('one') +
        '<div class="grid cols3">' + col('defined', 'Defined', 'def') + col('undefined', 'Undefined', 'und') + col('open', 'Open', 'open') + '</div></div>';
    }, function () {
      paintBody('one', function (x) { return x === c ? '#845095' : '#ffffff'; });
      // the other centres step back so this one carries the eye
      var host = document.getElementById('one');
      if (host) [].forEach.call(host.querySelectorAll('[data-center]'), function (el) {
        if (el.getAttribute('data-center') !== c) el.style.opacity = '0.35';
      });
    });
    slides[slides.length - 1].id = 'center-' + c;
  });

  add('Definition', 'Definition', function () {
    var g = by('definition');
    return '<h1>Definition</h1><div class="grid cols3">' + DEF_ORDER.filter(function (k) { return g[k]; }).map(function (k) {
      return '<div class="card"><div class="n">' + g[k].length + '</div><h3>' + esc(k) + '</h3>' + chips(g[k]) + '<div class="txt">' +
        esc(LIB.definition[norm(k)] || '') + '</div></div>';
    }).join('') + '</div>';
  });

  add('Authority', 'Authority', function () {
    var g = by('authority');
    return '<h1>Authority</h1><div class="grid cols3">' + Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).map(function (k) {
      return '<div class="card"><div class="n">' + g[k].length + '</div><h3>' + esc(k) + '</h3>' + chips(g[k]) + '<div class="txt">' +
        esc(LIB.authority[g[k][0].authorityKey] || '') + '</div></div>';
    }).join('') + '</div>';
  });

  TYPE_ORDER.forEach(function (t) {
    add(t, 'Type and Strategy', function () {
      var L = LIB.types[norm(t)] || {};
      var list = ROOM.filter(function (p) { return p.type === t; });
      return '<h1>' + esc(t) + ' <span class="small">' + list.length + ' here</span></h1>' +
        '<p class="lede">' + esc(L.basic || '') + '</p>' +
        '<div class="grid cols2"><div class="card"><h3>Strategy</h3><div class="txt">' + esc(L.strategy || '') + '</div></div>' +
        '<div class="card"><h3>' + esc(L.signature || '') + ' / ' + esc(L.notSelf || '') + '</h3><div class="txt">' + esc(L.frequencies || '') + '</div></div></div>' +
        '<h2>In the room</h2>' + chips(list);
    });
  });

  add('Profiles', 'Profiles', function () {
    var g = by('profile');
    var keys = Object.keys(g).sort();
    return '<h1>Profiles</h1><div class="grid cols3">' + keys.map(function (k) {
      return '<div class="card"><div class="n">' + g[k].length + '</div><h3>' + esc(k) + '</h3>' + chips(g[k]) + '<div class="txt">' +
        esc(LIB.profile[norm(k)] || '') + '</div></div>';
    }).join('') + '</div>';
  });

  add('Groups', 'Groups and Pairs', function () {
    var energy = ROOM.filter(function (p) { return p.type === 'Generator' || p.type === 'Manifesting Generator' || p.type === 'Manifestor'; });
    var guides = ROOM.filter(function (p) { return p.type === 'Projector' || p.type === 'Reflector'; });
    return '<h1>Type to Type</h1><div class="grid cols2">' +
      '<div class="card"><h3>Generators, Manifesting Generators and Manifestors</h3><div class="n">' + energy.length + '</div><div style="margin-top:12px">' + chips(energy) + '</div></div>' +
      '<div class="card"><h3>Projectors and Reflectors</h3><div class="n">' + guides.length + '</div><div style="margin-top:12px">' + chips(guides) + '</div></div></div>';
  });

  add('Sacral Pairs', 'Groups and Pairs', function () {
    var asks = ROOM.filter(function (p) { return p.centers.sacral !== 'defined'; });
    var answers = ROOM.filter(function (p) { return p.centers.sacral === 'defined'; });
    // shuffle so the pairs are fresh each time the slide opens
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    asks = shuffle(asks); answers = shuffle(answers);
    var pairs = [], i = 0;
    for (; i < Math.min(asks.length, answers.length); i++) pairs.push([asks[i], answers[i]]);
    var restA = asks.slice(i), restB = answers.slice(i);
    // anyone left over joins a pair as a third
    restA.concat(restB).forEach(function (p, k) { if (pairs.length) pairs[k % pairs.length].push(p); else pairs.push([p]); });
    return '<h1>Sacral Pairs</h1><div class="tabs"><button data-reshuffle="1">New Pairs</button></div><div class="grid cols4">' +
      pairs.map(function (pr, n) {
        return '<div class="card"><div class="small">Pair ' + (n + 1) + '</div>' + chips(pr) +
          '<div class="small" style="margin-top:8px">' + pr.map(function (p) { return esc(p.name) + ': Sacral ' + p.centers.sacral; }).join('<br>') + '</div></div>';
      }).join('') + '</div>';
  }, function () {
    var b = document.querySelector('[data-reshuffle]');
    if (b) b.onclick = function () { render(); };
  });

  var compareSel = [];
  add('Compare Two', 'Groups and Pairs', function () {
    var a = ROOM.filter(function (p) { return p.name === compareSel[0]; })[0];
    var b = ROOM.filter(function (p) { return p.name === compareSel[1]; })[0];
    var h = '<h1>Compare Two</h1><div class="chips" id="cmppick">' + ROOM.map(function (p) {
      return '<span class="chip' + (compareSel.indexOf(p.name) > -1 ? ' sel' : '') + '" data-pick="' + esc(p.name) + '">' + esc(p.name) + '</span>';
    }).join('') + '</div>';
    if (!a || !b) return h;
    var row = function (label, x, y) {
      return '<div class="f ' + (x === y ? 'same' : 'hot') + '"><span>' + esc(label) + '</span><span>' + esc(x) + '</span><span>' + esc(y) + '</span></div>';
    };
    var view = function (p) { return '<div class="bg">' + p.svg + '</div>'; };
    h += '<div class="cmp" style="margin-top:18px"><div><h2 class="chip-h" data-person="' + esc(a.name) + '">' + esc(a.name) + '</h2>' + view(a) + '</div>' +
      '<div><h2 class="chip-h" data-person="' + esc(b.name) + '">' + esc(b.name) + '</h2>' + view(b) + '</div></div>' +
      '<div class="diff card" style="margin-top:18px"><div class="f"><span></span><b>' + esc(a.name) + '</b><b>' + esc(b.name) + '</b></div>' +
      row('Type', a.type, b.type) + row('Strategy', a.strategy, b.strategy) + row('Authority', a.authority, b.authority) +
      row('Profile', a.profile, b.profile) + row('Definition', a.definition, b.definition) +
      D.centerOrder.map(function (c) { return row(D.centerName[c], a.centers[c], b.centers[c]); }).join('') + '</div>';
    return h;
  }, function () {
    [].forEach.call(document.querySelectorAll('[data-pick]'), function (el) {
      el.onclick = function (e) {
        e.stopPropagation();
        var n = el.dataset.pick, i = compareSel.indexOf(n);
        if (i > -1) compareSel.splice(i, 1); else { compareSel.push(n); if (compareSel.length > 2) compareSel.shift(); }
        render();
      };
    });
  });

  add('Know Thyself', 'Close', function () {
    return '<div class="hero">' + (D.logo ? '<img class="logo" src="' + D.logo + '" alt="Delphi">' : '') +
      '<h1>Know Thyself</h1>' + chips(ROOM) + (D.know ? '<img class="know" src="' + D.know + '" alt="Know thyself">' : '') + '</div>';
  });

  // ---- a person, pulled up ------------------------------------------------
  function person(name) {
    var p = ROOM.filter(function (x) { return x.name === name; })[0];
    if (!p) return;
    var o = document.createElement('div');
    o.className = 'overlay';
    // their own Delphi chart, the page their link opens, saved with the deck
    o.innerHTML = '<div class="sheet wide"><button class="close" aria-label="Close">&times;</button>' +
      (p.chartFile ? '<iframe class="chartframe" src="' + esc(p.chartFile) + '"></iframe>'
        : '<h1>' + esc(p.name) + '</h1><div class="bg">' + p.svg + '</div>') + '</div>';
    o.onclick = function (e) { if (e.target === o || (e.target.closest && e.target.closest('.close'))) o.remove(); };
    document.body.appendChild(o);
  }

  // ---- frame and navigation -----------------------------------------------
  var cur = 0;
  function indexOf(id) { for (var i = 0; i < slides.length; i++) if (slides[i].id === id) return i; return cur; }
  function go(i) { cur = Math.max(0, Math.min(slides.length - 1, i)); try { localStorage.setItem('deck-pos', String(cur)); } catch (e) {} render(); }
  function render() {
    var s = slides[cur];
    app.innerHTML = '<div class="deck"><div class="top">' + (D.logo ? '<img class="logo" src="' + D.logo + '" alt="Delphi">' : '') +
      '<span class="crumb">' + esc(s.section) + '</span><span class="spacer"></span><span class="count">' + ROOM.length + ' in the room</span>' +
      '<button id="menubtn">Sections</button></div><div class="slide"><div class="fit">' + s.render() + '</div></div>' +
      '<div class="nav"><button id="prev" aria-label="Back">&#8592;</button><span class="pos">' + (cur + 1) + ' / ' + slides.length +
      '</span><button id="next" aria-label="Next">&#8594;</button></div></div>';
    document.getElementById('prev').onclick = function () { go(cur - 1); };
    document.getElementById('next').onclick = function () { go(cur + 1); };
    document.getElementById('menubtn').onclick = toggleMenu;
    [].forEach.call(document.querySelectorAll('[data-goto]'), function (el) { el.onclick = function () { go(indexOf(el.dataset.goto)); }; });
    if (s.after) s.after();
    fit();
    // images and embedded pages settle after the first paint
    setTimeout(fit, 60); setTimeout(fit, 400);
  }
  // Every slide fits the screen with no scrolling. Kaycee, 2026-09-13: "every
  // screen should fit on one page so I don't have to scroll". A slide holding an
  // embedded page (the wheel, the bodygraph) sizes that page to the screen
  // instead; everything else scales down until it fits.
  function fit() {
    var slide = document.querySelector('.slide'), box = document.querySelector('.fit'), nav = document.querySelector('.nav');
    if (!slide || !box) return;
    box.style.transform = ''; box.style.width = '';
    var top = box.getBoundingClientRect().top;
    var bottom = nav ? nav.getBoundingClientRect().top - 12 : slide.getBoundingClientRect().bottom - 12;
    var availH = bottom - top;
    var frame = box.querySelector('iframe.frame');
    if (frame) {
      frame.style.height = Math.max(200, bottom - frame.getBoundingClientRect().top) + 'px';
      return;
    }
    // shrinking widens the box, which reflows the text shorter, so settle it
    var k = 1;
    for (var i = 0; i < 8; i++) {
      var h = box.scrollHeight;
      var next = Math.min(1, availH / h * k > 1 ? 1 : availH / (h / (1 / k) * k)) ;
      next = Math.min(1, (availH * (1 / k)) / h * k);
      if (Math.abs(next - k) < 0.005) break;
      k = next;
      box.style.width = (100 / k) + '%';
    }
    // step down until the scaled height is inside the screen
    for (var j = 0; j < 30 && box.scrollHeight * k > availH; j++) {
      k = k * 0.97;
      box.style.width = (100 / k) + '%';
    }
    if (k < 1) box.style.transform = 'scale(' + k + ')';
    else box.style.width = '';
  }
  window.addEventListener('resize', fit);
  function toggleMenu() {
    var m = document.querySelector('.menu');
    if (m) { m.remove(); return; }
    m = document.createElement('div');
    m.className = 'menu';
    m.innerHTML = slides.map(function (s, i) {
      return '<a data-i="' + i + '" class="' + (i === cur ? 'on' : '') + '">' + esc(s.title) + '</a>';
    }).join('');
    m.onclick = function (e) { var a = e.target.closest('a'); if (a) { m.remove(); go(+a.dataset.i); } };
    document.body.appendChild(m);
  }
  document.addEventListener('click', function (e) {
    var c = e.target.closest ? e.target.closest('[data-person]') : null;
    if (c) person(c.dataset.person);
  });
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.overlay')) { if (e.key === 'Escape') document.querySelector('.overlay').remove(); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(cur + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(cur - 1); }
    if (e.key === 'Escape') { var m = document.querySelector('.menu'); if (m) m.remove(); }
  });
  try { cur = Math.min(slides.length - 1, +(localStorage.getItem('deck-pos') || 0)); } catch (e) {}
  render();
})();
