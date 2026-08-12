// Signoff observability dashboard.
// Vanilla JS, no build step, no framework - this has to run the moment the
// repo is cloned and the server is started, with nothing to `npm install`.
// Every number on screen comes from a real /api/* call or /ws/events push.
// Nothing here generates mock data.

const ACCENT = "#5980a6", ACC7 = "#416180", MUTED = "#7a7a7d", ALERT = "#a8563f";
const TYPE_COLOR = {
  PreToolUse: MUTED, PostToolUse: "#1d1f20", SubagentStart: ACCENT,
  SubagentStop: ACC7, HookBlock: ALERT, ReviewGate: ACCENT, Stop: MUTED,
};

const fmt = n => n == null ? "—" : n >= 1e6 ? (n/1e6).toFixed(2)+"M" : n >= 1e3 ? (n/1e3).toFixed(1)+"k" : String(Math.round(n));
const money = n => "$" + (n == null ? "0.00" : n < 10 ? n.toFixed(2) : n.toFixed(1));
const dur = s => { if (s == null) return "—"; return s >= 60 ? Math.floor(s/60)+"m "+String(Math.round(s%60)).padStart(2,"0")+"s" : s.toFixed(1)+"s"; };
const clock = iso => { try { const d = new Date(iso); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+":"+String(d.getSeconds()).padStart(2,"0"); } catch { return "—"; } };
const ago = ms => { if (!ms) return "—"; const m = Math.round((Date.now()-ms)/60000); return m < 1 ? "just now" : m < 60 ? m+"m ago" : Math.round(m/60)+"h ago"; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const state = {
  view: "overview",
  streaming: true,
  wsConnected: false,
  events: [],           // live-pushed events, newest first, capped
  summary: null,
  agents: [],
  detailAgent: null,
  detailRuns: [],
  tokens: null,
  tokAgent: "all agents",
  tokRange: "24h",
  reviewLog: [],
  evAgent: "all agents",
  evType: "all",
  evSearch: "",
  serverEvents: [],      // /api/events query result
  openPayload: {},
  query: "",
  answer: null,
  report: null,
  reportBusy: false,
};

async function api(path, opts) {
  const res = await fetch("/api" + path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let refreshTimer = null;
function scheduleRefresh() {
  if (refreshTimer) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await refreshForView();
    render();
  }, 1200);
}

async function refreshForView() {
  try {
    if (state.view === "overview") {
      state.summary = await api("/summary");
      state.agents = await api("/agents");
    } else if (state.view === "agents") {
      state.agents = await api("/agents");
      if (state.detailAgent) {
        state.detailRuns = await api(`/agents/${encodeURIComponent(state.detailAgent)}/runs?limit=50`);
      }
    } else if (state.view === "tokens") {
      state.tokens = await api(`/tokens?agent=${encodeURIComponent(state.tokAgent)}&range=${state.tokRange}`);
    } else if (state.view === "events") {
      await loadEvents();
    }
  } catch (e) { console.error(e); }
}

async function loadEvents() {
  const params = new URLSearchParams();
  if (state.evAgent !== "all agents") params.set("agent", state.evAgent);
  if (state.evType !== "all") params.set("type", state.evType);
  if (state.evSearch) params.set("q", state.evSearch);
  params.set("limit", "150");
  state.serverEvents = await api("/events?" + params.toString());
}

function connectWS() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws/events`);
  ws.onopen = () => { state.wsConnected = true; render(); };
  ws.onclose = () => { state.wsConnected = false; render(); setTimeout(connectWS, 2000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (msg) => {
    try {
      const parsed = JSON.parse(msg.data);
      if (parsed.type === "event" && state.streaming) {
        state.events = [parsed.data].concat(state.events).slice(0, 300);
        scheduleRefresh();
        if (state.view === "overview" || state.view === "events") render();
      }
    } catch {}
  };
}

async function setView(v) {
  state.view = v;
  await refreshForView();
  render();
}

// ---------------------------------------------------------------- shell --

function shell(content) {
  const tabs = [
    ["overview", "Overview"], ["agents", "Agents"], ["tokens", "Tokens"],
    ["events", "Live log"], ["ask", "Interrogate"], ["report", "Report"], ["spec", "Handoff spec"],
  ];
  const activeAgent = state.agents.find(a => a.running);
  const epm = state.events.filter(e => Date.now() - new Date(e.ts).getTime() < 60000).length;
  return `
  <div style="min-height:100vh">
    <header style="position:sticky;top:0;z-index:6;background:var(--color-bg);border-bottom:1px solid var(--color-divider)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;padding:11px 22px 9px">
        <div style="display:flex;align-items:baseline;gap:12px">
          <span style="font-family:var(--font-heading);font-size:20px;letter-spacing:-.01em">AGENT-TEAM-KIT</span>
          <span style="font-size:10px;letter-spacing:.18em;text-transform:uppercase" class="muted">Observability · local</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px" class="mono">
          <div style="display:flex;align-items:center;gap:7px">
            <span style="width:7px;height:7px;display:block;background:${state.wsConnected ? ACCENT : "#b7b7ba"};animation:${state.wsConnected ? "livepulse 1.6s infinite" : "none"}"></span>
            <span style="font-size:10px;letter-spacing:.12em;text-transform:uppercase">${state.wsConnected ? (state.streaming ? "streaming · events.jsonl" : "stream paused") : "connecting…"}</span>
          </div>
          <div style="width:1px;height:24px;background:var(--color-divider)"></div>
          <div style="text-align:right"><div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.5">Active agent</div><div style="font-family:var(--font-heading);font-size:15px;color:var(--color-accent-700)">${esc(activeAgent ? activeAgent.name : "none")}</div></div>
          <div style="text-align:right"><div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;opacity:.5">Events/min</div><div style="font-family:var(--font-heading);font-size:15px">${epm}</div></div>
          <button id="btn-stream" class="btn btn-secondary" style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px">${state.streaming ? "Pause" : "Resume"}</button>
        </div>
      </div>
      <nav id="nav" style="display:flex;gap:0;padding:0 22px">
        ${tabs.map(([id,label]) => `<button data-tab="${id}" class="btn btn-ghost ${state.view===id?"active":""}" style="display:flex;align-items:center;gap:7px;padding:7px 15px;margin-bottom:-1px;font-family:var(--font-heading);font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;border:1px solid transparent;border-bottom:none">${label}</button>`).join("")}
      </nav>
    </header>
    <main style="padding:20px 22px 42px">${content}</main>
  </div>`;
}

// ------------------------------------------------------------ overview --

function viewOverview() {
  const s = state.summary;
  if (!s) return `<div class="muted">Loading…</div>`;
  const kpis = [
    { label: "Tokens · logged", value: fmt(s.tokens_today), unit: "tok", note: `across ${s.agents_seen} agents seen` },
    { label: "Est. cost", value: money(s.cost_estimate), unit: "USD", note: `${s.rates_model || ""} · see config/rates.json` },
    { label: "Events", value: fmt(s.event_count), unit: "evt", note: "retained in rollup.db" },
    { label: "Stages reviewed", value: String(s.stages_reviewed), unit: "", note: s.running_agents.length ? `${s.running_agents.join(", ")} running` : "none running now" },
  ];
  const recent = state.events.slice(0, 9);
  return `
  <div style="display:flex;flex-direction:column;gap:22px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${kpis.map(k => `
        <div class="blueprint" style="padding:13px 15px 12px">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
          <div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase" class="muted">${esc(k.label)}</div>
          <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px">
            <span style="font-family:var(--font-heading);font-size:33px;line-height:1" class="mono">${esc(k.value)}</span>
            <span style="font-size:11.5px" class="muted">${esc(k.unit)}</span>
          </div>
          <div style="font-size:10px;margin-top:7px" class="muted">${esc(k.note)}</div>
        </div>`).join("")}
    </div>

    <div class="blueprint" style="padding:15px">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:9px">
        <h5 style="margin:0;font-size:14px">Latest events</h5>
        <button data-tab="events" class="btn btn-ghost" style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--color-accent-700)">Full log →</button>
      </div>
      <div style="display:flex;flex-direction:column">
        ${recent.length ? recent.map(e => `
          <div style="display:grid;grid-template-columns:56px 104px 1fr;gap:9px;padding:4.5px 0;border-bottom:1px solid color-mix(in srgb,var(--color-text) 9%,transparent);font-size:11px;align-items:baseline">
            <span class="mono muted">${clock(e.ts)}</span>
            <span style="font-family:var(--font-heading);font-size:11.5px;letter-spacing:.04em;color:${TYPE_COLOR[e.hook_event_name]||MUTED}">${esc(e.hook_event_name)}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span class="muted">${esc(e.agent)}</span> ${esc(e.summary)}</span>
          </div>`).join("") : `<div class="muted" style="padding:10px 0">No events yet — start a Claude Code session in this project with the hooks installed.</div>`}
      </div>
    </div>
  </div>`;
}

// -------------------------------------------------------------- agents --

function viewAgents() {
  const rows = state.agents.slice().sort((a,b) => b.total_tokens - a.total_tokens);
  const detail = state.detailAgent ? state.agents.find(a => a.name === state.detailAgent) : null;
  return `
  <div style="display:flex;flex-direction:column;gap:18px">
    <table class="atk-table">
      <thead><tr><th>Agent</th><th style="text-align:right">Runs</th><th style="text-align:right">Avg dur</th><th style="text-align:right">Avg tokens</th><th style="text-align:right">Est. cost</th><th style="text-align:right">Success</th><th style="text-align:right">Last run</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(a => `
          <tr class="clickable" data-agent="${esc(a.name)}">
            <td><span style="display:inline-block;width:6px;height:6px;background:${a.running?ACCENT:(a.ok_pct<85?ALERT:MUTED)};margin-right:8px"></span><span style="font-family:var(--font-heading);font-size:14.5px">${esc(a.name)}</span></td>
            <td style="text-align:right" class="mono">${a.runs}</td>
            <td style="text-align:right" class="mono">${dur(a.avg_duration_s)}</td>
            <td style="text-align:right" class="mono">${fmt(a.avg_tokens)}</td>
            <td style="text-align:right" class="mono">${money(a.est_cost)}</td>
            <td style="text-align:right" class="mono" style="color:${a.ok_pct<85?ALERT:"inherit"}">${a.ok_pct}%</td>
            <td style="text-align:right;opacity:.6" class="mono">${a.running ? "running" : ago(a.last_ts_ms)}</td>
          </tr>`).join("") : `<tr><td colspan="7" class="muted">No agent activity logged yet.</td></tr>`}
      </tbody>
    </table>

    ${detail ? `
    <div class="blueprint" style="padding:17px">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:13px">
        <div style="display:flex;align-items:baseline;gap:11px">
          <h4 style="margin:0;font-size:21px">${esc(detail.name)}</h4>
          <span style="font-size:11px" class="muted">${detail.runs} runs · ${detail.ok_pct}% completed · ${fmt(detail.total_tokens)} tok lifetime</span>
        </div>
        <div style="display:flex;gap:12px;align-items:center">
          <button id="btn-interrogate-detail" class="btn btn-ghost" style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px">Interrogate →</button>
          <button id="btn-close-detail" class="btn btn-ghost" style="opacity:.55;padding:2px 6px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase">Close ✕</button>
        </div>
      </div>
      <table class="atk-table" style="font-size:11.5px">
        <tbody>
          ${state.detailRuns.length ? state.detailRuns.map(r => `
            <tr>
              <td style="opacity:.55;width:150px">${ago(new Date(r.when).getTime())}</td>
              <td style="color:${r.ok?ACC7:ALERT};font-family:var(--font-heading);letter-spacing:.06em;width:110px">${r.ok?"completed":"interrupted"}</td>
              <td style="text-align:right;width:86px" class="mono">${dur(r.duration_s)}</td>
              <td style="text-align:right;width:104px" class="mono">${fmt(r.tokens)}</td>
              <td style="text-align:right;width:82px" class="mono">${money(r.cost)}</td>
            </tr>`).join("") : `<tr><td class="muted">No runs recorded yet for this agent.</td></tr>`}
        </tbody>
      </table>
    </div>` : ""}
  </div>`;
}

// -------------------------------------------------------------- tokens --

function viewTokens() {
  const t = state.tokens;
  const agentOptions = ["all agents"].concat(state.agents.map(a => a.name));
  const kpis = t ? [
    { label: "Total · range", value: fmt(t.total), note: state.tokAgent },
    { label: "Output share", value: t.output_share + "%", note: "output tokens of total" },
    { label: "Cache read", value: fmt(t.cache_read), note: "billed at 10% of input" },
    { label: "Est. cost · range", value: money(t.est_cost), note: "see assumption below" },
  ] : [];
  const rate = t ? t.rates : {};
  return `
  <div style="display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <select id="sel-tok-agent" class="input" style="width:auto;min-height:0;border-radius:0;background:transparent;color:var(--color-text);border:1px solid var(--color-divider);padding:6px 11px;font-size:11.5px">
        ${agentOptions.map(o => `<option value="${esc(o)}" ${o===state.tokAgent?"selected":""}>${esc(o)}</option>`).join("")}
      </select>
      <div style="display:flex;border:1px solid var(--color-divider)">
        ${["24h","7d","session"].map(r => `<button data-range="${r}" class="btn btn-secondary" style="border:none;padding:6px 13px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;font-family:var(--font-heading);background:${state.tokRange===r?ACCENT:"transparent"};color:${state.tokRange===r?"#fff":"inherit"}">${r==="24h"?"Last 24h":r==="7d"?"7 days":"By session"}</button>`).join("")}
      </div>
    </div>

    ${t ? `
    <div class="blueprint" style="padding:17px">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      ${barsSVG(t.series)}
      <div style="display:flex;justify-content:space-between;font-size:10px;opacity:.5;margin-top:7px" class="mono">
        ${t.series.map(d => `<span>${esc(d.label||"·")}</span>`).join("")}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${kpis.map(k => `
        <div style="border:1px solid var(--color-divider);padding:12px 14px">
          <div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase" class="muted">${esc(k.label)}</div>
          <div style="font-family:var(--font-heading);font-size:26px;margin-top:5px" class="mono">${esc(k.value)}</div>
          <div style="font-size:10px;margin-top:4px" class="muted">${esc(k.note)}</div>
        </div>`).join("")}
    </div>

    <div style="border:1px solid var(--color-accent-600);padding:12px 14px;display:flex;gap:12px;align-items:flex-start">
      <span class="tag" style="font-size:9px;letter-spacing:.1em;padding:2px 6px;background:var(--color-accent);color:#fff;white-space:nowrap;margin-top:1px">ESTIMATE</span>
      <div style="font-size:11.5px;line-height:1.5;color:color-mix(in srgb,var(--color-text) 78%,transparent)">
        Cost is computed locally as tokens × rate, assuming <strong>${esc(t.model)}</strong> at $${rate.input}/Mtok in, $${rate.output}/Mtok out. Cache reads billed at 10% of input. Rates read from <code>config/rates.json</code>, not fetched. Reconcile against your Anthropic console for anything that matters financially.
      </div>
    </div>` : `<div class="muted">Loading…</div>`}
  </div>`;
}

function barsSVG(series) {
  const W = 900, H = 250;
  const max = Math.max(1, ...series.map(d => d.i + d.o + d.c));
  const step = W / series.length, w = step * 0.62, pad = (step - w) / 2;
  const ACC3 = "#b5d9fd", ACC5 = "#749dc4";
  let rects = "";
  series.forEach((d, idx) => {
    let y = H;
    [["c", ACC3], ["i", ACC5], ["o", ACC7]].forEach(([k, fill]) => {
      const h = (d[k] / max) * (H - 6);
      y -= h;
      rects += `<rect x="${(idx*step+pad).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h,0.5).toFixed(1)}" fill="${fill}"></rect>`;
    });
  });
  const gridY = [40,90,140,190,240];
  const grid = gridY.map(y => `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="rgba(29,31,32,.10)" stroke-width="1"></line>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="250" preserveAspectRatio="none">${grid}${rects}</svg>`;
}

// -------------------------------------------------------------- events --

function viewEvents() {
  const agentOptions = ["all agents"].concat(state.agents.map(a => a.name));
  const types = ["all", "PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop", "HookBlock", "ReviewGate"];
  const rows = state.serverEvents;
  return `
  <div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <select id="sel-ev-agent" class="input" style="width:auto;min-height:0;border-radius:0;background:transparent;color:var(--color-text);border:1px solid var(--color-divider);padding:6px 11px;font-size:11.5px">
        ${agentOptions.map(o => `<option value="${esc(o)}" ${o===state.evAgent?"selected":""}>${esc(o)}</option>`).join("")}
      </select>
      <div style="display:flex;border:1px solid var(--color-divider);flex-wrap:wrap">
        ${types.map(t => `<button data-type="${t}" class="btn btn-secondary" style="border:none;padding:6px 11px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;font-family:var(--font-heading);background:${state.evType===t?ACCENT:"transparent"};color:${state.evType===t?"#fff":"inherit"};border-right:1px solid var(--color-divider)">${t==="all"?"all types":t}</button>`).join("")}
      </div>
      <input id="inp-ev-search" value="${esc(state.evSearch)}" placeholder="filter payload text…" class="input" style="width:auto;min-height:0;border-radius:0;background:transparent;color:var(--color-text);border:1px solid var(--color-divider);padding:6px 11px;font-size:11.5px;min-width:190px">
      <span style="margin-left:auto;font-size:11px" class="muted mono">${rows.length} events</span>
    </div>
    <div style="border:1px solid var(--color-divider)">
      <div style="display:grid;grid-template-columns:78px 118px 128px 1fr 66px;gap:10px;padding:6px 12px;border-bottom:1px solid var(--color-text);font-family:var(--font-heading);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase" class="muted">
        <span>Time</span><span>Event</span><span>Agent</span><span>Detail</span><span style="text-align:right">Tokens</span>
      </div>
      <div style="max-height:560px;overflow-y:auto">
        ${rows.length ? rows.map(e => `
          <div style="border-bottom:1px solid color-mix(in srgb,var(--color-text) 9%,transparent);background:${e.type==="HookBlock"?"color-mix(in srgb,"+ALERT+" 8%,transparent)":"transparent"}">
            <div class="ev-row" data-id="${esc(e.id)}" style="cursor:pointer;display:grid;grid-template-columns:78px 118px 128px 1fr 66px;gap:10px;padding:5px 12px;font-size:11.5px;align-items:baseline" class="mono">
              <span class="muted">${clock(e.ts)}</span>
              <span style="font-family:var(--font-heading);font-size:12px;letter-spacing:.04em;color:${TYPE_COLOR[e.type]||MUTED}">${esc(e.type)}</span>
              <span style="opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.agent)}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.summary)}</span>
              <span style="text-align:right;opacity:.6">${e.tok ? fmt(e.tok) : "—"}</span>
            </div>
            ${state.openPayload[e.id] ? `<pre style="margin:0;padding:10px 14px 12px 100px;font-size:11px;line-height:1.5;white-space:pre-wrap;background:color-mix(in srgb,var(--color-text) 5%,transparent);color:color-mix(in srgb,var(--color-text) 82%,transparent)">${esc(prettyPayload(e.payload))}</pre>` : ""}
          </div>`).join("") : `<div class="muted" style="padding:14px">No events match this filter.</div>`}
      </div>
    </div>
  </div>`;
}

function prettyPayload(raw) {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw || ""; }
}

// ----------------------------------------------------------------- ask --

function viewAsk() {
  const suggestions = state.agents.length
    ? [`what did the ${state.agents[0].name} agent just do?`, "which agent burned the most tokens?", "why did anything get blocked?"]
    : ["what did the pipeline just do?", "which agent burned the most tokens?", "why did anything get blocked?"];
  const a = state.answer;
  return `
  <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:start">
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:9px">
        <input id="inp-ask" value="${esc(state.query)}" placeholder="what did the backend-developer just do?" class="input" style="flex:1;border-radius:0;background:transparent;color:var(--color-text);border:1px solid var(--color-text);padding:9px 12px;font-size:13.5px">
        <button id="btn-ask" class="btn btn-primary blueprint" style="color:#fff;padding:9px 18px;font-size:12.5px;letter-spacing:.1em;text-transform:uppercase">
          <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>Ask
        </button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${suggestions.map(s => `<button data-suggest="${esc(s)}" class="btn btn-secondary" style="padding:4px 10px;font-size:11px;color:color-mix(in srgb,var(--color-text) 70%,transparent)">${esc(s)}</button>`).join("")}
      </div>
      ${a ? `
      <div class="blueprint" style="padding:16px">
        <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:11px">
          <span class="tag tag-outline" style="font-size:9px;letter-spacing:.1em;padding:2px 7px;color:${a.scope==="running"?ACCENT:MUTED};border-color:${a.scope==="running"?ACCENT:MUTED}">${a.scope==="running"?"RUNNING · PARTIAL":"PAST RUN · COMPLETE"}</span>
          <span style="font-size:11px" class="muted">${a.scope==="running"?"summarised from logged events only — the in-flight turn is not visible":"full event span available"}</span>
        </div>
        <h4 style="margin:0 0 9px;font-size:19px">${esc(a.title)}</h4>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:13px">
          ${a.lines.map(l => `<div style="display:flex;gap:9px;font-size:12.5px;line-height:1.5"><span style="color:var(--color-accent);flex:none">—</span><span>${esc(l)}</span></div>`).join("")}
        </div>
        <div style="font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;opacity:.5;margin-bottom:6px">Evidence · ${a.evidence.length} events retrieved from the log</div>
        <div style="display:flex;flex-direction:column;border-top:1px solid color-mix(in srgb,var(--color-text) 12%,transparent)">
          ${a.evidence.map(e => `
            <div style="display:grid;grid-template-columns:66px 116px 1fr;gap:9px;padding:4px 0;border-bottom:1px solid color-mix(in srgb,var(--color-text) 9%,transparent);font-size:11px" class="mono">
              <span class="muted">${clock(e.ts)}</span>
              <span style="font-family:var(--font-heading);font-size:11.5px;color:${TYPE_COLOR[e.type]||MUTED}">${esc(e.type)}</span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.summary)}</span>
            </div>`).join("")}
        </div>
      </div>` : ""}
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="border:1px solid var(--color-accent-600);padding:13px 15px">
        <h5 style="margin:0 0 7px;font-size:14px">There is no live channel into a running agent</h5>
        <p style="margin:0 0 8px;font-size:11.5px;line-height:1.55;color:color-mix(in srgb,var(--color-text) 75%,transparent)">Claude Code subagents don't expose an interrogation API. This does retrieval over what's already logged - hook events plus this run's summary - and answers from that. It never talks to a live process.</p>
      </div>
      <div style="border:1px solid var(--color-divider);padding:13px 15px">
        <div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.5;margin-bottom:8px">Retrieval scope</div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid color-mix(in srgb,var(--color-text) 9%,transparent);font-size:11.5px" class="mono"><span class="muted">Events in rollup.db</span><span>${state.summary ? state.summary.event_count : "—"}</span></div>
        <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11.5px" class="mono"><span class="muted">Agents seen</span><span>${state.agents.length}</span></div>
      </div>
    </div>
  </div>`;
}

// -------------------------------------------------------------- report --

function viewReport() {
  const r = state.report;
  return `
  <div style="display:flex;flex-direction:column;gap:16px;max-width:900px">
    <div class="blueprint" style="padding:16px">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <h4 style="margin:0 0 8px;font-size:18px">Handover report</h4>
      <p style="margin:0 0 12px;font-size:11.5px;line-height:1.55" class="muted">
        Assembled from what's actually logged: time and tokens from the event rollup, decisions from
        every "Alternative considered / Why rejected" block written into docs/*.md, achievements and
        flaws from review-log.md and hook-block/review-gate events. Nothing here is LLM-written narrative.
      </p>
      <button id="btn-gen-report" class="btn btn-primary" style="padding:8px 16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase">${state.reportBusy ? "Generating…" : "Generate / refresh report"}</button>
      ${r && r.exists !== false ? `<a href="/api/report" download="handover-report.md" style="margin-left:12px;font-size:11px">download docs/handover-report.md</a>` : ""}
    </div>
    ${r && r.content ? `<pre style="margin:0;white-space:pre-wrap;font-size:12px;line-height:1.6;border:1px solid var(--color-divider);padding:16px;background:color-mix(in srgb,var(--color-text) 3%,transparent)">${esc(r.content)}</pre>` : `<div class="muted">No report generated yet this session.</div>`}
  </div>`;
}

// ---------------------------------------------------------------- spec --

function viewSpec() {
  const rows = [
    ["Live event stream", "LIVE", "WebSocket /ws/events, fed by a poll-tail of .claude/logs/events.jsonl"],
    ["Token counts & cost", "LIVE", "usage blocks in events.jsonl, summed per subagent run in rollup.db"],
    ["Per-agent aggregates", "LIVE", "SubagentStart/Stop pairs from the event log, in rollup.db"],
    ["Pipeline stage status", "LIVE", "docs/review-log.md, parsed for gate decisions"],
    ["Hook block entries", "LIVE", "the denying hook itself logs the HookBlock/ReviewGate event"],
    ["Interrogation retrieval", "LIVE", "runs server-side over rollup.db - real filtering, not a canned answer"],
    ["Cost rates", "LIVE", "config/rates.json, hardcoded per model and editable - no pricing fetch"],
    ["Handover report", "LIVE", "scans docs/*.md + rollup.db - no LLM call, no invented narrative"],
  ];
  return `
  <div style="display:flex;flex-direction:column;gap:24px;max-width:1180px">
    <div>
      <h4 style="margin:0 0 10px;font-size:18px">Wiring status</h4>
      <table class="atk-table">
        <thead><tr><th style="width:210px">Surface</th><th style="width:110px">State</th><th>Source of truth</th></tr></thead>
        <tbody>
          ${rows.map(([surface,st,src]) => `<tr><td style="font-family:var(--font-heading);font-size:13.5px">${esc(surface)}</td><td><span class="tag tag-outline" style="font-size:9px;letter-spacing:.1em;padding:2px 7px;border-color:${ACC7};color:${ACC7}">${st}</span></td><td style="color:color-mix(in srgb,var(--color-text) 78%,transparent)">${esc(src)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>
    <div class="blueprint" style="padding:16px">
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
      <h5 style="margin:0 0 9px;font-size:15px">Run it alongside a session</h5>
      <pre style="margin:0;font-size:11.5px;line-height:1.6;white-space:pre-wrap;background:color-mix(in srgb,var(--color-text) 5%,transparent);padding:13px">${esc(RUNBOOK)}</pre>
    </div>
  </div>`;
}

const RUNBOOK = `# terminal 1 — the dashboard (from the project repo root)
python3 scripts/observability/server.py
# or: PORT=9000 python3 scripts/observability/server.py

# terminal 2 — your normal Claude Code session
claude

# then open the URL printed in terminal 1 (defaults to http://localhost:8787)
# the server tails .claude/logs/events.jsonl and pushes over /ws/events;
# no cloud calls, no telemetry, nothing leaves the machine.
# it keeps running until you stop it - leave it up for the life of the project.`;

// -------------------------------------------------------------- render --

function render() {
  const view = state.view;
  const content = {
    overview: viewOverview, agents: viewAgents, tokens: viewTokens,
    events: viewEvents, ask: viewAsk, report: viewReport, spec: viewSpec,
  }[view]();
  document.getElementById("app").innerHTML = shell(content);
  wireEvents();
  if (window.lucide) lucide.createIcons();
}

function wireEvents() {
  document.querySelectorAll("[data-tab]").forEach(el => el.addEventListener("click", () => setView(el.dataset.tab)));
  const streamBtn = document.getElementById("btn-stream");
  if (streamBtn) streamBtn.addEventListener("click", () => { state.streaming = !state.streaming; render(); });

  document.querySelectorAll("tr[data-agent]").forEach(el => el.addEventListener("click", async () => {
    state.detailAgent = state.detailAgent === el.dataset.agent ? null : el.dataset.agent;
    if (state.detailAgent) state.detailRuns = await api(`/agents/${encodeURIComponent(state.detailAgent)}/runs?limit=50`);
    render();
  }));
  const closeBtn = document.getElementById("btn-close-detail");
  if (closeBtn) closeBtn.addEventListener("click", () => { state.detailAgent = null; render(); });
  const interrogateBtn = document.getElementById("btn-interrogate-detail");
  if (interrogateBtn) interrogateBtn.addEventListener("click", async () => {
    state.query = `what did the ${state.detailAgent} agent just do?`;
    state.view = "ask";
    await runAsk();
  });

  const selTokAgent = document.getElementById("sel-tok-agent");
  if (selTokAgent) selTokAgent.addEventListener("change", async e => { state.tokAgent = e.target.value; await refreshForView(); render(); });
  document.querySelectorAll("[data-range]").forEach(el => el.addEventListener("click", async () => { state.tokRange = el.dataset.range; await refreshForView(); render(); }));

  const selEvAgent = document.getElementById("sel-ev-agent");
  if (selEvAgent) selEvAgent.addEventListener("change", async e => { state.evAgent = e.target.value; await loadEvents(); render(); });
  document.querySelectorAll("[data-type]").forEach(el => el.addEventListener("click", async () => { state.evType = el.dataset.type; await loadEvents(); render(); }));
  const evSearch = document.getElementById("inp-ev-search");
  if (evSearch) {
    let t;
    evSearch.addEventListener("input", e => {
      state.evSearch = e.target.value;
      clearTimeout(t);
      t = setTimeout(async () => { await loadEvents(); render(); }, 300);
    });
  }
  document.querySelectorAll(".ev-row").forEach(el => el.addEventListener("click", () => {
    const id = el.dataset.id;
    state.openPayload[id] = !state.openPayload[id];
    render();
  }));

  const askInput = document.getElementById("inp-ask");
  if (askInput) askInput.addEventListener("keydown", e => { if (e.key === "Enter") { state.query = askInput.value; runAsk(); } });
  const askBtn = document.getElementById("btn-ask");
  if (askBtn) askBtn.addEventListener("click", () => { state.query = document.getElementById("inp-ask").value; runAsk(); });
  document.querySelectorAll("[data-suggest]").forEach(el => el.addEventListener("click", () => { state.query = el.dataset.suggest; runAsk(); }));

  const reportBtn = document.getElementById("btn-gen-report");
  if (reportBtn) reportBtn.addEventListener("click", generateReport);
}

async function runAsk() {
  try {
    state.answer = await api("/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: state.query }) });
  } catch (e) { state.answer = { title: "Error", lines: [String(e)], evidence: [], scope: "past" }; }
  render();
}

async function generateReport() {
  state.reportBusy = true;
  render();
  try {
    state.report = await api("/report/generate", { method: "POST" });
  } catch (e) {
    state.report = { exists: true, content: "Error generating report: " + e };
  }
  state.reportBusy = false;
  render();
}

// ----------------------------------------------------------------- boot --

async function boot() {
  render();
  connectWS();
  try {
    state.summary = await api("/summary");
    state.agents = await api("/agents");
    state.reviewLog = await api("/review-log");
    state.report = await api("/report");
  } catch (e) { console.error(e); }
  render();
}

boot();
