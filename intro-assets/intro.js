/* Roof Command opening. Part 1 is the Wing website's first-load intro, driven exactly the way
   wing-site-v4/assets/site.js drives it (WingPiece.playIntro -> onDone reveals nav + words + line).
   Then the roofer beat (who this is for and what is in here today) and, after a storm, a short report.
   Two lengths: ?short=1 is the once-per-session opening (about 3 s to the Wing headline, one beat, then
   hand off to Today); ?about=1 or no flag is the long "About" version the Opening tab replays.
   ?hold=1 freezes at the end of the site intro; ?beat=info|storm jumps to that beat and holds;
   ?storm=1 (or a storm in the last 7 days) adds the storm report; ?nointro=1 hands off at once.
   Every number comes from window.RC (lib/rc-state.js). Any key or click skips, silently. */
(function(){
  'use strict';
  var qs = new URLSearchParams(location.search);
  var HOLD = qs.has('hold');
  var BEAT = qs.get('beat');
  var SHORT = qs.get('short') === '1';
  var WAIT = qs.get('wait') === '1';   /* first open: this is the loading screen. After the beats, hold (piece idling, hail falling) until the shell says Today is ready */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var docEl = document.documentElement;
  var NEXT = 'product.html#/daily';
  var ended = false;
  var RC = window.RC;
  var STORM = qs.get('storm') === '1' || recentStorm();
  function recentStorm(){
    try{ var iso = RC && RC.facts.storm.iso; return !!iso && (Date.now() - Date.parse(iso)) < 7*864e5; }catch(e){ return false; }
  }

  if(window.applyRoofer) applyRoofer(rooferKey());

  /* ---------- the facts: one source, lib/rc-state.js ---------- */
  function fill(){
    if(!RC) return;
    var f = RC.facts, s = f.storm, set = function(id, v){ var el = document.getElementById(id); if(el) el.textContent = v; };
    if(!f.homes) return;   /* the catalog has not landed yet: no numbers until it does */
    set('f-homes', RC.fmt(f.homes)); set('f-counties', String(f.counties));
    set('f-storm', s.d); set('f-hit', RC.fmt(s.homes));
    set('s-storm', s.d); set('s-hit', RC.fmt(s.homes)); set('s-max', String(s.max));
  }
  fill();
  if(RC && RC.factsReady) RC.factsReady.then(function(){ fill(); STORM = STORM || recentStorm(); });

  if(qs.get('nointro') === '1'){ end(); return; }

  /* ---------- hail: thin streaks falling toward the storm, kept off the centre lockup ---------- */
  (function(){
    var c = document.getElementById('hail'), g = c.getContext('2d');
    function size(){ c.width = innerWidth; c.height = innerHeight; }
    size(); addEventListener('resize', size);
    var s = 7; function R(){ s = (s*16807) % 2147483647; return s/2147483647; }
    var P = []; for(var i=0;i<(innerWidth<600?220:380);i++) P.push({x:R()*c.width, y:R()*c.height, len:10+R()*24, a:0.08+R()*0.34, v:1.6+R()*2.6, w:R()<0.14?1.5:0.9});
    function draw(){
      g.clearRect(0,0,c.width,c.height); var cx = c.width/2, cy = c.height*0.46, kx = Math.min(360, c.width*0.3), ky = c.height*0.26;
      for(var i=0;i<P.length;i++){ var p = P[i], depth = p.y/c.height;
        var keep = !(Math.abs(p.x-cx) < kx && Math.abs(p.y-cy) < ky);
        if(keep){ var a = p.a*(0.25+0.75*depth);
          g.strokeStyle = 'rgba(70,80,101,'+a+')'; g.lineWidth = p.w; g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(p.x-p.len*0.18, p.y-p.len); g.stroke();
          g.fillStyle = 'rgba(39,87,230,'+Math.min(1,a+0.2)+')'; g.beginPath(); g.arc(p.x,p.y,0.9+depth*1.3,0,7); g.fill(); }
        if(!reduced){ p.y += p.v*(0.5+depth); p.x -= p.v*0.18; if(p.y > c.height+30){ p.y = -30; p.x = R()*c.width; } } }
      if(!reduced && !ended) requestAnimationFrame(draw);
    }
    draw();
  })();

  /* ---------- part 1: the site's intro gate, verbatim logic from site.js ---------- */
  var settled = false, started = false;
  function reveal(){
    if(settled) return; settled = true;
    docEl.classList.remove('intro-active');
    window.__revealT = performance.now();
    if(BEAT){ setTimeout(function(){ showBeat(BEAT === 'storm' ? 'storm' : 'info'); }, 450); return; }
    if(HOLD) return;
    setTimeout(function(){ showBeat('info'); }, SHORT ? 350 : 700);
  }
  setTimeout(reveal, SHORT ? 4200 : 6500);
  function start(){
    if(started) return; started = true;
    if(window.WingPiece && typeof window.WingPiece.playIntro === 'function'){
      try{ window.WingPiece.playIntro({reducedMotion: reduced, onDone: reveal}); }catch(e){ reveal(); }
    } else reveal();
  }
  if(window.WingPiece && window.WingPiece.ready) start();
  else { window.addEventListener('wingpiece:ready', start, {once:true}); setTimeout(start, 1200); }

  /* ---------- parts 2 and 3: the beats ---------- */
  var current = null;
  function showBeat(name){
    if(ended) return;
    docEl.classList.add('beat-on');
    var el = document.getElementById('beat-'+name);
    if(current && current !== el){ current.classList.remove('in'); current.classList.add('out'); }
    current = el;
    setTimeout(function(){ el.classList.add('in'); window.__beat = name; }, current ? 320 : 0);
    if(BEAT || HOLD) return;
    if(name === 'info') setTimeout(function(){ STORM ? showBeat('storm') : beatsOver(); }, SHORT ? (STORM ? 1200 : 1500) : (STORM ? 1300 : 1600));
    else setTimeout(beatsOver, SHORT ? 2400 : 3400);
  }

  /* ---------- the hold (?wait=1): the beats are over, Today may still be getting ready ----------
     The shell posts {type:'intro-stage'} as Today's map, cards and lines land, then {type:'intro-go'} when it is ready
     (or at its own cap). The cue appears only if the wait outlives the beats by a moment, so a fast load never shows it.
     The intro never ends early for a ready signal: the beats always play out. A key or click still skips. */
  var goAsked = !WAIT, beatsDone = false, cueT = null;
  var STAGE = {map:'Drawing the map', cards:'Building today’s list', lines:'Lines ready', ready:'Opening today'};
  function cue(text){
    var t = document.getElementById('load-t'); if(!t || t.textContent === text) return;
    t.classList.add('swap'); setTimeout(function(){ t.textContent = text; t.classList.remove('swap'); }, reduced ? 0 : 300);
  }
  function beatsOver(){
    beatsDone = true;
    if(goAsked){ end(); return; }
    cueT = setTimeout(function(){ if(!ended && !goAsked) docEl.classList.add('loading'); }, 600);
    setTimeout(function(){ if(!ended) end(); }, 14000);   /* the shell has its own cap (12 s); this is the floor under it */
  }
  if(WAIT) addEventListener('message', function(e){
    if(e.origin !== location.origin) return; var d = e.data || {};
    if(d.type === 'intro-stage'){ if(STAGE[d.stage]) cue(STAGE[d.stage]); return; }
    if(d.type === 'intro-go'){ goAsked = true; cue(STAGE.ready); if(beatsDone && !ended){ clearTimeout(cueT); setTimeout(end, docEl.classList.contains('loading') ? 350 : 0); } }
  });

  /* ---------- end: hand off to Today ---------- */
  function end(){
    if(ended) return; ended = true;
    clearTimeout(cueT); docEl.classList.remove('loading');
    document.body.classList.add('go');
    try{ sessionStorage.setItem('rc.introSeen', '1'); }catch(e){}
    try{ window.parent.postMessage({type:'intro-done'}, '*'); }catch(e){}
    if(window.parent === window && !HOLD) setTimeout(function(){ location.href = NEXT; }, 420);
  }
  addEventListener('keydown', function(){ if(!HOLD && !BEAT) end(); });
  addEventListener('click', function(){ if(!HOLD && !BEAT) end(); });
})();
