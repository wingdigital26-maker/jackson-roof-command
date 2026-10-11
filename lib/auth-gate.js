/* Roof Command tour: private data loader (hosted build only; scripts/build_deploy_jackson.py injects this into every page).
   The DFW data (addresses, hail, roof facts) is NOT in the deployed site. It lives in the PRIVATE Supabase Storage bucket
   "jackson-dfw", readable only by signed-in users. Every screen still asks for lib/st-data-dfw/<file>; this wrapper turns
   that request into an authenticated Storage request using the session lib/auth.js stored (localStorage "rc.session").
   No session yet (signed out): the request simply waits, so no data loads before sign-in. Owner files (private/) are refused.
   Only the public anon key is here; the service key never ships. */
(function () {
  if (window.__rcGate) return; window.__rcGate = true;
  var CFG = { URL: "https://wbtrsujvprbdojmxlkpe.supabase.co", KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidHJzdWp2cHJiZG9qbXhsa3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjc0MzcsImV4cCI6MjEwNjY0MzQzN30.rzSf_wXbb9W0uajLg_5Ur04VyobSwgz3pLXgFSyG_5I", BUCKET: "jackson-dfw" };
  var MARK = "/lib/st-data-dfw/";
  var f0 = window.fetch.bind(window);
  var now = function () { return Math.floor(Date.now() / 1000); };
  function session() {
    try { var s = JSON.parse(localStorage.getItem("rc.session") || "null"); return s && s.access_token && s.expires_at > now() + 5 ? s : null; } catch (e) { return null; }
  }
  function whenSession() {
    var s = session(); if (s) return Promise.resolve(s);
    return new Promise(function (res) { var t = setInterval(function () { var s2 = session(); if (s2) { clearInterval(t); res(s2); } }, 250); });
  }
  function target(url) {
    var u; try { u = new URL(url, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    var i = u.pathname.indexOf(MARK); if (i < 0) return null;
    return u.pathname.slice(i + MARK.length);
  }
  window.fetch = function (input, init) {
    var rel = target(typeof input === "string" ? input : (input && input.url) || String(input));
    if (rel === null) return f0(input, init);
    if (!rel || /(^|\/)private(\/|$)/.test(rel) || /owner/i.test(rel)) return Promise.resolve(new Response("", { status: 404 }));
    var path = rel.split("/").map(encodeURIComponent).join("/");
    return whenSession().then(function (s) {
      var o = Object.assign({}, init || {});
      o.headers = { apikey: CFG.KEY, Authorization: "Bearer " + s.access_token };
      o.method = "GET"; delete o.body;
      return f0(CFG.URL + "/storage/v1/object/authenticated/" + CFG.BUCKET + "/" + path, o).then(function (r) {
        if (r.status !== 401 && r.status !== 403) return r;
        var s2 = session(); // token rotated between wait and send: one retry with the current one
        if (!s2 || s2.access_token === s.access_token) return r;
        o.headers = { apikey: CFG.KEY, Authorization: "Bearer " + s2.access_token };
        return f0(CFG.URL + "/storage/v1/object/authenticated/" + CFG.BUCKET + "/" + path, o);
      });
    });
  };
})();
