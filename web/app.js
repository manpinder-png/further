"use strict";
/* Further user journey: intent -> profile -> map -> match -> room -> wrap-up.
   All rendering uses textContent; nothing from the server or a model is parsed as HTML. */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TIER_NAMES = ["", "New to it", "Getting started", "Working knowledge", "Confident", "Could teach it"];
  const FIELD_ORDER = ["name", "experience_years", "expertise_areas", "focus_area", "concept",
    "sharpened_question", "tier", "learning_style", "language", "availability_minutes"];

  const state = {
    learners: [], clusters: [], online: 0, profile: null, placement: null, group: null,
    shown: [], plan: null, planRequest: null, promptIndex: 0, marked: new Set(),
    trail: null, reputation: null, map: null, timers: [], intervals: []
  };

  // ---------- helpers ----------
  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = value;
    return node;
  }
  function later(fn, ms) {
    const id = setTimeout(fn, reduceMotion ? 0 : ms);
    state.timers.push(id);
    return id;
  }
  function every(fn, ms) {
    const id = setInterval(fn, ms);
    state.intervals.push(id);
    return id;
  }
  function stopAll() {
    state.timers.forEach(clearTimeout);
    state.intervals.forEach(clearInterval);
    state.timers = [];
    state.intervals = [];
  }
  async function api(path, body) {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? {"Content-Type": "application/json"} : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await response.json(); } catch (ignored) { /* handled below */ }
    if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
    return data;
  }
  function status(message, isError) {
    $("status").textContent = message || "";
    $("status").className = isError ? "status mono error" : "status mono";
  }
  function pips(tier, className) {
    const wrap = el("span", "pips" + (className ? " " + className : ""));
    wrap.setAttribute("aria-label", "Tier " + tier + " of 5");
    for (let i = 1; i <= 5; i++) wrap.appendChild(el("i", i <= tier ? "on" : ""));
    return wrap;
  }
  function avatar(name, online) {
    const node = el("span", "avatar", name.charAt(0).toUpperCase());
    if (online !== undefined) node.appendChild(el("span", online ? "dot" : "dot off"));
    return node;
  }

  // Provider badge: always says which provider and model answered, and any fallback.
  function setBadge(node, info) {
    if (!info) return;
    const failed = (info.fallbacks || []).map(function (f) { return f.provider; });
    let label = info.provider === "demo" ? "AI · demo · no model call" : "AI · " + info.provider + " · " + info.model;
    if (info.provider !== "demo" && typeof info.latency_ms === "number") label += " · " + info.latency_ms + "ms";
    if (failed.length) label += " · after " + failed.join(", ") + " failed";
    node.textContent = label;
    node.classList.toggle("live", info.provider !== "demo");
    node.classList.toggle("fallback", failed.length > 0);
    node.title = failed.length
      ? (info.fallbacks.map(function (f) { return f.provider + ": " + f.reason; }).join("\n"))
      : "Served by " + info.provider + (info.model ? " (" + info.model + ")" : "");
  }
  function noteServed(info, local) {
    setBadge($("ai-badge"), info);
    if (local) setBadge(local, info);
  }

  // ---------- navigation ----------
  function show(step) {
    stopAll();
    if (state.map && step !== 3) { state.map.destroy(); state.map = null; }
    document.querySelectorAll(".screen").forEach(function (screen) {
      screen.hidden = Number(screen.dataset.step) !== step;
    });
    document.querySelectorAll("#steps li").forEach(function (li) {
      const n = Number(li.dataset.step);
      li.classList.toggle("done", n < step);
      if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    status("");
    window.scrollTo({top: 0, behavior: reduceMotion ? "auto" : "smooth"});
    const heading = document.querySelector("#screen-" + step + " [tabindex='-1']");
    if (heading) heading.focus({preventScroll: true});
  }

  // ---------- 01 intent ----------
  const intentForm = $("intent-form");
  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      $("intent").value = chip.dataset.intent;
      intentForm.requestSubmit();
    });
  });
  intentForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const intent = $("intent").value.trim();
    if (intent.length < 3) { status("Tell us a little more: at least a few words.", true); return; }
    $("intent-go").disabled = true;
    status("Sharpening your question…");
    try {
      const data = await api("/api/profile", {intent: intent});
      noteServed(data, $("profile-badge"));
      show(2);
      fillProfile(data.profile);
    } catch (error) {
      status(error.message, true);
    } finally {
      $("intent-go").disabled = false;
    }
  });

  // ---------- 02 profile ----------
  const profileForm = $("profile-form");
  function input(name) { return $("f-" + name); }
  function updateTierLabel() {
    const concept = input("concept").value.trim();
    $("tier-on").textContent = concept ? "on " + concept : "on this concept";
  }
  function fillProfile(profile) {
    profileForm.classList.remove("ready");
    $("profile-go").disabled = true;
    const values = Object.assign({}, profile, {expertise_areas: profile.expertise_areas.join(", ")});
    FIELD_ORDER.forEach(function (name) {
      input(name).value = "";
      input(name).closest(".field").classList.remove("lit");
    });
    let index = 0;
    function next() {
      if (index >= FIELD_ORDER.length) {
        profileForm.classList.add("ready");
        $("profile-go").disabled = false;
        updateTierLabel();
        return;
      }
      const name = FIELD_ORDER[index++];
      const field = input(name);
      const value = String(values[name]);
      field.closest(".field").classList.add("lit");
      if (field.tagName === "SELECT" || reduceMotion) {
        field.value = value;
        later(next, 140);
        return;
      }
      let shown = 0;
      const stride = Math.max(1, Math.ceil(value.length / 22));
      (function type() {
        shown = Math.min(value.length, shown + stride);
        field.value = value.slice(0, shown);
        if (shown < value.length) later(type, 18); else later(next, 110);
      })();
    }
    next();
  }
  function readProfile() {
    return {
      name: input("name").value.trim(),
      experience_years: parseInt(input("experience_years").value, 10),
      expertise_areas: input("expertise_areas").value.split(",").map(function (s) { return s.trim(); })
        .filter(Boolean).slice(0, 6),
      focus_area: input("focus_area").value.trim(),
      concept: input("concept").value.trim(),
      sharpened_question: input("sharpened_question").value.trim(),
      tier: parseInt(input("tier").value, 10),
      learning_style: input("learning_style").value,
      language: input("language").value,
      availability_minutes: parseInt(input("availability_minutes").value, 10)
    };
  }
  input("concept").addEventListener("input", updateTierLabel);
  $("back-1").addEventListener("click", function () { show(1); $("intent").focus(); });
  profileForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const profile = readProfile();
    $("profile-go").disabled = true;
    try {
      state.placement = await api("/api/placement", {profile: profile});
      state.profile = profile;
      state.shown = [];
      show(3);
      renderMap();
    } catch (error) {
      status(error.message, true);
    } finally {
      $("profile-go").disabled = false;
    }
  });

  // ---------- 03 map ----------
  function renderClusterList(mine) {
    const list = $("cluster-list");
    list.replaceChildren();
    const biggest = Math.max.apply(null, state.clusters.map(function (c) { return c.size; }));
    state.clusters.forEach(function (cluster) {
      const li = el("li", cluster.id === mine ? "mine" : "");
      li.tabIndex = 0;
      li.appendChild(el("b", "", cluster.label));
      li.appendChild(el("span", "n", cluster.online + "/" + cluster.size));
      const track = el("span", "bar-track");
      const fill = el("span");
      track.appendChild(fill);
      li.appendChild(track);
      later(function () { fill.style.width = Math.round(cluster.online / biggest * 100) + "%"; }, 60);
      ["mouseenter", "focus"].forEach(function (type) {
        li.addEventListener(type, function () { if (state.map) state.map.highlight(cluster.id); });
      });
      ["mouseleave", "blur"].forEach(function (type) {
        li.addEventListener(type, function () { if (state.map) state.map.highlight(null); });
      });
      list.appendChild(li);
    });
    $("cluster-total").textContent = state.learners.length + " sample learners";
  }
  function showTip(learner, node) {
    const tip = $("map-tip");
    if (!learner) { tip.hidden = true; return; }
    tip.replaceChildren();
    const head = el("div");
    head.appendChild(el("b", "", learner.name));
    head.appendChild(document.createTextNode(" · tier " + learner.tier + " · " + (learner.online ? "online" : "away")));
    tip.appendChild(head);
    tip.appendChild(el("div", "", "“" + learner.intent + "”"));
    tip.appendChild(el("span", "", learner.experience_years + " yrs experience · " + learner.language + " · sample"));
    tip.hidden = false;
    const wrap = $("map-wrap").getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const left = Math.min(wrap.width - tip.offsetWidth - 8, Math.max(8, box.left - wrap.left + 14));
    const top = box.top - wrap.top - tip.offsetHeight - 8;
    tip.style.left = left + "px";
    tip.style.top = (top < 8 ? box.bottom - wrap.top + 8 : top) + "px";
  }
  function renderMap() {
    const mine = state.placement.cluster;
    $("map-go").disabled = true;
    $("placement").textContent = "Placing you…";
    renderClusterList(null);
    if (state.map) state.map.destroy();
    state.map = window.FurtherMap.render($("map"), {
      learners: state.learners, clusters: state.clusters, userCluster: mine,
      userLabel: state.profile.name || "you", onHover: showTip,
      onSettled: function () {
        renderClusterList(mine);
        const p = $("placement");
        p.replaceChildren();
        p.appendChild(document.createTextNode("You joined "));
        p.appendChild(el("b", "", state.placement.label));
        p.appendChild(document.createTextNode(". " + state.placement.reason));
        $("map-go").disabled = false;
      }
    });
  }
  $("back-2").addEventListener("click", function () { show(2); profileForm.classList.add("ready"); });
  $("map-go").addEventListener("click", function () { findGroup(false); });

  // ---------- 04 match ----------
  async function findGroup(again) {
    const button = again ? $("another") : $("map-go");
    button.disabled = true;
    status(again ? "Looking for a different mix…" : "Finding people online now…");
    try {
      const group = await api("/api/group", {profile: state.profile, exclude: state.shown});
      state.group = group;
      group.members.forEach(function (m) { if (state.shown.indexOf(m.id) < 0) state.shown.push(m.id); });
      if (!again) show(4); else status("");
      renderGroup(group);
    } catch (error) {
      status(error.message, true);
    } finally {
      button.disabled = false;
    }
  }
  function renderGroup(group) {
    const n = group.members.length;
    $("match-title").textContent = n === 0 ? "No one in your language is online here right now"
      : n === 1 ? "1 person is exploring this right now" : n + " people are exploring this right now";
    $("match-sub").textContent = group.cluster.label + " · " + state.profile.concept;
    const list = $("members");
    list.classList.remove("swap");
    void list.offsetWidth;
    list.classList.add("swap");
    list.replaceChildren();
    group.members.forEach(function (m) {
      const li = el("li", "member");
      li.appendChild(avatar(m.name, m.online));
      const who = el("div", "who");
      who.appendChild(el("strong", "", m.name));
      who.appendChild(el("span", "tag", "sample"));
      if (m.experience_years >= 10) who.appendChild(el("span", "tag", m.experience_years + " yrs exp"));
      li.appendChild(who);
      const tier = el("div", "tierline");
      tier.appendChild(pips(m.tier));
      tier.appendChild(document.createTextNode("tier " + m.tier + " · " + m.concept));
      li.appendChild(tier);
      li.appendChild(el("p", "intent", "“" + m.intent + "”"));
      li.appendChild(el("span", "hint", m.role_hint));
      list.appendChild(li);
    });
    $("rationale").textContent = group.rationale + (group.recycled
      ? " You've now seen everyone online here, so some faces repeat." : "");
    $("join").disabled = n === 0;
    $("lobby").hidden = true;
    $("match-actions").hidden = false;
  }
  $("another").addEventListener("click", function () { findGroup(true); });
  $("join").addEventListener("click", function () {
    const goal = {topic: state.profile.sharpened_question, level: tierLevel(state.profile.tier),
      language: state.profile.language, minutes: state.profile.availability_minutes};
    state.plan = null;
    state.planRequest = api("/api/plan", goal);
    state.planRequest.catch(function () { /* surfaced when the lobby ends */ });
    $("match-actions").hidden = true;
    $("lobby").hidden = false;
    const ready = $("lobby-ready");
    ready.replaceChildren();
    const you = el("li", "ready");
    you.appendChild(el("span", "dot"));
    you.appendChild(document.createTextNode(state.profile.name || "You"));
    ready.appendChild(you);
    const items = state.group.members.map(function (m) {
      const li = el("li");
      li.appendChild(el("span", "dot off"));
      li.appendChild(document.createTextNode(m.name));
      ready.appendChild(li);
      return li;
    });
    items.forEach(function (li, i) {
      later(function () { li.classList.add("ready"); li.firstChild.className = "dot"; }, 500 + i * 750);
    });
    let count = 5;
    $("lobby-count").textContent = String(count);
    const id = every(function () {
      count -= 1;
      $("lobby-count").textContent = String(Math.max(count, 0));
      if (count <= 0) { clearInterval(id); openRoom(); }
    }, reduceMotion ? 250 : 1000);
  });
  $("lobby-cancel").addEventListener("click", function () {
    stopAll();
    $("lobby").hidden = true;
    $("match-actions").hidden = false;
  });
  function tierLevel(tier) { return tier <= 2 ? "beginner" : tier === 3 ? "intermediate" : "advanced"; }

  // ---------- 05 room ----------
  async function openRoom() {
    status("Opening the room…");
    try {
      state.plan = await state.planRequest;
    } catch (error) {
      $("lobby").hidden = true;
      $("match-actions").hidden = false;
      status(error.message, true);
      return;
    }
    show(5);
    noteServed(state.plan, $("plan-badge"));
    state.promptIndex = 0;
    $("room-question").textContent = state.plan.question;
    $("room-prompt").textContent = state.plan.prompts[0];
    renderRoomMembers();
    $("chat").replaceChildren();
    addMessage({name: "Further", text: "Room open. Start with the prompt above. People explain; I only keep you on track.", ai: true});
    playScript(state.group.script);
    startTimer(state.profile.availability_minutes);
  }
  function renderRoomMembers() {
    const list = $("room-members");
    list.replaceChildren();
    const people = [{name: state.profile.name || "You", tier: state.profile.tier, you: true}].concat(state.group.members);
    people.forEach(function (p) {
      const li = el("li");
      li.appendChild(el("span", "dot"));
      li.appendChild(el("span", p.you ? "you" : "", p.name + (p.you ? " (you)" : "")));
      li.appendChild(pips(p.tier));
      list.appendChild(li);
    });
    $("room-count").textContent = people.length + " here";
  }
  function addMessage(message) {
    const li = el("li", "msg" + (message.me ? " me" : "") + (message.ai ? " ai" : ""));
    li.appendChild(avatar(message.ai ? "↗" : message.name));
    const meta = el("span", "meta");
    meta.appendChild(el("b", "", message.name));
    meta.appendChild(document.createTextNode(message.ai ? "facilitator" : message.me ? "you" : "tier " + message.tier + " · sample"));
    li.appendChild(meta);
    li.appendChild(el("p", "", message.text));
    const log = $("chat");
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  }
  function playScript(lines) {
    let at = 1400;
    lines.forEach(function (line) {
      later(function () { $("typing").textContent = line.name + " is typing…"; }, at);
      at += 1700;
      later(function () { $("typing").textContent = ""; addMessage(line); }, at);
      at += 1600;
    });
  }
  function startTimer(minutes) {
    const total = minutes * 60;
    let left = total;
    function paint() {
      const m = Math.floor(left / 60);
      const s = left % 60;
      $("timer").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
      $("timer-bar").style.width = (left / total * 100) + "%";
      $("timer").classList.toggle("done", left === 0);
    }
    paint();
    const id = every(function () {
      left = Math.max(0, left - 1);
      paint();
      if (left === 0) { clearInterval(id); status("Time's up. Wrap up when you're ready."); }
    }, 1000);
  }
  $("next-prompt").addEventListener("click", function () {
    if (!state.plan) return;
    state.promptIndex = (state.promptIndex + 1) % state.plan.prompts.length;
    $("room-prompt").textContent = state.plan.prompts[state.promptIndex];
  });
  $("chat-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const text = $("chat-input").value.trim();
    if (!text) return;
    addMessage({name: state.profile.name || "You", text: text, me: true});
    $("chat-input").value = "";
  });
  $("wrap-go").addEventListener("click", function () { show(6); renderWrap(); });

  // ---------- 06 wrap-up ----------
  function renderWrap() {
    state.marked = new Set();
    $("wrap-check").textContent = state.plan.check;
    $("explain").value = "";
    $("wrap-form").hidden = false;
    $("wrap-result").hidden = true;
    const list = $("peer-explains");
    list.replaceChildren();
    state.group.members.forEach(function (m) {
      const li = el("li");
      li.appendChild(el("span", "meta", m.name + " · tier " + m.tier + " · sample"));
      const button = el("button", "mark", "Explained clearly");
      button.type = "button";
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", function () {
        const on = !state.marked.has(m.id);
        if (on) state.marked.add(m.id); else state.marked.delete(m.id);
        button.setAttribute("aria-pressed", String(on));
        button.textContent = on ? "✓ Explained clearly" : "Explained clearly";
      });
      li.appendChild(button);
      li.appendChild(el("p", "", m.explain_back));
      list.appendChild(li);
    });
  }
  $("wrap-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    $("wrap-submit").disabled = true;
    try {
      const result = await api("/api/wrapup", {
        profile: state.profile, explanation: $("explain").value,
        members: state.group.members.map(function (m) { return m.id; }),
        marked: Array.from(state.marked)
      });
      if (!state.trail) {
        state.trail = result.sample_history.slice();
        state.reputation = result.sample_reputation;
      }
      const before = state.reputation;
      state.reputation += result.reputation_gained;
      state.trail.push(result.entry);
      state.profile.tier = result.tier_after;
      showResult(result, before);
    } catch (error) {
      status(error.message, true);
    } finally {
      $("wrap-submit").disabled = false;
    }
  });
  function showResult(result, before) {
    $("wrap-form").hidden = true;
    $("wrap-result").hidden = false;
    $("tier-concept").textContent = result.concept;
    const moved = result.tier_after > result.tier_before;
    $("tier-change").textContent = "T" + result.tier_before + " → T" + result.tier_after;
    const pipBox = $("tier-pips");
    pipBox.replaceChildren();
    for (let i = 1; i <= 5; i++) pipBox.appendChild(el("i", i <= result.tier_before ? "on" : ""));
    if (moved) later(function () { pipBox.children[result.tier_after - 1].className = "on new"; }, 500);
    $("tier-reason").textContent = (moved ? "Up to tier " + result.tier_after + ", " + TIER_NAMES[result.tier_after].toLowerCase() + ". " : "")
      + result.tier_reason;
    $("marks-note").textContent = result.marks_received + " of " + state.group.members.length
      + " sample peers marked your explanation clear (simulated from its length, not judged by AI).";
    $("rep-gain").textContent = result.reputation_gained ? "+" + result.reputation_gained : "";
    countUp($("rep-total"), before, state.reputation);
    const breakdown = $("rep-breakdown");
    breakdown.replaceChildren();
    result.reputation_breakdown.forEach(function (item) {
      const li = el("li");
      li.appendChild(el("span", "", item.label));
      li.appendChild(el("span", "", "+" + item.points));
      breakdown.appendChild(li);
    });
    renderTrail();
    $("wrap-result").scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block: "start"});
  }
  function countUp(node, from, to) {
    if (reduceMotion || from === to) { node.textContent = String(to); return; }
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / 900);
      node.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }
  function renderTrail() {
    const list = $("trail");
    list.replaceChildren();
    state.trail.forEach(function (entry, i) {
      const li = el("li", i === state.trail.length - 1 ? "now" : "");
      li.appendChild(el("strong", "", entry.concept));
      li.appendChild(el("span", "meta", entry.focus_area + " · " + entry.when + (entry.sample ? " · sample history" : "")));
      li.appendChild(el("span", "move", "tier " + entry.tier_before + " → " + entry.tier_after));
      list.appendChild(li);
    });
  }
  $("to-map").addEventListener("click", function () { show(3); renderMap(); });
  $("restart").addEventListener("click", function () {
    state.group = null;
    state.plan = null;
    state.shown = [];
    $("intent").value = "";
    show(1);
    $("intent").focus();
  });

  // ---------- boot ----------
  api("/api/health").then(function (health) {
    const p = health.providers || {};
    const live = (p.order || []).filter(function (n) { return n !== "demo" && p.configured && p.configured[n]; });
    const badge = $("ai-badge");
    badge.textContent = live.length ? "AI · ready · " + live.join(" → ") + " → demo" : "AI · demo · no keys set";
    badge.classList.toggle("live", live.length > 0);
    badge.title = "Provider order: " + (p.order || []).join(" → ");
  }).catch(function (error) { status(error.message, true); });

  api("/api/learners").then(function (data) {
    state.learners = data.learners;
    state.clusters = data.clusters;
    $("online-count").textContent = String(data.online);
    $("online-top").textContent = String(data.online);
    const options = $("focus-options");
    data.clusters.forEach(function (c) { const o = el("option"); o.value = c.label; options.appendChild(o); });
  }).catch(function (error) { status(error.message, true); });

  show(1);
})();
