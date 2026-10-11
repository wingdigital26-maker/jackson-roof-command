/* rc-automation.js: the "Automation: on/off" switch in the CRM inbox header (Jack 10-10: sending, replies and follow-up
   automated until the homeowner books or calls Chris). Writes crm_kv 'automation.enabled' for the signed-in user's
   company; RLS (010_automation.sql) lets only owners/admins write it, so members see the state but no switch.
   The engine (supabase/functions/roof-engine) reads this key before every send. Default off. Signed out = hidden. */
(function () {
  'use strict';
  const slot = document.getElementById('autoSlot'); if (!slot) return;
  const URL_ = 'https://wbtrsujvprbdojmxlkpe.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidHJzdWp2cHJiZG9qbXhsa3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjc0MzcsImV4cCI6MjEwNjY0MzQzN30.rzSf_wXbb9W0uajLg_5Ur04VyobSwgz3pLXgFSyG_5I';
  const sess = () => { try { const v = JSON.parse(localStorage.getItem('rc.session') || 'null'); return v && v.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000 + 20) ? v : null; } catch (e) { return null; } };
  const api = (path, opt) => { const s = sess(); if (!s) return Promise.reject(new Error('signed out')); opt = opt || {};
    return fetch(URL_ + '/rest/v1/' + path, { method: opt.method || 'GET', headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, opt.prefer ? { Prefer: opt.prefer } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store' })
      .then(r => r.text().then(t => { if (!r.ok) throw new Error('HTTP ' + r.status); return t ? JSON.parse(t) : null; })); };
  const css = document.createElement('style');
  css.textContent = '.autosw{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line,#d9dee5);border-radius:999px;padding:5px 11px 5px 8px;background:var(--card,#fff);font:600 12px/1 inherit;color:inherit;cursor:pointer}' +
    '.autosw[disabled]{cursor:default;opacity:.85}.autosw i{width:28px;height:16px;border-radius:9px;background:#c9ced6;position:relative;transition:background .15s}' +
    '.autosw i:after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}' +
    '.autosw[aria-checked="true"] i{background:var(--accent,#1f6feb)}.autosw[aria-checked="true"] i:after{left:14px}';
  document.head.appendChild(css);
  let company = null, owner = false, on = false;
  function paint() {
    slot.innerHTML = '<button type="button" class="autosw" role="switch" aria-checked="' + on + '"' + (owner ? '' : ' disabled title="Only the company owner can change this"') +
      ' aria-label="Automation ' + (on ? 'on' : 'off') + '"><i></i>Automation: ' + (on ? 'on' : 'off') + '</button>';
    const b = slot.firstChild; if (owner) b.onclick = toggle;
  }
  function toggle() {
    const next = !on;
    if (next && !confirm('Turn automation on?\n\nTexts and emails will go out on their own (day 1 text, then emails on day 3, 7 and 30), and replies get an AI answer that points to booking or calling Chris. Sends only 9am to 8pm Central. Opt-outs and litigator flags are always honored.')) return;
    api('crm_kv?on_conflict=company_id,key', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ company_id: company, key: 'automation.enabled', value: next }] })
      .then(() => { on = next; paint(); }).catch(e => alert('Could not change automation: ' + e.message));
  }
  function load() {
    if (!sess()) { slot.innerHTML = ''; return; }
    const want = window.RC && RC.rooferKey ? RC.rooferKey() : 'jackson';
    api('companies?select=id,slug').then(rows => {
      const c = (rows || []).find(r => r.slug === want) || (rows || [])[0]; if (!c) return;
      company = c.id;
      return Promise.all([api('memberships?select=role&company_id=eq.' + company), api('crm_kv?select=value&company_id=eq.' + company + '&key=eq.automation.enabled')]).then(([m, kv]) => {
        owner = (m || []).some(x => x.role === 'owner' || x.role === 'admin'); on = !!(kv && kv[0] && kv[0].value === true); paint();
      });
    }).catch(() => { slot.innerHTML = ''; });
  }
  load(); setInterval(() => { if (document.visibilityState !== 'hidden') load(); }, 60000);
})();
