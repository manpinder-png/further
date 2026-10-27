"use strict";
let currentGoal = null;
let formVersion = 0;
const form = document.getElementById("goal-form");
const matches = document.getElementById("matches");
const status = document.getElementById("status");
const session = document.getElementById("session");
const matchButton = document.getElementById("match-button");

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

async function api(path, goal) {
  const response = await fetch(path, {
    method: goal ? "POST" : "GET",
    headers: goal ? {"Content-Type": "application/json"} : {},
    body: goal ? JSON.stringify(goal) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function showStatus(message, error) {
  status.textContent = message;
  status.className = error ? "status error" : "status";
}

async function openPractice(peer, goal, button) {
  const version = formVersion;
  button.disabled = true;
  showStatus("Preparing a short session…", false);
  try {
    const plan = await api("/api/plan", goal);
    if (version !== formVersion) return;
    document.getElementById("session-peer").textContent = "Practice with " + peer.name + " (sample peer). No other person is connected.";
    document.getElementById("shared-question").textContent = plan.question;
    document.getElementById("understanding-check").textContent = plan.check;
    document.getElementById("plan-mode").textContent = plan.mode === "meta" ? "Meta · " + plan.model : "Demo prompts · no AI call";
    const prompts = document.getElementById("prompts");
    prompts.replaceChildren();
    plan.prompts.forEach(function (prompt) { prompts.appendChild(el("li", "", prompt)); });
    document.getElementById("explanation").value = "";
    session.hidden = false;
    session.scrollIntoView({behavior: "smooth", block: "start"});
    showStatus("Practice session ready. Live peer collaboration is a tracked next step.", false);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function renderMatches(peers, goal) {
  matches.replaceChildren();
  if (!peers.length) {
    matches.appendChild(el("p", "empty-copy", "No sample peer fits this question, language, and time. Try the GPU example in English with 15 minutes, or SQL joins."));
    return;
  }
  peers.forEach(function (peer) {
    const card = el("article", "peer");
    const top = el("div", "peer-top");
    top.appendChild(el("span", "avatar", peer.name.charAt(0)));
    const identity = el("div", "");
    identity.appendChild(el("h3", "", peer.name));
    identity.appendChild(el("span", "quiet", "Sample peer · " + peer.level));
    top.appendChild(identity);
    card.appendChild(top);
    card.appendChild(el("p", "peer-topic", peer.topic));
    card.appendChild(el("p", "peer-meta", peer.language + " · " + peer.minutes + " minutes available"));
    card.appendChild(el("p", "reason", peer.reason));
    const button = el("button", "secondary", "Open practice session ↗");
    button.type = "button";
    button.addEventListener("click", function () { openPractice(peer, goal, button); });
    card.appendChild(button);
    matches.appendChild(card);
  });
}

form.addEventListener("input", function () {
  formVersion += 1;
  session.hidden = true;
  matches.replaceChildren(el("p", "empty-copy", "Your question changed. Find a partner again to update the results."));
});

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  const values = new FormData(form);
  currentGoal = {
    topic: values.get("topic"), level: values.get("level"),
    language: values.get("language"), minutes: Number(values.get("minutes"))
  };
  const version = ++formVersion;
  matchButton.disabled = true;
  session.hidden = true;
  showStatus("Looking for shared concepts…", false);
  try {
    const data = await api("/api/matches", currentGoal);
    if (version !== formVersion) return;
    renderMatches(data.matches, currentGoal);
    showStatus(data.matches.length + " sample matches. This is a keyword baseline, not semantic matching yet.", false);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    matchButton.disabled = false;
  }
});

api("/api/health").then(function (health) {
  document.getElementById("mode-label").textContent = health.ai_mode === "meta"
    ? "Live Meta plans · sample peers"
    : "Local starter · sample peers · no AI calls";
}).catch(function (error) { showStatus(error.message, true); });
