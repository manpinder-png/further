"use strict";
/* Social brain map: sample learners pulled toward their topic cluster by a small
   force layout (spring to cluster centre + collision), drawn in SVG. No libraries. */
window.FurtherMap = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const W = 900;
  const H = 560;

  function svg(tag, attrs, className) {
    const node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (className) node.setAttribute("class", className);
    return node;
  }

  // Seeded random so the map looks the same on every load.
  function seeded(seed) {
    return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  function render(root, options) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = seeded(11);
    root.setAttribute("viewBox", "0 0 " + W + " " + H);
    Array.from(root.querySelectorAll("g")).forEach(function (g) { g.remove(); });

    const layers = {};
    ["rings", "spokes", "labels", "nodes", "you"].forEach(function (name) {
      layers[name] = svg("g");
      root.appendChild(layers[name]);
    });
    [110, 200, 290].forEach(function (r) {
      layers.rings.appendChild(svg("ellipse", {cx: W / 2, cy: H / 2, rx: r * 1.45, ry: r}, "ring"));
    });

    const centers = {};
    const count = options.clusters.length;
    options.clusters.forEach(function (cluster, i) {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / count;
      const c = {x: W / 2 + Math.cos(angle) * W * 0.34, y: H / 2 + Math.sin(angle) * H * 0.33, cluster: cluster};
      c.label = svg("text", {x: c.x, y: c.y - 62}, "clabel");
      c.label.textContent = cluster.label;
      c.count = svg("text", {x: c.x, y: c.y - 48}, "ccount");
      c.count.textContent = cluster.online + " online · " + cluster.size;
      layers.labels.appendChild(c.label);
      layers.labels.appendChild(c.count);
      centers[cluster.id] = c;
    });

    const nodes = options.learners.map(function (learner) {
      const c = centers[learner.cluster];
      const node = {
        learner: learner, target: c, r: 3.8 + learner.tier * 1.3,
        x: c.x + (rand() - 0.5) * 120, y: c.y + (rand() - 0.5) * 120, vx: 0, vy: 0
      };
      node.spoke = svg("line", {}, "spoke");
      node.el = svg("circle", {r: node.r}, "node " + (learner.online ? "on" : "away"));
      node.el.addEventListener("mouseenter", function () { options.onHover(learner, node.el); });
      node.el.addEventListener("mouseleave", function () { options.onHover(null); });
      node.el.addEventListener("click", function () { options.onHover(learner, node.el); });
      layers.spokes.appendChild(node.spoke);
      layers.nodes.appendChild(node.el);
      return node;
    });

    const middle = {x: W / 2, y: H / 2};
    const you = {you: true, target: middle, r: 8, x: W / 2, y: H / 2, vx: 0, vy: 0};
    you.spoke = svg("line", {}, "spoke you");
    you.ring = svg("circle", {r: 8}, "you-ring");
    you.el = svg("circle", {r: 8}, "you-core");
    you.label = svg("text", {}, "you-label");
    you.label.textContent = options.userLabel || "you";
    layers.spokes.appendChild(you.spoke);
    [you.ring, you.el, you.label].forEach(function (n) { layers.you.appendChild(n); });
    nodes.push(you);

    let alpha = 1;
    let frame = null;
    let settled = false;
    let placed = false;
    const startedAt = performance.now();

    function tick() {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pull = n.you ? 0.03 : 0.014;
        n.vx += (n.target.x - n.x) * pull * alpha;
        n.vy += (n.target.y - n.y) * pull * alpha;
      }
      // Collision: push overlapping nodes apart.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const min = a.r + b.r + 6;
          if (d < min) {
            const push = (min - d) / d * 0.5;
            dx *= push; dy *= push;
            a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy;
          }
        }
      }
      nodes.forEach(function (n) {
        n.vx *= 0.78; n.vy *= 0.78;
        n.x = Math.max(12, Math.min(W - 12, n.x + n.vx));
        n.y = Math.max(12, Math.min(H - 12, n.y + n.vy));
      });
      alpha = Math.max(0.05, alpha * 0.992);
    }

    function draw() {
      nodes.forEach(function (n) {
        n.el.setAttribute("cx", n.x.toFixed(1));
        n.el.setAttribute("cy", n.y.toFixed(1));
        n.spoke.setAttribute("x1", n.x.toFixed(1));
        n.spoke.setAttribute("y1", n.y.toFixed(1));
        n.spoke.setAttribute("x2", n.target.x.toFixed(1));
        n.spoke.setAttribute("y2", n.target.y.toFixed(1));
      });
      you.ring.setAttribute("cx", you.x.toFixed(1));
      you.ring.setAttribute("cy", you.y.toFixed(1));
      you.label.setAttribute("x", you.x.toFixed(1));
      you.label.setAttribute("y", (you.y + 22).toFixed(1));
    }

    function place() {
      placed = true;
      const home = centers[options.userCluster];
      if (!home) return;
      you.target = home;
      alpha = Math.max(alpha, 0.6);
      highlight(options.userCluster, true);
    }

    function loop(now) {
      tick();
      draw();
      if (!placed && now - startedAt > 900) place();
      const dx = you.target.x - you.x;
      const dy = you.target.y - you.y;
      if (placed && !settled && Math.sqrt(dx * dx + dy * dy) < 30) {
        settled = true;
        if (options.onSettled) options.onSettled();
      }
      if (alpha > 0.06 || !settled) frame = requestAnimationFrame(loop);
      else frame = null;
    }

    function highlight(id, mine) {
      Object.keys(centers).forEach(function (key) {
        const on = !id || key === id;
        centers[key].label.classList.toggle("dim", !on);
        if (mine) centers[key].label.classList.toggle("mine", key === id);
      });
      nodes.forEach(function (n) {
        if (n.you) return;
        n.el.classList.toggle("dim", !!id && n.learner.cluster !== id);
        if (mine) n.el.classList.toggle("mine", n.learner.cluster === id);
      });
    }

    if (reduce) {
      for (let i = 0; i < 300; i++) tick();
      place();
      for (let i = 0; i < 300; i++) { alpha = 1; tick(); }
      draw();
      settled = true;
      if (options.onSettled) setTimeout(options.onSettled, 0);
    } else {
      frame = requestAnimationFrame(loop);
    }

    // "Live" feel: an online learner blips every so often.
    const online = nodes.filter(function (n) { return !n.you && n.learner.online; });
    const blips = reduce ? null : setInterval(function () {
      const n = online[Math.floor(Math.random() * online.length)];
      n.el.classList.remove("blip");
      void n.el.getBBox();
      n.el.classList.add("blip");
    }, 900);

    return {
      highlight: function (id) { highlight(id || null, false); },
      destroy: function () {
        if (frame) cancelAnimationFrame(frame);
        if (blips) clearInterval(blips);
      }
    };
  }

  return {render: render};
})();
