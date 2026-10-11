/* rc-state.js: ONE set of facts and ONE pipeline shared by every screen of the tour (plain script, window.RC).
   Every page (storm map, Daily 50, Home, Ask, shell) loads this file. State lives in localStorage under "rc.t."
   so all frames see the same thing; other frames hear changes through the 'storage' event (RC.on('change')).
   Real: homes watched, counties, storms and their counts (lib/st-data-dfw/catalog.json, built from the county data).
   Sample (this device only, flagged in the UI): people, phones, opt-ins, pipeline, texts, emails, bookings.
   Nothing here sends or writes to a server, and nothing starts a phone call: outreach is by text and email only
   (10-09, Jack). Text = sms: draft a human sends from their own phone, inside the roofer's texting hours;
   Email = mailto: draft. Calls logged before 10-09 stay in the history as records, nothing new creates one. */
(function () {
  "use strict";
  if (window.RC) return;
  const P = 'rc.t.';
  const get = (k, d) => { try { const v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { } fire({ key: k }); };
  const subs = [];
  const fire = d => subs.slice().forEach(f => { try { f(d); } catch (e) { console.warn(e); } });
  addEventListener('storage', e => { if (e.key && e.key.indexOf(P) === 0) fire({ key: e.key.slice(P.length), remote: true }); });
  let ROOFER = (function () {
    const ok = k => typeof k === 'string' && /^[a-z0-9-]{2,32}$/.test(k);
    let k = null;
    try { k = new URLSearchParams(location.search).get('roofer'); } catch (e) { }
    if (!ok(k)) try { if (window.parent !== window) k = new URLSearchParams(window.parent.location.search).get('roofer'); } catch (e) { k = null; }
    if (ok(k)) { try { localStorage.setItem(P + 'roofer', JSON.stringify(k)); } catch (e) { } return k; }
    k = get('roofer', 'jackson');
    return ok(k) ? k : 'jackson';
  })();
  const base = (function () { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/lib\/rc-state\.js.*$/, '') : '../'; })();

  const TWF = {};   // one Intl formatter per time zone (the send-time picker asks hundreds of times)
  const KEEP = ['body', 'to', 'subject', 'scheduled'];
  function logOut(id, kind, what, extra) {
    const all = get('pipe', {}), p = all[id] = all[id] || { stage: 'new', history: [] }, e = { at: new Date().toISOString(), what, kind };
    if (extra) KEEP.forEach(k => { if (extra[k] != null && extra[k] !== '') e[k] = String(extra[k]).slice(0, 4000); });
    // the first text or email moves a new home to Contacted (stage key 'called', kept for saved pipelines)
    if (p.stage === 'new' && (kind === 'text' || kind === 'email')) p.stage = 'called';
    p.history.unshift(e); set('pipe', all);
  }
  const RC = window.RC = {
    base,
    on(f) { subs.push(f); return () => subs.splice(subs.indexOf(f), 1); },
    // ---------- the facts every screen states (real) ----------
    // the showcase storm = the newest storm in the roofer's data (latest-storm.json, else the catalog's newest 1 in+ storm).
    // Before the catalog lands, the roofer route's storm (data/routes-dfw.js ROUTES.jackson.storm) stands in.
    _showcase: null,
    get SHOWCASE() { return RC._showcase || (window.ROUTES && ROUTES[ROOFER] && ROUTES[ROOFER].storm) || '2026-06-02'; },
    // zeros until the catalog lands (no screen states a number the data has not given)
    facts: { homes: 0, counties: 0, state: 'TX', storm: { iso: '2026-06-02', d: 'Jun 2', long: 'Tuesday, Jun 2, 2026', homes: 0, homes075: 0, max: 0 } },
    factsReady: null,
    fmt: n => Number(n || 0).toLocaleString('en-US'),
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; },

    // ---------- the roofer this tour is branded for (lib/brand.js ROOFERS) ----------
    // ?roofer=<key> on the shell or any page picks it and keeps it on this device; no param = the kept one, else jackson.
    // Frames read the same key the shell stored, so the whole app follows one roofer. lib/brand.js drops unknown keys.
    rooferKey() { return ROOFER; },
    __fixRoofer(k) { if (k && k !== ROOFER) { ROOFER = k; try { localStorage.setItem(P + 'roofer', JSON.stringify(k)); } catch (e) { } } },
    // which key a data table (ROUTES, ROOFS) holds for the active roofer (Jackson's own data only)
    dataKey() { return ROOFER; },

    // ---------- pipeline (one per device) ----------
    // 'handoff' (10-10): a homeowner who asked for a quote, handed to the roofer's owner from Ask ("Sent to Chris")
    get STAGES() { const o = ((window.ROOFERS || {})[ROOFER] || {}).owner; return [['new', 'New hit'], ['called', 'Contacted'], ['handoff', 'Sent to ' + (o || 'owner')], ['inspection', 'Inspection booked'], ['proposal', 'Proposal'], ['won', 'Won']]; },
    stage(id, dflt) { const p = get('pipe', {})[id]; return p ? p.stage : (dflt || 'new'); },
    stageName(k) { return (RC.STAGES.find(s => s[0] === k) || RC.STAGES[0])[1]; },
    history(id) { const p = get('pipe', {})[id]; return p ? p.history : []; },
    setStage(id, stage, what, extra) {
      const all = get('pipe', {}), p = all[id] = all[id] || { stage: 'new', history: [] };
      const prev = p.stage; p.stage = stage; Object.assign(p, extra || {});
      p.history.unshift({ at: new Date().toISOString(), what: what || ('Moved to ' + RC.stageName(stage)), kind: 'stage' });
      set('pipe', all); return prev;
    },
    note(id, text) { const all = get('pipe', {}), p = all[id] = all[id] || { stage: 'new', history: [] }; p.history.unshift({ at: new Date().toISOString(), what: text, kind: 'note' }); set('pipe', all); },
    booking(id) { const p = get('pipe', {})[id]; return p && p.booked || null; },
    book(id, iso, label) { RC.setStage(id, 'inspection', 'Inspection booked for ' + RC.when(iso) + (label ? ', ' + label : ''), { booked: iso }); },
    when(iso) { return new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); },
    pipeline() { return get('pipe', {}); },

    // ---------- texting hours: outreach is text and email only (no calls, 10-09) ----------
    // Texas: Bus. & Com. Code 301.051 (texts count as telephone solicitation, 302.001(7)); Wing's Texas window from
    // roof-command-clients/TEXAS-RULES.md: 9 am to 8 pm Mon to Sat, noon to 8 pm Sunday, roofer's own time zone.
    // lib/brand.js holds it per roofer (textWindow, older roofer entries still call it callWindow).
    textWindow() {
      const r = (window.ROOFERS || {})[ROOFER] || {}, w = r.textWindow || r.callWindow || { monSat: [9, 20], sun: [12, 20] }, tz = r.tz || 'America/Chicago';
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date());
      const h = +parts.find(p => p.type === 'hour').value % 24, wd = parts.find(p => p.type === 'weekday').value, sun = wd === 'Sun';
      const [open, close] = sun ? w.sun : w.monSat;
      const t = x => x === 12 ? 'noon' : (x % 12 || 12) + (x < 12 ? ' am' : ' pm');
      const same = w.sun[0] === w.monSat[0] && w.sun[1] === w.monSat[1];
      const label = same ? `${t(w.monSat[0])} to ${t(w.monSat[1])} Central` : `${t(w.monSat[0])} to ${t(w.monSat[1])} Central, Sunday ${t(w.sun[0])} to ${t(w.sun[1])}`;
      const isOpen = h >= open && h < close;
      // one plain line every screen and Nimbus use
      const line = h < open ? `Texting opens at ${t(open)}.` : h >= close ? `Texting closed at ${t(close)} and opens again at ${t(wd === 'Sat' ? w.sun[0] : w.monSat[0])}.` : `Texting is open until ${t(close)}.`;
      return { open, close, h, sun, label, line, today: `${t(open)} to ${t(close)}`, openText: t(open), closeText: t(close), nextOpenText: t(wd === 'Sat' ? w.sun[0] : w.monSat[0]), isOpen };
    },
    callWindow() { return RC.textWindow(); },   // old name, same window
    // can a person hand off a text to this home now? (opt-out, phone on file, texting hours)
    canText(id, phone) {
      if (RC.optedOut(id)) return { ok: false, reason: 'Opted out (STOP): no more texts' };
      const ph = phone !== undefined ? phone : (RC.recall(id) || {}).phone;
      if (!ph) return { ok: false, reason: 'No phone on file: email or knock' };
      const w = RC.textWindow();
      if (!w.isOpen) return { ok: false, reason: w.line.replace(/\.$/, '') };
      return { ok: true, reason: '' };
    },
    // calls logged before 10-09 (read-only records; nothing in the app starts or logs a new call)
    attempts(id) { return get('att', {})[id] || []; },

    // ---------- outreach a human did from this device (texts and emails are drafts the phone or mail app sends) ----------
    // A text is recorded when "Open in Messages" is tapped (an opted-in home), an email when a mail draft is opened.
    // Both go on the home's pipeline history, so the Home timeline shows them.
    // extra (optional): { body, to, subject, scheduled } = the words the user actually opened, kept with the record
    // so the Today map's popover can show exactly what went out. Records from before this have no body.
    logText(id, what, extra) { logOut(id, 'text', what || 'Text drafted in Messages', extra); },
    logEmail(id, what, extra) { logOut(id, 'email', what || 'Email drafted', extra); },
    // A homeowner's reply, recorded by the rep (pasted from their phone or mail, or what they said): dir 'in', so it
    // never counts as a touch (the cadence and the map's beams read outbound records only). ch 'text' | 'email'.
    logReply(id, body, ch) {
      const all = get('pipe', {}), p = all[id] = all[id] || { stage: 'new', history: [] };
      p.history.unshift({ at: new Date().toISOString(), what: 'Reply from the homeowner', kind: ch === 'email' ? 'email' : 'text', dir: 'in', body: String(body || '').slice(0, 4000) });
      set('pipe', all);
    },
    // Opt-out (a STOP reply, or the homeowner asked in person): no more texts, no follow-up cadence, no Daily 50 slot.
    // Kept on this device as { id: { at, how } }; a texting provider's STOP webhook would call RC.optOut(id, 'STOP').
    // RC.optOut(id, how, false) undoes it (the homeowner opted back in). Both go on the home's history.
    optedOut(id) { return !!get('optout', {})[id]; },
    optOut(id, how, on) {
      const all = get('optout', {}), off = on === false;
      if (off ? !all[id] : all[id]) return false;
      if (off) delete all[id]; else all[id] = { at: new Date().toISOString(), how: String(how || 'STOP').slice(0, 40) };
      set('optout', all);
      RC.note(id, off ? 'Opted back in to texts' : 'Opted out (' + (how || 'STOP') + '): no more texts or follow-ups');
      return true;
    },
    // Every home contacted on this device: one entry per home and channel, newest contact time, oldest first.
    // RC.contacted() = today only; RC.contacted({all:true}) = every day kept on this device.
    // -> [{ id, gi, loc:[lng,lat]|null, channel:'text'|'email', at, count }]
    contacted(opts) {
      opts = opts || {};
      const day = new Date().toDateString(), keep = at => opts.all || new Date(at).toDateString() === day, m = {};
      const put = (id, channel, at) => { if (!at || !keep(at)) return; const k = id + '|' + channel, e = m[k];
        if (e) { e.count++; if (at > e.at) e.at = at; } else m[k] = { id, channel, at, count: 1 }; };
      const pipe = get('pipe', {}); Object.keys(pipe).forEach(id => ((pipe[id] && pipe[id].history) || []).forEach(h => {
        if (h.dir === 'in') return;   // a reply logged by the rep is not something this device sent
        if (h.kind === 'text' || (h.kind === 'note' && /^Text (drafted|opened|sent)/.test(h.what || ''))) put(id, 'text', h.at);
        else if (h.kind === 'email' || (h.kind === 'note' && /^Email (drafted|opened|sent)/.test(h.what || ''))) put(id, 'email', h.at);
      }));
      const homes = get('homes', {});
      return Object.values(m).map(e => { const r = homes[e.id] || {};
        return Object.assign(e, { gi: r.gi != null ? r.gi : null, loc: isFinite(r.lon) && isFinite(r.lat) ? [+r.lon, +r.lat] : null }); })
        .sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
    },

    // Every record on this device's pipeline histories, newest first (the Today inbox reads this).
    // -> [{ id, at, ch:'call'|'text'|'email'|'booking'|'note'|'stage', what, dir:'out'|'in' }]
    // Old call lines (before 10-09) still read as ch 'call' records; nothing new makes one. Nothing inbound exists until a texting
    // provider writes entries with dir:'in'.
    activity() {
      const out = [], pipe = get('pipe', {});
      Object.keys(pipe).forEach(id => ((pipe[id] && pipe[id].history) || []).forEach(h => {
        const w = h.what || '';
        const ch = h.kind === 'text' || /^Text (drafted|opened|sent)/.test(w) ? 'text'
          : h.kind === 'email' || /^Email (drafted|opened|sent)/.test(w) ? 'email'
          : /^(Called|Wrong number|Call note)/.test(w) ? 'call'
          : /^Inspection booked/.test(w) ? 'booking'
          : h.kind === 'note' ? 'note' : 'stage';
        if (h.at) out.push(Object.assign({ id, at: h.at, ch, what: w, dir: h.dir === 'in' ? 'in' : 'out' },
          h.body != null ? { body: h.body } : {}, h.subject != null ? { subject: h.subject } : {}, h.to != null ? { to: h.to } : {},
          h.outcome != null ? { outcome: h.outcome } : {}, h.note != null ? { note: h.note } : {}, h.scheduled != null ? { scheduled: h.scheduled } : {}));
      }));
      return out.sort((a, b) => a.at < b.at ? 1 : a.at > b.at ? -1 : 0);
    },

    // ---------- scheduled texts: REMINDERS, not sends ----------
    // No texting provider is connected, so nothing ever sends on its own. A scheduled text is a reminder kept on this
    // device: at its time the Today screen says "Time to send" and opens the draft in Messages, and it is recorded as
    // sent only when the user confirms. Only opted-in homes and past customers can be scheduled (no automated texts to
    // cold homeowners), and only inside the roofer's texting hours (RC.textWindow, roofer time zone).
    // -> [{ sid, id, due (ISO), body, to, created }] oldest due first; one per home (a new one replaces the old)
    scheduled() { return get('sched', []).filter(s => s && s.sid && s.id && s.due).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0); },
    scheduledFor(id) { return RC.scheduled().find(s => s.id === id) || null; },
    canSchedule(id) {
      const h = RC.recall(id) || {};
      if (RC.optedOut(id)) return { ok: false, reason: 'This homeowner opted out (STOP). No more texts.' };
      if (!(h.optin || h.optIn || h.past || h.pastCustomer)) return { ok: false, reason: 'Scheduling is only for homeowners who opted in to texts, or past customers. No automated texts to cold homeowners: send their text by hand from Today.' };
      if (!h.phone) return { ok: false, reason: 'No phone on file for this home.' };
      return { ok: true, reason: '' };
    },
    // is this moment inside the texting hours, in the roofer's own time zone?
    inTextWindow(d) {
      const r = (window.ROOFERS || {})[ROOFER] || {}, w = r.textWindow || r.callWindow || { monSat: [9, 20], sun: [12, 20] };
      const tz = r.tz || 'America/Chicago', f = TWF[tz] || (TWF[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' }));
      const ps = f.formatToParts(new Date(d));
      const g = t => (ps.find(p => p.type === t) || {}).value, m = (+g('hour') % 24) * 60 + +g('minute'), [o, c] = g('weekday') === 'Sun' ? w.sun : w.monSat;
      return m >= o * 60 && m < c * 60;
    },
    // every 15 minute send time inside the window over the next `days` days, grouped by the roofer's local day
    // -> [{ key, label, times: [ISO...] }]
    textSlots(days) {
      const r = (window.ROOFERS || {})[ROOFER] || {}, tz = r.tz || 'America/Chicago', out = [], by = {}, Q = 9e5;
      const dk = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
      for (let t = Math.ceil((Date.now() + 6e4) / Q) * Q, end = Date.now() + (days || 7) * 864e5; t < end; t += Q) {
        if (!RC.inTextWindow(t)) continue; const k = dk.format(t);
        if (!by[k]) { by[k] = { key: k, label: k, times: [] }; out.push(by[k]); } by[k].times.push(new Date(t).toISOString());
      }
      return out;
    },
    // default send time: 15 minutes from now when the window is open, else the next window opening
    defaultSendTime() {
      const all = [].concat(...RC.textSlots(8).map(d => d.times)), soon = Date.now() + 15 * 6e4;
      return (RC.inTextWindow(Date.now()) && all.find(t => Date.parse(t) >= soon - 1000)) || all[0] || null;
    },
    scheduleText(id, due, body, to) {
      if (!RC.canSchedule(id).ok || !due || !RC.inTextWindow(due)) return null;
      const l = get('sched', []).filter(s => s && s.id !== id), sid = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const it = { sid, id, due: new Date(due).toISOString(), body: String(body || '').slice(0, 1600), to: to || (RC.recall(id) || {}).phone || '', created: new Date().toISOString() };
      l.push(it); set('sched', l); return it;
    },
    cancelScheduled(sid) { const l = get('sched', []), it = l.find(s => s && s.sid === sid); set('sched', l.filter(s => s && s.sid !== sid)); return it || null; },
    restoreScheduled(it) { if (!it || !it.sid) return; const l = get('sched', []).filter(s => s && s.sid !== it.sid && s.id !== it.id); l.push(it); set('sched', l); },
    // the user confirmed they sent it from their phone: the reminder goes, the text goes on the record with its words
    markScheduledSent(sid, body) {
      const it = RC.cancelScheduled(sid); if (!it) return null;
      RC.logText(it.id, 'Text sent from your phone (scheduled reminder)', { body: body != null ? body : it.body, to: it.to, scheduled: it.due });
      return it;
    },
    // "Sends in 1h 12m" | "Sends in 14m 05s" | "Time to send"; fmt 'short' drops the seconds and the verb
    countdown(due, fmt) {
      const ms = Date.parse(due) - Date.now();
      if (!(ms > 0)) return fmt === 'short' ? 'due now' : 'Time to send';
      const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
      if (fmt === 'short') return 'in ' + (h ? h + 'h ' + m + 'm' : m ? m + 'm' : 'under 1m');
      return 'Sends in ' + (h ? h + 'h ' + m + 'm' : m ? m + 'm ' + String(ss).padStart(2, '0') + 's' : ss + 's');
    },

    // ---------- Daily 50 additions from the storm map / Nimbus (the deck's own 50 stay in dk.js) ----------
    added() { return get('added', []); },           // [{ id, addr, county, lon, lat, hail, from }]
    isAdded(id) { return RC.added().some(a => a.id === id); },
    add(home) { const l = RC.added(); if (l.some(a => a.id === home.id)) return false; l.push(home); set('added', l); return true; },
    unadd(id) { set('added', RC.added().filter(a => a.id !== id)); },
    // home details any screen saw last, so Home can show a map-picked home: { id: {addr, county, hail, lon, lat, sq, ...} }
    queue(n) { if (n != null) set('queue', n); return get('queue', 50); },   // stops in today's Daily 50 queue (the deck sets it)
    remember(home) { const m = get('homes', {}); m[home.id] = Object.assign(m[home.id] || {}, home); set('homes', m); },
    recall(id) { return get('homes', {})[id] || null; },

    // ---------- navigation between screens. Inside the tour shell this switches tabs and keeps Back working. ----------
    // RC.go('home', {id}) | RC.go('daily', {n}) | RC.go('storm', {iso}) | RC.go('ask', {q})
    go(screen, params) {
      params = params || {};
      if (window.parent && window.parent !== window) { window.parent.postMessage({ type: 'go', screen, params }, location.origin); return; }
      const page = { storm: '1b-storm-theater.html', daily: 'c4-command-deck/deck.html', home: 'c5-home/index.html', ask: 'c2-nimbus/index.html' }[screen];
      const q = Object.assign({}, params); if (screen === 'home' && q.id != null) { q.home = q.id; delete q.id; }
      if (page) location.href = base + page + '?' + new URLSearchParams(q).toString();
    }
  };
  // real counts from the catalog (same file the storm map draws from), so a rebuild of the data updates every screen.
  // The catalog is the active roofer's (lib/brand.js dataRoot): brand.js loads right after this file and calls
  // RC.__dataRoot(); a page without brand.js falls back to lib/st-data-dfw/ at DOMContentLoaded.
  const dlong = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  // "Aug 12" this year, "Aug 12, 2025" any other year (Nimbus's chips, updates and answers name the storm by this)
  const dshort = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + (iso.slice(0, 4) === String(new Date().getFullYear()) ? '' : ', ' + iso.slice(0, 4));
  let startFacts = null;
  RC.factsReady = new Promise(res => { startFacts = root => { if (!startFacts) return; startFacts = null;
    RC.dataRoot = root || (base + 'lib/st-data-dfw/');
    // the storm every screen defaults to = the NEWEST storm (Jack 10-09): the storm watcher's latest-storm.json when the
    // catalog has it, else the catalog's newest 1 in+ storm. Both fetched no-store so a new storm shows the day it lands.
    const J = u => fetch(RC.dataRoot + u, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
    res(Promise.all([J('catalog.json'), J('latest-storm.json')]).then(([c, latest]) => {
      if (!c) return RC.facts;
      RC.catalog = c; RC.latestStorm = latest || null;
      const hit = c.storms.filter(x => x.homes_1in > 0).map(x => x.date).sort();
      RC._showcase = latest && latest.iso && c.storms.some(x => x.date === latest.iso) ? latest.iso : hit.length ? hit[hit.length - 1] : (c.default_storm && c.default_storm.date) || RC._showcase;
      const s = c.storms.find(x => x.date === RC.SHOWCASE);
      RC.facts.homes = c.total; RC.facts.counties = c.regions.length; RC.facts.state = c.state || 'TX';
      if (s) Object.assign(RC.facts.storm, { iso: s.date, d: dshort(s.date), long: dlong(s.date), homes: s.homes_1in, homes075: s.homes_075, max: s.max_in });
      return RC.facts;
    }).catch(() => RC.facts)); }; });
  RC.__dataRoot = (root, own) => {
    // no numbers until the catalog lands, so no screen states one the data has not given
    if (own) { RC.facts.homes = 0; RC.facts.counties = 0; RC.facts.state = ''; const iso = RC.SHOWCASE;
      RC.facts.storm = { iso, d: dshort(iso), long: dlong(iso), homes: 0, homes075: 0, max: 0 }; }
    startFacts && startFacts(root);
  };
  // fallback only once every parser script has run (a timer could fire while brand.js is still downloading)
  const fallback = () => startFacts && startFacts(null);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fallback); else setTimeout(fallback, 0);

  // ---------- owner names (private: county tax roll) ----------
  // RC.owner(gi) -> Promise<{name, homestead} | null>. gi = global home index into the roofer's homes.bin.
  // Only for a roofer with its own data (lib/brand.js dataRoot), only when signed in or in local dev, never in the
  // public demo build. Sources, in order:
  //   1. Supabase private Storage bucket `owners`, object <region>.json, read with the signed-in user's JWT
  //      (RLS by company_regions). Same project + anon key as lib/auth.js; session = localStorage "rc.session".
  //   2. Local dev only (localhost): <dataRoot>private/<region>.json (git-ignored, written by scripts/dfw/owners_dfw.py).
  // Format of both: {"names": [one per region row, "" if none], "homestead": [1/0 per row]}.
  // Kept in memory only (never localStorage, never the service worker: sw.js passes these requests straight through).
  // Nothing loaded -> null, and screens say "Owner not loaded".
  const PUBLIC_BUILD = true /*@RC_PUBLIC_BUILD@*/;
  const SB = { URL: 'https://wbtrsujvprbdojmxlkpe.supabase.co',
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidHJzdWp2cHJiZG9qbXhsa3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjc0MzcsImV4cCI6MjEwNjY0MzQzN30.rzSf_wXbb9W0uajLg_5Ur04VyobSwgz3pLXgFSyG_5I' };
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname);
  const isPublic = () => { if (PUBLIC_BUILD) return true; try { if (window.RCT_AUTH && RCT_AUTH.public) return true; if (window.top.RCT_AUTH && window.top.RCT_AUTH.public) return true; } catch (e) { } return false; };
  const sess = () => { try { const v = JSON.parse(localStorage.getItem('rc.session') || 'null'); return v && v.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000) ? v : null; } catch (e) { return null; } };
  // same local dev switch as lib/auth.js (?dev=1 / ?dev=0 on localhost, this tab only), so a screen opened on its own honours it
  if (!PUBLIC_BUILD && LOCAL) try { const dq = new URLSearchParams(location.search).get('dev'); if (dq === '1') sessionStorage.setItem('rc.dev', '1'); else if (dq === '0') sessionStorage.removeItem('rc.dev'); } catch (e) { }
  const devOn = () => { try { return LOCAL && sessionStorage.getItem('rc.dev') === '1'; } catch (e) { return false; } };
  const ownersP = {}, ownersD = {};
  function regionOwners(rid) {
    if (ownersP[rid]) return ownersP[rid];
    const s = sess(), ok = d => d && Array.isArray(d.names) ? d : null;
    const cloud = s ? fetch(`${SB.URL}/storage/v1/object/authenticated/owners/${encodeURIComponent(rid)}.json`, { cache: 'no-store', headers: { apikey: SB.KEY, Authorization: 'Bearer ' + s.access_token } })
      .then(r => r.ok ? r.json() : null).then(ok).catch(() => null) : Promise.resolve(null);
    return (ownersP[rid] = cloud.then(d => d || (LOCAL && (s || devOn()) ? fetch(RC.dataRoot + 'private/' + encodeURIComponent(rid) + '.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null).then(ok).catch(() => null) : null)).then(d => (ownersD[rid] = d || null)));
  }
  RC.ownersAllowed = () => {
    const r = (window.ROOFERS || {})[ROOFER];
    return !!(r && r.dataRoot) && !isPublic() && (!!sess() || devOn());
  };
  // The roll prints people surname first ("Appel Noelle", "Reznitsky Igor & Alexandra Reznitsky", "Shaw Jimmie R").
  // RC.ownerDisplay turns that into how a person writes their name ("Noelle Appel", "Igor & Alexandra Reznitsky",
  // "Jimmie R Shaw"); a company, trust, estate or church stays in its own order. The raw string rides along as .raw.
  const BIZ_WORD = /\b(llc|l l c|inc|trust|trustee|trustees|tr|estate|estates|lp|llp|lllp|pllc|ltd|corp|corporation|co|company|bank|partners|partnership|holdings|properties|investments|association|assn|hoa|church|ministries|city of|county|isd|homes|realty|fund|foundation|revocable|living|family|group|ventures|enterprises|rentals?|dba|et ?al|etal)\b/i;
  const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
  const UPPER = /^(llc|inc|lp|llp|lllp|pllc|ltd|hoa|isd|ii|iii|iv|dba)$/i;
  const cap = w => UPPER.test(w) ? w.toUpperCase() : w.length === 1 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase().replace(/^(mc|o')(\w)/, (m, a, b) => a + b.toUpperCase());
  const words = s => String(s || '').trim().replace(/[,.]+/g, ' ').split(/\s+/).filter(Boolean);
  // one "Surname First Middle" chunk -> "First Middle Surname" (+ Jr); returns { out, sur }
  function person(chunk) {
    const w = words(chunk).map(cap); if (!w.length) return { out: '', sur: '' };
    const suf = w.length > 2 && SUFFIX.test(w[w.length - 1]) ? w.pop() : '';
    if (w.length === 1) return { out: w[0], sur: w[0] };
    const sur = w[0], rest = w.slice(1);
    return { out: rest.join(' ') + ' ' + sur + (suf ? ' ' + suf : ''), sur };
  }
  RC.ownerDisplay = raw => {
    const s = String(raw || '').trim(); if (!s) return '';
    if (BIZ_WORD.test(s)) return words(s).map(cap).join(' ');
    const parts = s.split(/\s*(?:&|\band\b)\s*/i).filter(Boolean);
    const a = person(parts[0]); if (parts.length === 1) return a.out;
    // the spouse is written "First Last" or just "First": drop a repeated surname, then share the first one's
    const first = words(parts[0]).map(cap).slice(1).join(' ') || a.out;
    const b = parts.slice(1).map(p => { const w = words(p).map(cap); if (w.length > 1 && w[w.length - 1].toLowerCase() === a.sur.toLowerCase()) w.pop(); return w; });
    // a spouse with a different surname ("Smith Bob & Jane Doe") keeps it: "Bob Smith & Jane Doe"
    if (b.some(w => w.length > 1 && w[w.length - 1].length > 1 && !SUFFIX.test(w[w.length - 1]))) return a.out + ' & ' + b.map(w => w.join(' ')).join(' & ');
    return first + ' & ' + b.map(w => w.join(' ')).join(' & ') + ' ' + a.sur;
  };
  // name as the roll prints it ("Rudloff, Paula Jean"); a trust or company stays as written
  RC.owner = gi => {
    if (!RC.ownersAllowed() || !(gi >= 0)) return Promise.resolve(null);
    return RC.factsReady.then(() => {
      const c = RC.catalog; if (!c) return null;
      let reg = null; for (let k = c.regions.length - 1; k >= 0; k--) if (gi >= c.regions[k].offset) { reg = c.regions[k]; break; }
      if (!reg || gi >= reg.offset + reg.count) return null;
      return regionOwners(reg.id).then(d => { const j = gi - reg.offset, n = d && d.names[j]; return n ? { name: RC.ownerDisplay(n), raw: n, homestead: !!(d.homestead && d.homestead[j]), region: reg.id } : null; });
    });
  };
  RC.OWNER_NONE = 'Owner not loaded';
  // synchronous read for long lists: the name when that region's file is already in memory, else null
  RC.ownerNow = gi => { const c = RC.catalog; if (!c || !RC.ownersAllowed()) return null;
    for (let k = c.regions.length - 1; k >= 0; k--) if (gi >= c.regions[k].offset) { const d = ownersD[c.regions[k].id]; return d ? (RC.ownerDisplay(d.names[gi - c.regions[k].offset]) || null) : null; } return null; };
  // load every owner region once (a list asks for this); resolves true when at least one region has names
  RC.ownersWarm = () => !RC.ownersAllowed() ? Promise.resolve(false) : RC.factsReady.then(() => RC.catalog ? Promise.all(RC.catalog.regions.map(r => regionOwners(r.id))).then(a => a.some(Boolean)) : false);
})();
