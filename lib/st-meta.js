/* Real house facts for every tour screen (window.STM). All read-only copies of the Roof Command app's own data:
   - meta/<region>/homes_meta.bin + streets.json + cities.json: county address, zip and year built per home
     (same layout as the app's js/modules/core.js regionHomeMeta), plus subdivision, living sq ft and CAD id (homes_ext.bin).
   - meta/hail/<region>/<date>.bin: the app's per-home radar hail (MRMS MESH, 1/100 in). STH.hailFor uses these,
     so storm counts, swaths and every home's hail are the app's radar values, not a model.
   - meta/permits.json: reroof_permits rows keyed region:index (permit date only).
   - meta/pitch/<region>/tile_<r>_<c>.json: measured pitch from USGS 3DEP LiDAR (2018), {index: [rise/12, fit 0-100]}.
   Never loads owner names. Home index = global index into lib/st-data-dfw/homes.bin (region offset + row). */
(function () {
  if (window.STM) return;
  const src = document.currentScript && document.currentScript.src;
  const BASE = window.rooferDataRoot ? rooferDataRoot() : (src ? new URL('st-data-dfw/', src).href : new URL('lib/st-data-dfw/', location.href).href);   // the roofer's data (lib/brand.js dataRoot)
  const J = u => fetch(BASE + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const B = u => fetch(BASE + u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  let catP = null; const cat = () => catP || (catP = J('catalog.json'));
  let STATE = 'TX'; cat().then(c => { if (c && c.state) STATE = c.state; });   // the data's state (catalog.state)
  const regOf = (c, i) => { for (let k = c.regions.length - 1; k >= 0; k--) if (i >= c.regions[k].offset) return c.regions[k]; return c.regions[0]; };

  // ---------- address + year built ----------
  const metaP = {}, metaD = {};
  function regionMeta(r) {
    // homes_ext.bin + subdivs.json (DFW builds only): subdivision, living sq ft, CAD property id per home
    return metaP[r.id] || (metaP[r.id] = cat().then(c => { const ext = !!c; return Promise.all([J(`meta/${r.id}/streets.json`), J(`meta/${r.id}/cities.json`), B(`meta/${r.id}/homes_meta.bin`), c,
      ext ? J(`meta/${r.id}/subdivs.json`) : null, ext ? B(`meta/${r.id}/homes_ext.bin`) : null]); })
      .then(([st, ci, buf, c, sub, ext]) => (metaD[r.id] = st && buf && buf.byteLength === r.count * 16 ? { st, ci: ci || [], v: new DataView(buf), n: r.count, r, state: (c && c.state) || 'TX',
        sub: sub || null, x: ext && ext.byteLength === r.count * 8 ? new DataView(ext) : null } : null)));
  }
  const ABBR = { Avenue: 'Ave', Street: 'St', Drive: 'Dr', Lane: 'Ln', Boulevard: 'Blvd', Court: 'Ct', Parkway: 'Pkwy', Terrace: 'Ter', Road: 'Rd', Place: 'Pl', Circle: 'Cir' };
  function streetName(raw, city) { // county roll "Nw 17Th St Plano" -> "NW 17th St"
    let s = String(raw || '').trim();
    if (city && s.endsWith(' ' + city)) s = s.slice(0, -city.length - 1);
    return s.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, a, b) => a + b.toLowerCase()).replace(/\b(Nw|Ne|Sw|Se)\b/g, m => m.toUpperCase())
      .replace(/\b(Avenue|Street|Drive|Lane|Boulevard|Court|Parkway|Terrace|Road|Place|Circle)\b/g, m => ABBR[m]);
  }
  function read(M, j) {
    const n = M.n, v = M.v;
    const year = v.getUint16(j * 2, true), no = v.getUint16(n * 6 + j * 2, true), sid = v.getUint16(n * 8 + j * 2, true);
    const zip = v.getUint32(n * 10 + j * 4, true), cid = v.getUint16(n * 14 + j * 2, true);
    const city = M.ci[cid] || '', street = streetName(M.st[sid], city);
    const z = zip ? String(zip).padStart(5, '0') : '', S = M.state || 'TX';
    let subdivision = null, sqft = null, cadId = null;
    if (M.x) { const sd = M.x.getUint16(j * 2, true); subdivision = (M.sub && M.sub[sd]) || null; sqft = M.x.getUint16(n * 2 + j * 2, true) || null; cadId = M.x.getUint32(n * 4 + j * 4, true) || null; }
    const addr = no ? `${no} ${street}` : (street || null), place = [city || null, (S + ' ' + z).trim()].filter(Boolean).join(', ');
    // full: "123 Main St, Frisco, TX 75034" (the one line every screen shows)
    return { addr, street, houseNo: no || null, city, zip: z, state: S, year: year || null, subdivision, sqft, cadId,
      place, full: addr ? addr + ', ' + place : place, county: M.r.name, region: M.r.id };
  }
  function meta(i) { return cat().then(c => { if (!c) return null; const r = regOf(c, i); return regionMeta(r).then(M => M ? read(M, i - r.offset) : null); }); }
  function metaNow(i) { if (!catP) return null; let out = null; Object.values(metaD).forEach(M => { if (M && i >= M.r.offset && i < M.r.offset + M.n) out = read(M, i - M.r.offset); }); return out; }

  // ---------- reroof permits ----------
  let permP = null; const permits = () => permP || (permP = J('meta/permits.json').then(d => d || {}));
  function permit(i) { return cat().then(c => { const r = regOf(c, i); return permits().then(p => p[r.id + ':' + (i - r.offset)] || null); }); }
  function roofAge(m, per) {
    if (per) return `Reroof permit ${per.slice(0, 4)}`;
    if (m && m.year) return `Built ${m.year}, no reroof permit on file`;
    return 'No reroof permit on file, year built not on file';
  }

  // ---------- measured pitch (USGS LiDAR 2018) ----------
  let pidxP = null; const pidx = () => pidxP || (pidxP = J('meta/pitch/index.json').then(d => d || { tiles: {} }));
  const ptile = {};
  function pitchRaw(i, lon, lat) {
    return Promise.all([cat(), pidx()]).then(([c, ix]) => {
      const r = regOf(c, i), have = new Set((ix.tiles || {})[r.id] || []), j = String(i - r.offset);
      if (!have.size || !isFinite(lon) || !isFinite(lat)) return null;
      const tr = Math.floor(lat / 0.05), tc = Math.floor(lon / 0.05), keys = [];
      [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { const k = (tr + a) + '_' + (tc + b); if (have.has(k)) keys.push(k); });
      const next = k => { if (k >= keys.length) return null; const key = r.id + '/' + keys[k];
        ptile[key] = ptile[key] || J(`meta/pitch/${r.id}/tile_${keys[k]}.json`).then(d => d || {});
        return ptile[key].then(d => d[j] ? d[j] : next(k + 1)); };
      return next(0);
    });
  }
  // the pitch a screen should use: measured when the fit is good and the house stood when the LiDAR flew, else 6/12 assumed
  function pitchInfo(raw, year) {
    // Texas data: say plainly the pitch was not measured (LiDAR gap); 6/12 is only the estimate's working number
    const gap = STATE === 'TX';
    if (raw && year && year > 2018) return { rise: 6, measured: false, gap, note: gap ? `Pitch not measured (built ${year}, after the 2018 LiDAR)` : `assumed 6/12, built ${year}, after the 2018 LiDAR` };
    if (raw && raw[0] >= 2 && raw[1] >= 40) return { rise: raw[0], measured: true, conf: raw[1], note: `${raw[0]}/12 est., LiDAR 2018` };
    return { rise: 6, measured: false, gap, note: gap ? 'Pitch not measured (LiDAR gap)' : 'assumed 6/12' };
  }

  // a home's position from homes.bin (Float32 lon,lat per home) when the caller has none: a record opened cold by its
  // id (#/crm/home/m<i>, a fresh device, a CRM thread synced from the cloud) carries no lon/lat, and without them the
  // outline tile and the LiDAR pitch tile can't be found
  let xyP = null;
  function lonlat(i) {
    i = +i; if (!(i >= 0)) return Promise.resolve(null);
    if (window.STH && STH.xy) return Promise.resolve([STH.lon(i), STH.lat(i)]);
    return (xyP = xyP || B('homes.bin')).then(buf => { if (!buf || (i + 1) * 8 > buf.byteLength) return null; const f = new Float32Array(buf, i * 8, 2); return [f[0], f[1]]; });
  }
  // everything known about one home
  function facts(i, lon, lat) {
    const pos = isFinite(lon) && isFinite(lat) ? Promise.resolve([+lon, +lat]) : lonlat(i).then(p => p || [NaN, NaN]);
    return pos.then(([x, y]) => Promise.all([meta(i), permit(i), pitchRaw(i, x, y)]).then(([m, per, raw]) => {
      m = m || {}; const pitch = pitchInfo(raw, m.year);
      return Object.assign({ i, id: 'm' + i, lon: x, lat: y }, m, { permit: per, roofAge: roofAge(m, per), pitch });
    }));
  }

  // ---------- real per-home hail (the app's radar values) ----------
  const hc = {}, hp = {};
  function hailFor(iso) {
    if (hc[iso]) return Promise.resolve(hc[iso]);
    return hp[iso] || (hp[iso] = cat().then(c => {
      const out = new Uint8Array(c.total), st = c.storms.find(s => s.date === iso), regs = st ? Object.keys(st.regions || {}) : [];
      return Promise.all(c.regions.filter(r => regs.includes(r.id)).map(r => B(`meta/hail/${r.id}/${iso}.bin`).then(buf => {
        if (buf && buf.byteLength === r.count) out.set(new Uint8Array(buf), r.offset); else STM.hailMissing.push(r.id + ' ' + iso);
      }))).then(() => (hc[iso] = out));
    }));
  }
  function hookSTH() { if (!window.STH || STH.__realHail) return; STH.__realHail = true; STH.hailFor = s => hailFor(s.iso); STH.hailCached = s => hc[s.iso] || null; }

  // ---------- address search: "7901 Windrose" -> homes with that house number on a matching street ----------
  const norm = s => String(s || '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\b(northwest)\b/g, 'nw').replace(/\b(northeast)\b/g, 'ne').replace(/\b(southwest)\b/g, 'sw').replace(/\b(southeast)\b/g, 'se')
    .replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w').replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln').replace(/\bboulevard\b/g, 'blvd').replace(/\bcourt\b/g, 'ct').replace(/\bplace\b/g, 'pl').replace(/\bcircle\b/g, 'cir').replace(/\bterrace\b/g, 'ter')
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1').replace(/\s+/g, ' ').trim();
  // the roofer's home city first (Plano), then its first region (Collin)
  function rankOf(h, M) {
    const R = window.activeRoofer ? activeRoofer() : null, home = R ? R.city : 'Plano', reg = M.r.offset === 0;
    return h.city === home ? 0 : reg ? 1 : 2;
  }
  // a city, ZIP or subdivision name (catalog regions' places.json): "Frisco", "75034", "Starwood"
  const placesP = {};
  function places(r) { return placesP[r.id] || (placesP[r.id] = J(`meta/${r.id}/places.json`)); }
  function searchPlaces(q, limit) {
    const t = String(q || '').toLowerCase().trim(); if (t.length < 2) return Promise.resolve([]);
    return cat().then(c => Promise.all(c.regions.map(r => places(r).then(p => [r, p])))).then(list => {
      const out = [];
      list.forEach(([r, p]) => { if (!p || !p.cities) return;
        Object.entries(p.cities).forEach(([city, cv]) => {
          if (city.toLowerCase().startsWith(t)) out.push({ kind: 'city', title: city, city, count: cv.count, start: r.offset + cv.start, region: r.id, rank: 0 });
          Object.entries(cv.zips || {}).forEach(([zip, zv]) => {
            if (zip && zip.startsWith(t)) out.push({ kind: 'zip', title: zip, city, zip, count: zv.count, start: r.offset + zv.start, region: r.id, rank: 1 });
            Object.entries(zv.subdivs || {}).forEach(([sd, a]) => { if (sd.toLowerCase().includes(t)) out.push({ kind: 'subdivision', title: sd, city, zip, count: a[1], start: r.offset + a[0], region: r.id, rank: 2 }); });
          });
        });
      });
      // a city split across two counties (Frisco, Plano) lists once with both counts
      const m = new Map(); out.forEach(o => { const k = o.kind + '|' + o.title + '|' + (o.kind === 'subdivision' ? o.zip : ''); const e = m.get(k); if (e) { e.count += o.count; (e.ranges = e.ranges || [[e.start, e.count - o.count]]).push([o.start, o.count]); } else m.set(k, o); });
      return [...m.values()].sort((a, b) => a.rank - b.rank || b.count - a.count).slice(0, limit || 5);
    });
  }
  function search(q, limit) {
    limit = limit || 6;
    const m = /^\s*(\d{1,5})\s+(.+)$/.exec(q || ''); const num = m ? +m[1] : null, text = norm(m ? m[2] : q);
    if (text.length < 2) return Promise.resolve([]);
    return cat().then(c => Promise.all(c.regions.map(regionMeta))).then(list => {
      const out = [];
      list.forEach(M => { if (!M) return;
        const want = new Set(); M.st.forEach((s, k) => { const n = norm(s); if (n.includes(text) || (' ' + n).includes(' ' + text)) want.add(k); });
        if (!want.size) return;
        const n = M.n, v = M.v; let got = 0;
        for (let j = 0; j < n && got < 400; j++) {
          const sid = v.getUint16(n * 8 + j * 2, true); if (!want.has(sid)) continue;
          const no = v.getUint16(n * 6 + j * 2, true); if (num != null && no !== num) continue; if (!no) continue;
          const h = read(M, j); got++;
          out.push(Object.assign(h, { i: M.r.offset + j, rank: rankOf(h, M) + (num != null && no === num ? 0 : 0.5) }));
        }
      });
      out.sort((a, b) => a.rank - b.rank || (a.houseNo - b.houseNo));
      const seen = new Set(); return out.filter(h => { const k = h.addr + h.place; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
    });
  }

  const STM = window.STM = { BASE, places, searchPlaces, meta, metaNow, permit, roofAge, pitchRaw, pitchInfo, facts, lonlat, hailFor, search, hookSTH, streetName, hailMissing: [] };
  hookSTH(); if (!window.STH) document.addEventListener('DOMContentLoaded', hookSTH);
})();
