/* Home record: who, where, stage, calls, texts, booking, notes. Plain script, runs before home.js (the 3D).
   Reads ?home=<id> (or ?id=, what RC.go('home') writes). 'd<roofer>-<n>' = Daily 50 stop n, 'm<i>' = storm map pick,
   no id = stop 1 of today's route. House facts are real: county address, radar hail, reroof permits, roof from the
   building outline (lib/st-meta.js, data/routes-dfw.js). People, phones and opt-ins are sample, labelled.
   Nothing here sends and nothing starts a call (10-09: outreach is text and email only). Text = an sms: draft a human
   sends inside the roofer's texting hours (RC.canText); Email = a mailto: draft from lib/rc-copy.js. */
(function () {
  'use strict';
  // inside the tour shell the shell is the one roofer-branded header, so this page drops its own bar
  try { if (window.self !== window.top) document.documentElement.classList.add('embedded'); } catch (e) { document.documentElement.classList.add('embedded'); }
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const embedded = document.documentElement.classList.contains('embedded');
  const STORM = RC.facts.storm; // the catalog's default storm (Jackson: Jun 2, 2026)
  // default house: stop 1 of today's route (a real home, data/routes-dfw.js); its phone is sample like every phone here
  // the active roofer (lib/brand.js, ?roofer= / rc-state) brands this page; the house data is whichever route is loaded
  const B = activeRoofer();
  const AC = B.areaCode || '972';
  const DEF = rooferKey(), dataKey = () => DEF;                           // Jackson's own route only
  const stateOf = k => ((window.ROOFERS || {})[k] || {}).state || 'TX';    // state of the addresses on screen (the data's)
  const stop1 = () => { const r = window.ROUTES && ROUTES[DEF], s = r && r.stops[0]; return s ? { addr: s.num + ' ' + s.name, place: `${s.city}, ${stateOf(DEF)} ${s.zip}`, city: s.city, zip: s.zip, hail: s.hail, fp: s.fp, lon: s.loc[0], lat: s.loc[1], county: s.county || '', storm: (r.storm || STORM.iso), gi: s.gi != null ? s.gi : null, subdivision: s.subdivision || null, sqft: s.living_sqft || null, phone: `(${AC}) 555-0118`, dk: DEF } : { addr: 'Stop 1 of 50' }; };
  // a storm day carries its year when the storm was not this year: "Aug 12, 2025" in sentences, "Aug 12 ’25" in tight
  // spots (stage strip, board cards); this year's storms stay "Jun 2"
  const sday = (iso, short) => { iso = String(iso || ''); if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso;
    const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'), y = d.getUTCFullYear(), md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return y === new Date().getFullYear() ? md : short ? md + ' ’' + String(y).slice(2) : md + ', ' + y; };
  window.homeDay = sday;   // pipe.js: the same storm day on the board cards
  const hailDay = v => { if (!v) return sday(STORM.iso); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return sday(v); return v; };
  // a roofer with its own data (lib/brand.js dataRoot; Jackson): CAD address line + subdivision in the header, the real
  // owner from RC.owner (private county roll) instead of a sample name, "Owner not loaded" when it is not available
  const OWNDATA = !!B.dataRoot;
  const LIC = B.licence ? 'Licence ' + B.licence + ' (sample)' : '';   // Texas has no roofing licence: no licence line at all
  const REP = B.owner, CO = B.name;
  // per-home state; load() swaps it in place when the shell routes to another home (no page reload)
  let rawId, dm, mm, kind, id, rec, n, roofer, hail, hailTxt, place, tel, first, optin, dflt;
  const defId = () => { const r = window.ROUTES && ROUTES[DEF]; return r && r.stops && r.stops.length ? 'd' + DEF + '-1' : ''; };
  function load(newId) {
    rawId = newId || defId();
    dm = /^d([a-z]+)-(\d+)$/.exec(rawId); mm = /^m(\d+)$/.exec(rawId);
    kind = dm ? 'daily' : mm ? 'map' : 'sample';
    id = rawId || 'c5-sample';
    const got = rawId ? RC.recall(rawId) : null;
    rec = Object.assign({}, !rawId || rawId === defId() ? stop1() : {}, got || {});
    if (rawId && !got) rec.addr = dm ? 'Stop ' + dm[2] + ' of 50' : 'Home from the storm map';
    const rk = dm ? dataKey(dm[1]) : rec.dk || DEF;
    const rs = dm && window.ROUTES && ROUTES[rk] ? ROUTES[rk].stops[+dm[2] - 1] : null; // the stop itself (real home)
    if (rs) Object.assign(rec, { gi: rs.gi != null ? rs.gi : rec.gi, subdivision: rs.subdivision || rec.subdivision, sqft: rs.living_sqft || rec.sqft, addr: rs.num + ' ' + rs.name, city: rs.city, zip: rs.zip, place: rs.city ? `${rs.city}, ${stateOf(rk)} ${rs.zip}` : rec.place, hail: rs.hail != null ? rs.hail : rec.hail, fp: rs.fp, lon: rs.loc[0], lat: rs.loc[1], storm: (ROUTES[rk].storm || STORM.iso) });
    n = dm ? +dm[2] : 0; roofer = dm ? dm[1] : DEF;
    hail = rec.hail != null && rec.hail !== '' && !isNaN(+rec.hail) ? +rec.hail : null;
    hailTxt = hail != null ? hail.toFixed(2) + ' in' : 'Hail size not on file';
    const st = mm ? B.state : stateOf(rk);   // storm map homes come from the roofer's own data
    if (OWNDATA) { rec.person = null; rec.owner = null; }   // never a sample name on a home whose real owner can be loaded
    place = rec.place || (rec.city ? rec.city + ', ' + st : rec.county ? rec.county + ' County, ' + st : st);
    const digits = String(rec.phone || '').replace(/\D/g, '');
    tel = digits.length === 10 ? '+1' + digits : digits.length === 11 ? '+' + digits : '';
    first = rec.person ? String(rec.person).split(/\s+/)[0] : '';
    optin = !!(rec.optin || rec.optIn || rec.optedIn || rec.past || rec.pastCustomer || rec.customer);
    rec.customer = !!(rec.past || rec.pastCustomer || rec.customer);
    dflt = 'new';   // stage always comes from the shared pipeline (RC.stage); a clean device shows New hit
    // shared with home.js (3D): the roof spec if the Daily 50 drew one, and this home's hail
    window.HOME = { id, rawId, kind, rec, hail, hailTxt, hailDate: hailDay(rec.storm), spec: rec.spec && rec.spec.planes ? rec.spec : null };
    // the county record for this home (address, zip, year built, reroof permit, LiDAR pitch), then re-render
    // county facts: a storm map pick's own index, or a Daily 50 stop's gi (its row in lib/st-data-dfw)
    const gi = mm ? +mm[1] : rec.gi != null ? +rec.gi : null, me = rawId;
    if (OWNDATA && gi != null) RC.owner(gi).then(o => { if (me !== rawId || !o) return; rec.owner = o.name; rec.homestead = o.homestead;
      first = ownerFirst(o.name); if (window.renderRecord) window.renderRecord(); });
    window.HOME_READY = gi != null && window.STM ? STM.facts(gi, rec.lon, rec.lat).then(f => {
      if (me !== rawId) return;
      if (f.addr) { rec.addr = f.addr; rec.place = f.place; }
      if ((rec.lon == null || rec.lat == null) && isFinite(f.lon) && isFinite(f.lat)) { rec.lon = f.lon; rec.lat = f.lat; }   // opened cold by id
      Object.assign(rec, { subdivision: f.subdivision || rec.subdivision, sqft: f.sqft || rec.sqft, year: f.year, permit: f.permit, roofAge: f.roofAge, pitchNote: f.pitch.note, county: f.county || rec.county });
      place = rec.place || place; if (window.renderRecord) window.renderRecord();
    }).catch(() => {}) : Promise.resolve();
  }
  // "Rudloff, Paula Jean" -> "Paula"; a trust, company or LLC gives no first name
  function ownerFirst(n) { n = String(n || ''); if (/(trust|llc|inc|ltd|lp|co|company|estate|bank|homes|properties)/i.test(n)) return '';
    const m = /^[^,]+,\s*([A-Za-z'-]+)/.exec(n); const w = m ? m[1] : n.split(/\s+/)[0]; return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; }
  const urlId = () => { const q = new URLSearchParams(location.search); return q.get('home') || q.get('id') || ''; };
  load(urlId());

  // ---------- icons ----------
  const I = {
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 0 0 6.9 6.9l1.3-2 4 1.6V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    hail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="3"/><circle cx="16.5" cy="9" r="4"/><circle cx="16" cy="18.5" r="1.6"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4M10 12h5M10 15.5h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19.5h14M14.5 5.5l3 3L9 17H6v-3z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    roof: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12 12 4.5 21 12M6 10v9.5h12V10"/></svg>'
  };
  const ic = k => `<span class="ic">${I[k]}</span>`;

  // ---------- header bits (per home) ----------
  const crumb = $('#crumb'), stopnav = $('#stopnav');
  function renderHead() {
  document.title = (window.crmView && crmView() !== 'home' ? 'CRM' : rec.addr) + ' | Roof Command';
  if (kind === 'daily') crumb.innerHTML = `<button type="button" class="lnk" data-go="daily">Daily 50</button><span>/</span>Stop ${n}<span>/</span><em>${esc(rec.addr)}</em>`;
  else if (kind === 'map') crumb.innerHTML = `<button type="button" class="lnk" data-go="storm">Storm map</button><span>/</span><em>${esc(rec.addr)}</em>`;
  else crumb.innerHTML = `${esc(sday(STORM.iso))} hit list<span>/</span><em>${esc(rec.addr)}</em>`;
  $('#addr').textContent = OWNDATA && place && rec.addr && !/^(Stop|Home from)/.test(rec.addr) ? rec.addr + ', ' + place : rec.addr;
  stopnav.hidden = kind === 'sample'; stopnav.innerHTML = '';
  if (kind === 'daily') {
    stopnav.hidden = false;
    const Q = RC.queue();
    stopnav.innerHTML = `<button type="button" data-go="daily">${ic('back')}<span class="lng">Back to </span>Daily 50</button><span>Stop ${n} of ${Q}</span>` + (n < Q ? `<button type="button" data-go="next">Next<span class="lng"> stop</span>${ic('next')}</button>` : '');
  }
  else if (kind === 'map') { stopnav.hidden = false;   // a home with a thread came from the CRM inbox; one without came from the storm map
    const inInbox = window.crmView && RC.history(id).length > 0;
    stopnav.innerHTML = inInbox ? `<button type="button" data-go="inbox">${ic('back')}Back to inbox</button>` : `<button type="button" data-go="storm">${ic('back')}Back to storm map</button>`; }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    const g = b.dataset.go;
    if (g === 'inbox') { if (window.crmSetView) window.crmSetView('inbox', false, rawId); return; }
    if (g === 'daily') RC.go('daily', { n });
    else if (g === 'storm') RC.go('storm', { iso: STORM.iso });
    else if (g === 'next') switchTo('d' + roofer + '-' + (n + 1));
  });

  // ---------- switch home in place: shell route messages, Next stop, browser Back ----------
  // The CRM (crm.js) owns the view: 'inbox' (three panes), 'pipeline' (the board) or 'home' (this record). Every route
  // this page announces carries the view with the id, so the shell's URL (#/crm/inbox/<id>, #/crm/home/<id>) stays true.
  const curView = () => (window.crmView ? window.crmView() : 'home');
  function announce(push) {
    const view = curView(), u = new URL(location.href); u.searchParams.delete('id');
    if (rawId) u.searchParams.set('home', rawId); else u.searchParams.delete('home');
    u.searchParams.set('view', view);
    try { if (embedded || !push) history.replaceState({ home: rawId, view }, '', u); else history.pushState({ home: rawId, view }, '', u); } catch (e) { }
    if (embedded) window.parent.postMessage({ type: 'route', screen: 'home', params: { id: rawId, view } }, location.origin);
  }
  window.homeAnnounce = announce;
  function switchTo(newId, quiet) {
    newId = newId || defId();
    if (newId === rawId) return;
    if (dlg.open) dlg.close();
    toast.hidden = true; filter = 'all';
    load(newId); renderAll();
    if (window.__switchHome) window.__switchHome();
    if (quiet) return;
    announce(true);
  }
  window.switchHome = switchTo;
  addEventListener('message', e => {
    if (e.origin !== location.origin) return; const d = e.data || {};
    if (d.type === 'route' && (!d.screen || d.screen === 'home')) {
      d.params = d.params || {}; d.params.id = d.params.id || '';   // no id = the default house
      if (d.token && e.source) try { e.source.postMessage({ type: 'routed', token: d.token }, e.origin); } catch (err) { }
      switchTo(d.params.id, true);
      if (window.crmSetView) window.crmSetView(d.params.view || (d.params.id ? 'home' : 'inbox'), true, d.params.id);
      try { const u = new URL(location.href); u.searchParams.delete('id'); if (d.params.id) u.searchParams.set('home', d.params.id); else u.searchParams.delete('home'); u.searchParams.set('view', curView()); history.replaceState({ home: d.params.id, view: curView() }, '', u); } catch (err) { }
    }
  });
  addEventListener('popstate', () => { const q = new URLSearchParams(location.search); switchTo(urlId(), true); if (window.crmSetView) window.crmSetView(q.get('view') || (urlId() ? 'home' : 'inbox'), true, urlId()); if (embedded) window.parent.postMessage({ type: 'route', screen: 'home', params: { id: urlId(), view: curView() } }, location.origin); });

  // ---------- toast with Undo ----------
  const toast = $('#toast'); let toastT = 0;
  window.homeSay = (m, u) => say(m, u);   // the pipeline board (pipe.js) uses the same toast and Undo
  function say(msg, undo) {
    toast.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button">Undo</button>' : '');
    toast.hidden = false; clearTimeout(toastT);
    if (undo) toast.querySelector('button').onclick = () => { undo(); toast.hidden = true; };
    toastT = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  // ---------- dialog (text draft, email draft, booking, more) ----------
  const dlg = $('#dlg'), dlgBody = $('#dlgBody'), dlgTitle = $('#dlgTitle');
  function open(title, html, wire) {
    dlgTitle.textContent = title; dlgBody.innerHTML = html;
    if (!dlg.open) dlg.showModal();
    if (wire) wire(dlgBody);
  }
  $('#dlgClose').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  // ---------- text ----------
  function draft() {
    return `Hi${first ? ' ' + first : ''}, this is ${REP} with ${CO}. The ${sday(STORM.iso)} storm dropped hail on your street. Want a free roof check this week?${LIC ? ' ' + LIC + '.' : ''} Reply STOP to opt out.`;
  }
  function textDlg() {
    const c = RC.canText(id, tel || null), can = c.ok;
    open('Text draft', `<p class="dl">${optin ? (rec.customer ? 'Past customer, texts allowed.' : 'Opted in to texts.') : 'Cold homeowner: you send it yourself from your phone, one home at a time.'} ${esc(RC.textWindow().line)}</p>
      <textarea id="smsBody" rows="4" class="draft">${esc(draft())}</textarea>
      <div class="drow">${can ? `<a class="pbtn" id="smsGo" href="#">${ic('text')}Open in Messages</a>` : `<button type="button" class="pbtn" disabled>${ic('text')}${esc(c.reason)}</button>`}<button type="button" id="smsCopy">Copy draft</button></div>`, body => {
      const go = body.querySelector('#smsGo');
      if (go) go.onclick = () => { go.href = 'sms:' + tel + '?&body=' + encodeURIComponent(body.querySelector('#smsBody').value); (RC.logText ? RC.logText(id, 'Text opened in Messages') : RC.note(id, 'Text opened in Messages')); setTimeout(() => dlg.close(), 50); };
      body.querySelector('#smsCopy').onclick = () => { try { navigator.clipboard.writeText(body.querySelector('#smsBody').value); } catch (e) { } say('Draft copied.'); };
    });
  }
  document.querySelectorAll('[data-act="text"]').forEach(b => b.onclick = textDlg);

  // ---------- email: the outreach library's draft (lib/rc-copy.js), a mailto: hand-off; held back honestly ----------
  function emailDlg() {
    const C = RC.copy, f = C ? C.factsFromStop(rec, { id, street: rec.addr ? String(rec.addr).split(',')[0] : '', stormISO: rec.storm || STORM.iso, optedOut: RC.optedOut(id) }) : null;
    const r = C ? C.next(f, 0, optin ? 'optin' : 'cold', 'email') : { blocked: 'no outreach library' };
    const ok = !!r.body && !r.blocked;
    const why = r.blocked === 'opted out' ? 'This homeowner opted out. No more emails.' : r.missing && r.missing.includes('mailingAddress') ? 'Add your mailing address to send emails.' : r.blocked ? 'Email is held back: ' + r.blocked + '.' : '';
    open('Email draft', `<p class="dl">No email address on file for this homeowner: you add it in your mail app.</p>
      ${r.body ? `<input id="mSubj" class="draft" value="${esc(r.subject || '')}" aria-label="Subject"><textarea id="mBody" rows="7" class="draft" aria-label="Email">${esc(r.body)}</textarea>` : ''}
      ${why ? `<p class="dl">${esc(why)}</p>` : ''}
      <div class="drow">${ok ? `<a class="pbtn" id="mGo" href="#">${ic('mail')}Open in Mail</a>` : `<button type="button" class="pbtn" disabled>${ic('mail')}Open in Mail</button>`}</div>`, body => {
      const go = body.querySelector('#mGo');
      if (go) go.onclick = () => { const sj = body.querySelector('#mSubj').value, bd = body.querySelector('#mBody').value;
        go.href = 'mailto:?subject=' + encodeURIComponent(sj) + '&body=' + encodeURIComponent(bd); RC.logEmail(id, 'Email drafted', { subject: sj, body: bd }); setTimeout(() => dlg.close(), 50); };
    });
  }
  document.querySelectorAll('[data-act="email"]').forEach(b => b.onclick = emailDlg);

  // ---------- book / reschedule ----------
  const pad = x => String(x).padStart(2, '0');
  const archivedOf = tid => (RC.pipeline()[tid] || {}).archived || null;   // parked in the board's Not now lane (pipe.js)
  // book(): this home. book({ id, addr, onCancel }) books any home (the pipeline board's hand-off when a card is dropped
  // on Inspection booked); closing the dialog without booking calls onCancel, so the card goes back where it was.
  function book(t) {
    t = t && t.id ? t : null;
    const tid = t ? t.id : id, taddr = t ? t.addr : rec.addr;
    const cur = RC.booking(tid), base = cur ? new Date(cur) : new Date(Date.now() + 864e5);
    const ds = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
    const slots = []; for (let h = 8; h <= 19; h++) for (const m of [0, 30]) slots.push(`${pad(h)}:${pad(m)}`);
    const curT = cur ? `${pad(base.getHours())}:${pad(base.getMinutes())}` : '17:30';
    const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const lbl = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`; };
    let done = false;
    open(cur ? 'Reschedule the inspection' : 'Book an inspection', `<p class="dl">${esc(taddr)}. ${cur ? 'Booked for ' + esc(RC.when(cur)) + '.' : 'Pick a day and time with the homeowner.'}</p>
      <div class="pick"><label class="fl">Day<input type="date" id="bkD" value="${ds < today ? today : ds}" min="${today}"></label><label class="fl">Time<select id="bkT">${slots.map(t => `<option value="${t}"${t === curT ? ' selected' : ''}>${lbl(t)}</option>`).join('')}</select></label></div>
      <div class="drow"><button type="button" class="pbtn" id="bkGo">${ic('cal')}${cur ? 'Move the inspection' : 'Book it'}</button>${t ? '<button type="button" id="bkNo">Cancel</button>' : ''}</div>`, body => {
      const no = body.querySelector('#bkNo'); if (no) no.onclick = () => dlg.close();
      body.querySelector('#bkGo').onclick = () => {
        const dIn = body.querySelector('#bkD'), d = dIn.value, tm = body.querySelector('#bkT').value;
        // a day is required and the time cannot already be past (an inspection is booked ahead, never backdated)
        const at = d ? new Date(`${d}T${tm}:00`) : null;
        if (!at || isNaN(at) || at.getTime() < Date.now()) { dIn.setCustomValidity(d ? 'Pick a day and time that is still ahead.' : 'Pick a day.'); dIn.reportValidity(); dIn.addEventListener('input', () => dIn.setCustomValidity(''), { once: true }); return; }
        const iso = at.toISOString(), prev = RC.stage(tid, dflt), prevB = RC.booking(tid), prevA = archivedOf(tid);
        done = true;
        // same history line as RC.book; a home parked in Not now comes back to the board when it is booked
        RC.setStage(tid, 'inspection', 'Inspection booked for ' + RC.when(iso) + ', with ' + REP, { booked: iso, archived: null });
        dlg.close(); say((t ? taddr + ': i' : 'I') + 'nspection booked for ' + RC.when(iso) + '.', () => RC.setStage(tid, prev, 'Booking undone', { booked: prevB || null, archived: prevA || null }));
      };
    });
    dlg.addEventListener('close', () => { if (!done && t && t.onCancel) t.onCancel(); }, { once: true });
  }
  // the booked inspection as a calendar file (.ics) the roofer opens in their own calendar app. Built on this device,
  // nothing is sent anywhere; one hour, the address as the location.
  function icsFile(tid) {
    const b = RC.booking(tid); if (!b) return false;
    const r = tid === id ? rec : (RC.recall(tid) || {}), dm2 = /^d([a-z]+)-(\d+)$/.exec(tid), rs = dm2 && window.ROUTES && ROUTES[DEF] ? ROUTES[DEF].stops[+dm2[2] - 1] : null;
    const addr = tid === id ? rec.addr : rs ? rs.num + ' ' + rs.name : r.addr || 'Home';
    const where = tid === id ? place : rs ? `${rs.city}, ${stateOf(DEF)} ${rs.zip}` : r.place || r.city || '';
    const z = t => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const ex = s => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
    const start = Date.parse(b);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Roof Command//Homes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + tid + '-' + z(start) + '@roofcommand', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(start), 'DTEND:' + z(start + 36e5),
      'SUMMARY:' + ex('Roof inspection, ' + addr), 'LOCATION:' + ex(addr + (where ? ', ' + where : '')),
      'DESCRIPTION:' + ex(`Inspection booked in Roof Command for ${RC.when(b)}, with ${REP}.`),
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + ex('Roof inspection, ' + addr), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' }));
    const a = document.createElement('a'); a.href = url; a.download = 'inspection-' + addr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ics';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  window.homeIcs = icsFile;   // pipe.js: the same calendar file from a booked card
  window.homeBook = book;     // pipe.js: a card dropped on Inspection booked always gets a time
  window.homeDialog = open;   // pipe.js: the Won confirmation uses the same dialog
  window.homeDialogEl = dlg;
  document.querySelectorAll('[data-act="book"]').forEach(b => b.onclick = () => book());

  // ---------- more ----------
  $('#bMore').onclick = () => open('More', `<div class="menu">
      <button type="button" data-m="note">${ic('note')}Add a note</button>
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rec.addr + ', ' + place)}" target="_blank" rel="noopener">${ic('roof')}Directions in Maps</a>
      ${kind === 'daily' ? `<button type="button" data-go="daily">${ic('back')}Back to Daily 50</button>` : ''}</div>`, body => {
      body.querySelector('[data-m="note"]').onclick = () => { dlg.close(); setTab('notes'); openNote(); };
    });

  // ---------- stage stepper ----------
  const stepsEl = $('#steps');
  function stepSub(k, hist) {
    const last = re => { const h = hist.find(x => re.test(x.what)); return h ? fmtDay(h.at) : ''; };
    if (k === 'new') return `${sday(/^\d{4}-\d{2}-\d{2}$/.test(rec.storm || '') ? rec.storm : STORM.iso, true)}, ${hail != null ? hail.toFixed(2) + ' in hail' : 'hit'}`;
    if (k === 'called') { const a = hist.find(x => x.dir !== 'in' && (x.kind === 'text' || x.kind === 'email')); if (a) return fmtDay(a.at) + ', ' + (a.kind === 'email' ? 'email' : 'text');
      const mv = hist.find(x => x.kind === 'stage' && /^Moved to (Called|Contacted)/.test(x.what)); return RC.stage(id) !== 'new' && mv ? 'Moved here ' + fmtDay(mv.at) : 'Not yet'; }
    if (k === 'inspection') { const b = RC.booking(id); return b ? RC.when(b) : RC.stage(id) === 'inspection' ? 'Time not set' : 'Not yet'; }
    if (k === 'proposal') return last(/proposal|Moved to Proposal|Inspection done/i) || 'After inspection';
    if (k === 'handoff') { const d = last(/^Moved to Sent to|handoff|handed/i); return d ? 'Handed over ' + d : 'Handed to ' + (REP || 'the owner'); }
    return 'Signed contract';
  }
  function renderSteps() {
    const st = RC.stage(id, dflt), idx = RC.STAGES.findIndex(s => s[0] === st), hist = RC.history(id);
    stepsEl.innerHTML = RC.STAGES.map((s, i) => `<button type="button" class="st${i < idx ? ' dn' : ''}${i === idx ? ' on' : ''}" data-s="${s[0]}" aria-current="${i === idx ? 'step' : 'false'}"><span class="d">${i < idx ? I.check : i + 1}</span><span><b>${s[1]}</b><small>${esc(stepSub(s[0], hist))}</small></span></button>`).join('');
  }
  stepsEl.onclick = e => {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const k = b.dataset.s, prev = RC.stage(id, dflt); if (k === prev) return;
    if (k === 'inspection' && !RC.booking(id)) { book(); return; }
    const prevA = archivedOf(id);
    RC.setStage(id, k, 'Moved to ' + RC.stageName(k), { archived: null });
    say('Moved to ' + RC.stageName(k) + '.', () => RC.setStage(id, prev, 'Moved back to ' + RC.stageName(prev), { archived: prevA || null }));
  };

  // ---------- header sub line, contact ----------
  function renderSub() {
    const st = RC.stage(id, dflt);
    $('#rsub').innerHTML = `<span class="stagepill">${esc(RC.stageName(st))}</span>${archivedOf(id) ? '<span class="stagepill nn" title="Parked in Not now on the pipeline board. Restore it there, or move it on the stage bar.">Not now</span>' : ''}<span>${esc(place)}</span>${OWNDATA && rec.subdivision ? `<span>${esc(rec.subdivision)}</span>` : ''}<span>${OWNDATA ? (rec.owner ? esc(rec.owner) : RC.OWNER_NONE) : rec.person ? esc(rec.person) + ' <i class="smp">sample</i>' : 'Owner name not available'}</span>`;
    const c = RC.canText(id, tel || null);
    document.querySelectorAll('.callwhy').forEach(w => { w.hidden = c.ok; w.textContent = c.reason; });
    document.querySelectorAll('.bookLbl').forEach(l => { l.textContent = RC.booking(id) ? 'Reschedule' : 'Book'; });
    const kv = [['Owner', OWNDATA ? (rec.owner ? esc(rec.owner) + (rec.homestead ? ', homestead' : '') + ' (county roll)' : RC.OWNER_NONE) : rec.person ? esc(rec.person) + ' (sample)' : 'Owner name not available'], ['Phone', rec.phone ? esc(rec.phone) + ' (sample)' : 'Not on file'],
      ['Texts', optin ? (rec.customer ? 'Past customer' : 'Opted in') : 'Not yet opted in'], ['Texting hours', esc(RC.textWindow().label)],
      ['Hail here', hail != null ? hail.toFixed(2) + ' in, ' + esc(window.HOME.hailDate) + ' (radar)' : 'Not on file'], ['Radar max, ' + sday(STORM.iso), STORM.max.toFixed(2) + ' in'],
      ['Roof', esc(rec.roofAge || (rec.year ? 'Built ' + rec.year : 'Checking the county record'))]].concat(LIC ? [['License on texts', LIC]] : []);
    $('#kv').innerHTML = kv.map(r => `<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('') + (RC.tracedRows ? RC.tracedRows(rec.addr, rec.zip) : '');
  }

  // ---------- next task (+ proposal stage block from the old record page) ----------
  function measures() { return window.HOME.measure || null; }
  function renderNext() {
    const st = RC.stage(id, dflt), b = RC.booking(id), hist = RC.history(id);
    let t;
    if (st === 'new') t = { due: 'Today, ' + RC.textWindow().today, h: 'Send the first text', why: `${hail != null ? hail.toFixed(2) + ' in hail here on ' + esc(window.HOME.hailDate) + ' (radar)' : 'On the ' + sday(STORM.iso) + ' storm list'}.${rec.roofAge ? ' ' + esc(rec.roofAge) + '.' : ''} ${esc(RC.textWindow().line)}`, done: 'Texted', alt: 'Book' };
    else if (st === 'called') t = { due: 'Next follow-up', h: 'Follow up by text or email and book the inspection', why: esc((hist[0] || {}).what || 'Contacted') + '.', alt: 'Book' };
    else if (st === 'inspection') t = { due: b ? RC.when(b) : 'Not booked yet', h: 'Inspect the roof', why: 'Walk the slopes that faced the storm, photos of every hail mark, check the ridge caps.', done: 'Inspection done', alt: 'Reschedule' };
    else if (st === 'proposal') t = { due: 'Today, ' + RC.textWindow().today, h: 'Follow up on the proposal. Ask if they want to walk through it.', why: 'Sent after the inspection. No price promises by text.', alt: 'Reschedule' };
    else t = { due: 'Signed', h: 'Schedule the install', why: 'Order materials from the estimated squares plus waste, after a site check.', alt: 'Reschedule' };
    $('#next').innerHTML = `<div class="nh"><span class="pill soft">Next task</span><span class="due">${ic('clock')}${esc(t.due)}</span></div><h4>${t.h}</h4><p class="why">${t.why}</p>
      <div class="row"><button type="button" id="tDone">Done</button><button type="button" data-act="book">${t.alt}</button></div>${st === 'inspection' && b ? `<button type="button" class="calx" id="tCal">${ic('cal')}Add to calendar<small>.ics file</small></button>` : ''}`;
    const tc = $('#tCal'); if (tc) tc.onclick = () => { if (icsFile(id)) say('Calendar file saved. Open it to add the inspection to your calendar.'); };
    $('#tDone').onclick = () => {
      const prev = RC.stage(id, dflt);
      if (st === 'inspection') { RC.setStage(id, 'proposal', 'Inspection done, proposal next'); say('Inspection done. Moved to Proposal.', () => RC.setStage(id, prev, 'Moved back to ' + RC.stageName(prev))); }
      else { RC.note(id, 'Task done: ' + t.h.replace(/\..*$/, '')); say('Task marked done.'); }
    };
    $('#next [data-act="book"]').onclick = () => book();
    // proposal block
    const pb = $('#proposal'), M = measures();
    pb.hidden = st !== 'proposal';
    if (st === 'proposal') {
      const sq = M ? M.squares : rec.sq, waste = M ? M.waste : 15, order = sq ? Math.round(sq * (1 + waste / 100) * 10) / 10 : null;
      pb.innerHTML = `<div class="ph"><h3>Proposal</h3><span class="pill">Sent, sample</span></div>
        <div class="kv pk"><div><span>Scope</span><b>Full replacement, architectural shingle</b></div>
        <div><span>${M && M.drawn ? 'Drawn by you' : 'Estimated'}</span><b title="Estimated from public building outlines and 2018 LiDAR. Verify on site.">${sq != null ? '~' + sq + ' sq (est.)' + (M && M.drawn && !M.pitchMeasured ? ', pitch estimated' : '') : 'Not estimated'}</b></div>
        <div><span>Waste</span><b>${waste}%, from the hips and valleys</b></div>
        <div><span>Order</span><b>${order != null ? '~' + order + ' sq (est.)' : 'After the site check'}</b></div>
        <div><span>Insurance</span><b>Adjuster meeting if the owner files</b></div></div>
        <p class="note">Quantities come from the drawing. Price, claim amounts and deductibles are set with the homeowner, never promised here.</p>`;
    }
  }

  // ---------- activity + notes ----------
  // the only event not in RC.history is the storm itself (real date); calls, texts and notes come from the shared pipeline
  const BASE_EV = () => [
    { at: (/^\d{4}-\d{2}-\d{2}$/.test(rec.storm || '') ? rec.storm : STORM.iso) + 'T21:30:00Z', what: `Storm hit this home. ${hail != null ? hailTxt + ' hail here on radar.' : 'On the storm list.'}`, kind: 'storm', hot: true }
  ];
  const BASE_NOTES = () => [];
  const isCall = h => /^(Called|Call|Wrong number)/.test(h.what);
  const isText = h => /^Text/.test(h.what);
  const isNote = h => h.kind === 'note' && !isCall(h) && !isText(h) && !/^(Task done|Email)/.test(h.what);
  let filter = 'all';
  function fmtDay(iso) { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function evHTML(h) {
    const d = new Date(h.at), icon = h.kind === 'storm' ? 'hail' : isCall(h) ? 'phone' : isText(h) ? 'text' : h.kind === 'email' ? 'mail' : h.kind === 'stage' ? 'check' : h.kind === 'doc' ? 'doc' : 'note';
    return `<div class="ev${h.hot ? ' hot' : ''}"><div class="dt"><small>${d.toLocaleDateString('en-US', { month: 'short' })}${d.getFullYear() !== new Date().getFullYear() ? ' ’' + String(d.getFullYear()).slice(2) : ''}</small><b>${d.getDate()}</b></div><div><div class="et">${ic(icon)}<span>${esc(h.what.split('. ')[0])}</span><time>${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()}</time></div>${h.what.indexOf('. ') > 0 ? `<div class="ed">${esc(h.what.slice(h.what.indexOf('. ') + 2))}</div>` : ''}<div class="who">By ${esc(h.who || REP)}</div></div></div>`;
  }
  function renderActivity() {
    const all = RC.history(id).concat(BASE_EV().map(e => Object.assign({ base: 1 }, e)), BASE_NOTES());
    const list = all.filter(h => filter === 'all' ? true : filter === 'emails' ? (h.kind === 'email' || /^Email/.test(h.what)) : filter === 'texts' ? isText(h) : isNote(h));
    $('#tl').innerHTML = list.length ? list.map(evHTML).join('') : `<p class="empty">${filter === 'emails' ? 'No emails yet.' : filter === 'texts' ? 'No texts yet.' : filter === 'notes' ? 'No notes yet.' : 'Nothing here yet.'}</p>`;
    $('#afil').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === filter ? 'true' : 'false'));
    $('#actN').textContent = all.length;
    const notes = RC.history(id).filter(isNote).concat(BASE_NOTES());
    $('#noteN').textContent = notes.length;
    $('#notelist').innerHTML = notes.map(h => `<div class="notecard">${esc(h.what)}<small>${esc(h.who || REP)}, ${fmtDay(h.at)}</small></div>`).join('');
  }
  $('#afil').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderActivity(); } };
  const nf = $('#noteform'), addBtn = $('#addNote');
  function openNote() { nf.hidden = false; addBtn.hidden = true; $('#noteText').focus(); }
  addBtn.onclick = openNote;
  $('#noteCancel').onclick = () => { nf.hidden = true; addBtn.hidden = false; $('#noteText').value = ''; };
  nf.onsubmit = e => { e.preventDefault(); const v = $('#noteText').value.trim(); if (!v) return; RC.note(id, v); $('#noteText').value = ''; nf.hidden = true; addBtn.hidden = false; say('Note saved.'); };

  // tabs (Measurements / Activity / Notes / Contact), shared with home.js
  const tabs = $('#tabs');
  function setTab(t) {
    tabs.querySelectorAll('button').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('.tab').forEach(p => p.classList.toggle('on', p.dataset.t === t));
  }
  window.setTab = setTab;
  tabs.onclick = e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); };

  function renderAll() { renderHead(); renderSub(); renderSteps(); renderNext(); renderActivity(); if (window.renderPipe) window.renderPipe(); if (window.renderCRM) window.renderCRM(); }
  // the stage control the CRM thread and home pane share with the stage bar (same rules: Inspection booked needs a time)
  window.homeSetStage = function (tid, k) {
    const prev = RC.stage(tid, dflt); if (k === prev && !archivedOf(tid)) return;
    if (k === 'inspection' && !RC.booking(tid)) { book(tid === id ? null : { id: tid, addr: (RC.recall(tid) || {}).addr || 'Home' }); return; }
    const prevA = archivedOf(tid);
    RC.setStage(tid, k, 'Moved to ' + RC.stageName(k), { archived: null });
    say('Moved to ' + RC.stageName(k) + '.', () => RC.setStage(tid, prev, 'Moved back to ' + RC.stageName(prev), { archived: prevA || null }));
  };
  window.renderRecord = renderAll;
  // the roofer's own catalog (storm date, radar max) lands after the first paint: paint again with it
  RC.factsReady.then(() => { if (window.HOME) window.HOME.hailDate = hailDay(rec.storm); renderAll(); });
  RC.on(renderAll);
  renderAll();
  setInterval(renderSub, 60000); // texting hours open and close on the clock
})();
