/* Real roof spec for a home, from its real building outline.
   Input: one entry of c4-command-deck/data/roofs-*.json ({ring_ft, sqft, source, pitch:{rise, measured}}),
   ring in local feet, x east, y north. Geometry comes from the app's roof solver (js/roofplan.js,
   window.RoofPlan.build, hip roof by default) and is converted to the drawn-roof SPEC the deck and Home use:
   feet, x east, y SOUTH, z = height above the eave; planes {id, name, rise, dir, pts, types}, edges typed
   ridge/hip/valley/eave/rake, fp (outline), drive/yb for the yard art, hit (planes facing the storm).
   Squares = real plan area x pitch factor / 100. Pitch: measured USGS LiDAR (2018) when the home has a good fit
   (lib/st-meta.js), else 6/12 assumed and labelled so. There is no per-plane hail data, so no plane is marked hit.
   No outline: RealRoof.none() gives {none:true} and the screens say so instead of drawing a roof. */
(function () {
  const r2 = v => Math.round(v * 100) / 100;
  const COMPASS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
  function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1e-12; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }

  function label(entry) {
    const p = entry && entry.pitch;
    if (p && p.measured) return `Estimated from the building outline, pitch est. ${p.rise}/12 from LiDAR (2018)`;
    // Texas data (lib/brand.js dataRoot): say it plainly, the 6/12 is only the estimate's working number
    if ((p && p.gap) || (window.activeRoofer && activeRoofer().dataRoot)) return `Estimated from the building outline. Pitch est. ${p ? p.rise : 6}/12 (no LiDAR)`;
    return `Estimated from the building outline, ${p && p.note && /built/.test(p.note) ? p.note : 'assumed ' + (p ? p.rise : 6) + '/12 pitch'}`;
  }

  // the per-facet LiDAR record (lib/rc-roof.js via STM.facts) when the batch measured this home with good confidence (m 1):
  // its squares, pitch and edge lengths replace the outline estimate; m 2 / 0 / none keep the outline estimate
  const EST_TIP = 'Estimated from public building outlines and 2018 LiDAR. Verify on site.';
  const FACET_TIP = 'Measured from LiDAR roof facets (2018/2020). Verify on site.';
  const facetRec = entry => { const r = entry && entry.facts && entry.facts.roof; return r && r.facets && r.sq > 0 ? r : null; };
  const tip = x => (x && (x.facet || (x.M && x.M.facet) || (x.spec && x.spec.facet)) ? FACET_TIP : EST_TIP);

  function spec(entry, opts) {
    opts = opts || {};
    if (!entry || !entry.ring_ft || !window.RoofPlan) return none(opts.seed);
    const FR = facetRec(entry);
    const rise = (FR && FR.pitch >= 2 ? FR.pitch : 0) || (entry.pitch && entry.pitch.rise) || 6, m = rise / 12;
    const plan = window.RoofPlan.build(entry.ring_ft, rise, { style: opts.style || 'hip' });
    if (!plan || !plan.facets || !plan.facets.length) return none(opts.seed);
    const S = p => [r2(p[0]), r2(-p[1])]; // north-up feet -> y-south feet
    // every facet is one roof plane: z = m * (max_d - d.p), d = its downslope direction; its eave sits at z 0
    const facets = plan.facets.map(f => {
      const a = f.angleDeg * Math.PI / 180, d = [Math.sin(a), Math.cos(a)]; // north-up downslope
      const dmax = Math.max(...f.ring.map(p => p[0] * d[0] + p[1] * d[1]));
      const z = p => Math.max(0, m * (dmax - (p[0] * d[0] + p[1] * d[1])));
      return { f, d, z };
    });
    const zAt = (p) => { // height of a plan point: from the facet it sits on (all facets agree on shared edges)
      let best = null, bd = Infinity;
      facets.forEach(F => { const r = F.f.ring; for (let i = 0; i < r.length; i++) { const dd = segDist(p, r[i], r[(i + 1) % r.length]); if (dd < bd) { bd = dd; best = F; } } });
      return best ? best.z(p) : 0;
    };
    const P3 = (p, z) => { const s = S(p); return [s[0], s[1], r2(z)]; };
    const typedSegs = [];
    ['ridges', 'hips', 'valleys', 'rakes'].forEach(k => (plan[k] || []).forEach(s => typedSegs.push({ type: k === 'ridges' ? 'ridge' : k === 'hips' ? 'hip' : k === 'valleys' ? 'valley' : 'rake', a: s.a, b: s.b })));
    const typeOf = (a, b, za, zb) => {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      for (const s of typedSegs) if (segDist(mid, s.a, s.b) < 0.08 && segDist(a, s.a, s.b) < 0.08 && segDist(b, s.a, s.b) < 0.08) return s.type;
      return za < 0.05 && zb < 0.05 ? 'eave' : Math.abs(za - zb) < 0.05 ? 'ridge' : 'hip'; // sub-foot jogs the solver drops
    };
    const used = {};
    const planes = facets.map((F, i) => {
      const ang = F.f.angleDeg, ci = Math.round(ang / 45) % 8;
      let name = COMPASS[ci] + ' slope'; used[name] = (used[name] || 0) + 1; if (used[name] > 1) name += ' ' + used[name];
      const ring = F.f.ring;
      const pts = ring.map(p => P3(p, F.z(p)));
      const types = ring.map((p, k) => { const q = ring[(k + 1) % ring.length]; return typeOf(p, q, F.z(p), F.z(q)); });
      return { id: F.f.label, name, dir: [r2(F.d[0]), r2(-F.d[1])], rise, pts, types, plan: F.f.planSqft };
    });
    // names: number duplicates from 1 when a direction repeats
    Object.keys(used).forEach(n => { if (used[n] > 1) { const first = planes.find(p => p.name === n); if (first) first.name = n + ' 1'; } });
    const edges = [];
    typedSegs.forEach(s => edges.push({ type: s.type, a: P3(s.a, zAt(s.a)), b: P3(s.b, zAt(s.b)) }));
    (plan.eaves || []).forEach(s => edges.push({ type: 'eave', a: P3(s.a, 0), b: P3(s.b, 0) }));
    const fp = entry.ring_ft.map(S);
    const xs = fp.map(p => p[0]), ys = fp.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), yb = Math.max(...ys);
    const dw = Math.min(11, (x1 - x0) * .3);
    const drive = [r2(x1 - dw - 3), r2(x1 - 3)];
    const hit = []; // no per-plane hail data exists: the home's radar hail is shown once, never painted on planes
    const t = plan.totals;
    return {
      real: true, seed: opts.seed || 1, w: r2(x1 - x0), h: r2(yb - Math.min(...ys)), rise, mainStyle: plan.style, wingKind: 'none',
      planes, edges, fp, drive, yb: r2(yb), hit,
      sqft: entry.sqft, source: entry.source || 'Microsoft building footprint', pitchMeasured: !!(FR || (entry.pitch && entry.pitch.measured)),
      squares: FR ? FR.sq : t.squares, label: FR ? `Measured from LiDAR roof facets (${FR.year || 2018}): ${FR.nFacets} facets, pitch ${FR.pitch}/12${FR.pitch2 ? ' and ' + FR.pitch2 + '/12' : ''}` : label(entry),
      pitchNote: FR ? `${FR.pitch}/12 est., LiDAR roof facets ${FR.year || 2018}` : entry.pitch && entry.pitch.note || null,
      facet: !!FR, facetRec: FR || null
    };
  }
  function none(seed) {
    return { none: true, real: false, seed: seed || 1, planes: [], edges: [], hit: [], fp: [[0, 0], [1, 0], [1, 1], [0, 1]], drive: [0, 0], yb: 1, rise: 6,
      label: 'No outline on file for this home' };
  }
  // ---------- storm map homes ('m<global index>'): their own footprint from lib/st-data-dfw/fp tiles ----------
  // Same tiles the storm map draws (format in shoot_st_data.py). Resolves to a roofs-*.json style entry, or null
  // when the home has no outline on file. Pitch is assumed 6/12 (no LiDAR in the tour mirror).
  const DATA = window.rooferDataRoot ? rooferDataRoot() : new URL('st-data-dfw/', document.currentScript ? document.currentScript.src : location.href.replace(/[^/]*$/, '') + '../lib/').href;
  let catP = null; const tileP = {}, cache = {};
  const fetchBuf = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
  function decode(buf, tr, tc) {
    const dv = new DataView(buf), n = dv.getUint32(0, true), out = new Map(), olon = tc * 0.05, olat = tr * 0.05; let o = 4;
    for (let k = 0; k < n; k++) { const idx = dv.getUint32(o, true), nv = dv.getUint8(o + 6); o += 7; const ring = new Array(nv);
      for (let v = 0; v < nv; v++) { ring[v] = [olon + dv.getUint16(o, true) * 1e-6, olat + dv.getUint16(o + 2, true) * 1e-6]; o += 4; }
      out.set(idx, ring); }
    return out;
  }
  function toEntry(ring) { // lon/lat ring -> local feet around its centroid, near-collinear points dropped (as build_roofs.py)
    const lon0 = ring.reduce((s, p) => s + p[0], 0) / ring.length, lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length, FT = 3.28084;
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180) * FT, ky = 110574 * FT;
    let r = ring.map(p => [(p[0] - lon0) * kx, (p[1] - lat0) * ky]);
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    for (let again = true; again && r.length > 3;) { again = false;
      for (let i = 0; i < r.length; i++) { const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3 || segDist(b, a, c) < 0.4) { r.splice(i, 1); again = true; break; } } }
    let A = 0, cx = 0, cy = 0;
    for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length], c = x1 * y2 - x2 * y1; A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
    A /= 2; cx /= 6 * A; cy /= 6 * A;
    return { ring_ft: r.map(p => [r2(p[0] - cx), r2(p[1] - cy)]), sqft: Math.round(Math.abs(A)), source: window.rooferDataRoot ? 'Overture Maps building outline' : 'Microsoft building footprint', pitch: { rise: 6, measured: false } };
  }
  function mapEntry(i, lon, lat) {
    i = +i; if (!(i >= 0)) return Promise.resolve(null);
    if (i in cache) return Promise.resolve(cache[i]);
    // no position given (record opened cold by its id): look it up in homes.bin instead of calling it "no outline"
    if (!isFinite(+lon) || !isFinite(+lat) || lon === null || lat === null || lon === '' || lat === '')
      return window.STM && STM.lonlat ? STM.lonlat(i).then(p => (p && isFinite(p[0]) ? mapEntry(i, p[0], p[1]) : null)) : Promise.resolve(null);
    catP = catP || fetch(DATA + 'catalog.json').then(r => r.json());
    return catP.then(cat => {
      const R = cat.regions.slice().reverse().find(r => i >= r.offset); if (!R) return null;
      const tr0 = Math.floor(lat / 0.05), tc0 = Math.floor(lon / 0.05), keys = [];
      for (const [dr, dc] of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) if ((R.tiles || []).some(t => t.tr === tr0 + dr && t.tc === tc0 + dc)) keys.push([tr0 + dr, tc0 + dc]);
      const next = k => { if (k >= keys.length) return null; const [tr, tc] = keys[k], key = R.id + '/' + tr + '_' + tc;
        tileP[key] = tileP[key] || fetchBuf(DATA + 'fp/' + key + '.bin').then(b => decode(b, tr, tc)).catch(() => new Map());
        return tileP[key].then(m => { const ring = m.get(i - R.offset); return ring && ring.length >= 3 ? toEntry(ring) : next(k + 1); }); };
      return next(0);
    }).catch(() => null).then(e => {
      if (!e || !window.STM) return e;
      return STM.facts(i, +lon, +lat).then(f => { e.pitch = f.pitch; e.facts = f; return e; }).catch(() => e);
    }).then(e => (cache[i] = e));
  }
  const mapCached = i => (+i in cache ? cache[+i] : undefined);
  // the numbers a roofer quotes from: squares, planes, edge lengths (3D, ft) and the wall lengths of the outline (ft)
  function measure(sp, entry) {
    if (!sp || sp.none) return null;
    const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)), edges = { ridge: 0, hip: 0, valley: 0, eave: 0, rake: 0 };
    sp.edges.forEach(e => { if (e.type in edges) edges[e.type] += L(e.a, e.b); });
    Object.keys(edges).forEach(k => edges[k] = Math.round(edges[k]));
    const FR = sp.facetRec; if (FR) ['ridge', 'hip', 'valley', 'eave', 'rake'].forEach(k => { edges[k] = Math.round(FR[k] || 0); });
    const ring = (entry && entry.ring_ft) || sp.fp, walls = ring.map((p, k) => Math.round(Math.hypot(ring[(k + 1) % ring.length][0] - p[0], ring[(k + 1) % ring.length][1] - p[1]))).filter(w => w >= 1);
    return { squares: sp.squares, planes: sp.planes.length, edges, walls, perimeter: walls.reduce((a, b) => a + b, 0), footprint: entry ? entry.sqft : null,
      w: Math.round(sp.w), d: Math.round(sp.h), rise: sp.rise, measured: !!sp.pitchMeasured, label: sp.label, facet: !!sp.facet, tip: tip(sp) };
  }
  window.RealRoof = { spec, none, label, mapEntry, mapCached, measure, tip, EST_TIP, FACET_TIP };
})();
