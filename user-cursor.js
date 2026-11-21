/*
 * User Cursor for project cards.
 *
 * Vanilla port of the Originkit "UserCursor" component: inside every project
 * card image (.case__media) the native cursor is hidden and replaced by an
 * arrow that follows the pointer on a snappy spring, with a label pill that
 * trails on a laggier spring, rocks with horizontal motion and squashes while
 * the button is pressed. The cursor layer is pointer-events:none, so clicks go
 * straight through to the card link. Skipped on touch / coarse pointers.
 *
 * The cards are rendered by the React bundle in index.html and re-mounted on
 * route changes, so they are picked up with a MutationObserver.
 */
(function () {
  "use strict";

  var CFG = {
    size: 31, // preset from the prompt
    color: "#FFFFFF", // pill + arrow fill
    textColor: "#000000",
    pressScale: 0.92,
    labelTiltStrength: 25,
    offsetX: 0,
    offsetY: 0,
    arrowSpring: { stiffness: 380, damping: 32, mass: 0.6 },
    labelSpring: { stiffness: 220, damping: 26, mass: 0.7 },
    tiltSpring: { stiffness: 200, damping: 24, mass: 0.6 },
    pressSpring: { stiffness: 500, damping: 28, mass: 0.5 },
  };
  // Label offset follows size (labelOffsetUseDefault: true).
  var LABEL_DX = CFG.size * 0.9;
  var LABEL_DY = CFG.size * 0.2 + 6;

  var SELECTOR = ".case__media";
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");

  // --- styles ---------------------------------------------------------------
  var css =
    ".uc-on .case__media,.uc-on .case__media *{cursor:none}" +
    ".uc-on .case__cursor{display:none!important}" +
    ".uc-layer{position:absolute;inset:0;pointer-events:none;z-index:50}" +
    ".uc-arrow,.uc-label{position:absolute;top:0;left:0;pointer-events:none;opacity:0;" +
    "transition:opacity 140ms ease;will-change:transform,opacity}" +
    ".uc-arrow{transform-origin:0 0}" +
    ".uc-arrow svg{display:block;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35)) drop-shadow(0 0 .5px rgba(0,0,0,.4))}" +
    ".uc-label{transform-origin:0 50%;border-radius:999px;user-select:none;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.08);" +
    "font-family:var(--font-ui,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif);" +
    "font-weight:600;line-height:1.1;letter-spacing:.1px;white-space:nowrap}" +
    ".uc-visible .uc-arrow,.uc-visible .uc-label{opacity:1}";
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // --- spring ---------------------------------------------------------------
  function Spring(opts, value) {
    this.k = opts.stiffness;
    this.c = opts.damping;
    this.m = opts.mass;
    this.x = value || 0;
    this.v = 0;
    this.target = this.x;
  }
  Spring.prototype.step = function (dt) {
    // Semi-implicit Euler in small sub-steps: stable for stiff springs.
    var n = Math.ceil(dt / 0.004);
    var h = dt / n;
    for (var i = 0; i < n; i++) {
      var a = (-this.k * (this.x - this.target) - this.c * this.v) / this.m;
      this.v += a * h;
      this.x += this.v * h;
    }
  };
  Spring.prototype.jump = function (v) {
    this.x = this.target = v;
    this.v = 0;
  };
  Spring.prototype.settled = function () {
    return Math.abs(this.x - this.target) < 0.01 && Math.abs(this.v) < 0.01;
  };

  // --- one cursor per card --------------------------------------------------
  function arrowSVG() {
    var s = CFG.size;
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M5 3 L23 14 L14 16 L11 24 Z" fill="' + CFG.color + '" stroke="rgba(0,0,0,0.18)" ' +
      'stroke-width="0.6" stroke-linejoin="round"/></svg>'
    );
  }

  function labelText(host) {
    var old = host.querySelector(".case__cursor");
    var t = old && old.textContent.trim();
    if (t) return t;
    var card = host.closest(".case");
    var title = card && card.querySelector(".case__title");
    return title ? title.textContent.trim() : "View case";
  }

  function attach(host) {
    if (host.__uc) return;

    var layer = document.createElement("div");
    layer.className = "uc-layer";
    layer.setAttribute("aria-hidden", "true");

    var label = document.createElement("div");
    label.className = "uc-label";
    label.style.background = CFG.color;
    label.style.color = CFG.textColor;
    label.style.padding = CFG.size * 0.18 + "px " + CFG.size * 0.36 + "px";
    label.style.fontSize = Math.max(7, CFG.size * 0.43) + "px";
    label.textContent = labelText(host);

    var arrow = document.createElement("div");
    arrow.className = "uc-arrow";
    arrow.style.width = arrow.style.height = CFG.size + "px";
    arrow.innerHTML = arrowSVG();

    // Label renders behind the arrow so the tip is always on top.
    layer.appendChild(label);
    layer.appendChild(arrow);
    host.appendChild(layer);

    var ax = new Spring(CFG.arrowSpring), ay = new Spring(CFG.arrowSpring);
    var lx = new Spring(CFG.labelSpring), ly = new Spring(CFG.labelSpring);
    var tilt = new Spring(CFG.tiltSpring);
    var scale = new Spring(CFG.pressSpring, 1);
    var springs = [ax, ay, lx, ly, tilt, scale];

    var raf = 0, lastT = 0, last = null, lastMove = 0, hovering = false;

    function render() {
      var s = scale.x.toFixed(4);
      arrow.style.transform =
        "translate3d(" + ax.x.toFixed(2) + "px," + ay.x.toFixed(2) + "px,0) scale(" + s + ")";
      label.style.transform =
        "translate3d(" + (lx.x + LABEL_DX).toFixed(2) + "px," + (ly.x + LABEL_DY).toFixed(2) + "px,0)" +
        " rotate(" + tilt.x.toFixed(3) + "deg) scale(" + s + ")";
    }

    function frame(now) {
      raf = 0;
      var dt = Math.min(0.064, Math.max(0.001, (now - (lastT || now)) / 1000)) || 0.016;
      lastT = now;
      // Ease the rock back to neutral once the pointer rests.
      if (now - lastMove > 90) tilt.target = 0;
      for (var i = 0; i < springs.length; i++) springs[i].step(dt);
      render();
      var busy = false;
      for (var j = 0; j < springs.length; j++) if (!springs[j].settled()) busy = true;
      if (busy) raf = requestAnimationFrame(frame);
      else lastT = 0;
    }
    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function local(e) {
      var r = host.getBoundingClientRect();
      return { x: e.clientX - r.left + CFG.offsetX, y: e.clientY - r.top + CFG.offsetY };
    }

    function onEnter(e) {
      var p = local(e);
      // Start the springs under the pointer instead of flying in from afar.
      ax.jump(p.x); ay.jump(p.y); lx.jump(p.x); ly.jump(p.y); tilt.jump(0);
      last = null;
      hovering = true;
      host.classList.add("uc-visible");
      render();
    }
    function onMove(e) {
      if (!hovering) onEnter(e);
      var p = local(e);
      var now = performance.now();
      var vx = 0, vy = 0;
      if (last) {
        var dt = Math.max(1, now - last.t);
        vx = ((p.x - last.x) / dt) * 1000;
        vy = ((p.y - last.y) / dt) * 1000;
      }
      last = { x: p.x, y: p.y, t: now };
      lastMove = now;

      if (reduce && reduce.matches) {
        ax.jump(p.x); ay.jump(p.y); lx.jump(p.x); ly.jump(p.y);
        render();
        return;
      }
      ax.target = lx.target = p.x;
      ay.target = ly.target = p.y;
      var norm = Math.min(1, Math.hypot(vx, vy) / 1500);
      var sign = vx === 0 ? 0 : vx > 0 ? 1 : -1;
      tilt.target = sign * norm * CFG.labelTiltStrength;
      kick();
    }
    function onLeave() {
      hovering = false;
      last = null;
      tilt.target = 0;
      scale.target = 1;
      host.classList.remove("uc-visible");
      kick();
    }
    function onDown(e) {
      if (e.button !== 0) return;
      scale.target = CFG.pressScale;
      kick();
    }
    function onUp() {
      scale.target = 1;
      kick();
    }

    host.addEventListener("mouseenter", onEnter);
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);
    host.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);

    host.__uc = function detach() {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener("mouseenter", onEnter);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
      host.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      host.classList.remove("uc-visible");
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      host.__uc = null;
    };
  }

  // --- wiring ---------------------------------------------------------------
  var attached = new Set();

  function scan() {
    // Drop cursors whose cards were unmounted by the router.
    attached.forEach(function (h) {
      if (!h.isConnected) {
        if (h.__uc) h.__uc();
        attached.delete(h);
      }
    });
    if (!enabled) return;
    var hosts = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < hosts.length; i++) {
      if (!hosts[i].__uc) {
        attach(hosts[i]);
        attached.add(hosts[i]);
      }
    }
  }

  var enabled = false;
  function sync() {
    var want = !fine || fine.matches;
    if (want === enabled) return;
    enabled = want;
    document.documentElement.classList.toggle("uc-on", enabled);
    if (!enabled) {
      attached.forEach(function (h) { if (h.__uc) h.__uc(); });
      attached.clear();
    }
    scan();
  }

  var pending = 0;
  var mo = new MutationObserver(function () {
    if (!pending) pending = requestAnimationFrame(function () { pending = 0; scan(); });
  });

  function start() {
    sync();
    mo.observe(document.body, { childList: true, subtree: true });
    if (fine) {
      if (fine.addEventListener) fine.addEventListener("change", sync);
      else if (fine.addListener) fine.addListener(sync);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
