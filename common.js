/* ============================================================
   共用程式：設定 / 名冊 / 學年度 / 離線暫存
   評分單、助理回饋表、儀表板共用。修改此檔即三頁同步生效。
   ============================================================ */

/* ══════════════════════════════════════════════════════════
   ★ 唯一需要設定的地方

   GAS_URL = 「技能評估」試算表的 Apps Script 部署網址（結尾 /exec）
             不是急救課程那一組，兩者不同。

   取得方式：打開「技能評估」試算表 → 擴充功能 → Apps Script
             → 部署 → 管理部署作業 → 複製網頁應用程式網址

   這個檔案負責：scoring.html（教師評分單）、dash-skills.html（技能評估儀表板）
   assistant.html 有自己的設定區，也要填同一組網址。
   ══════════════════════════════════════════════════════════ */
const GAS_URL = "https://script.google.com/macros/s/AKfycbxzwJsXeJAiGw9W5tUc67W6BhsC_gLpLn4jpYqdQUH6i6kOcyP4oPlujnLJSL1BaOaDyw/exec";            // ← 貼上「技能評估」的 /exec 網址

const ROSTER_TTL = 86400000;   // 名冊本機快取 24 小時

/* ---------- 小工具 ---------- */
const g = id => (document.getElementById(id)?.value || "").trim();

function toast(m, err) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = m;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.textContent = ""; }, 4000);
}

/* ---------- 學年度：依日期推算（8 月起算新學年），可手動覆蓋 ---------- */
let yearManual = false;
const rocYear = d => d.getFullYear() - 1911 - (d.getMonth() < 7 ? 1 : 0);

function buildYearOptions() {
  const sel = document.getElementById("yr");
  if (!sel) return;
  const base = rocYear(new Date());
  sel.innerHTML = "";
  for (let y = base - 3; y <= base + 3; y++)
    sel.insertAdjacentHTML("beforeend", `<option>${y}</option>`);
}

function syncYear() {
  const sel = document.getElementById("yr");
  if (!sel || yearManual) return;
  const v = g("dt");
  const d = v ? new Date(v + "T00:00:00") : new Date();
  if (isNaN(d)) return;
  const y = String(rocYear(d));
  if (![...sel.options].some(o => o.value === y))
    sel.insertAdjacentHTML("beforeend", `<option>${y}</option>`);
  sel.value = y;
  const s = document.getElementById("yrSrc");
  if (s) s.textContent = "依日期";
}

/* ---------- 名冊 ---------- */
let ROSTER = {};

function setBar(html) {
  const b = document.getElementById("rosterBar");
  if (b) b.innerHTML = html;
}

function applyRoster(list, note) {
  ROSTER = {};
  (list || []).forEach(r => {
    const k = String(r.eid || "").trim().toUpperCase();
    if (k) ROSTER[k] = r;
  });
  const n = Object.keys(ROSTER).length;
  const dl = document.getElementById("eidList");
  if (dl) dl.innerHTML = Object.keys(ROSTER)
    .map(k => `<option value="${k}">${ROSTER[k].name || ""}</option>`).join("");
  setBar(`名冊 <b>${n}</b> 人${note ? "　" + note : ""}
    <button type="button" class="g" onclick="loadRoster(true)">重新整理名冊</button>`);
  lookupEid();
}

async function loadRoster(force) {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem("rosterCache") || "null");
      if (c && Date.now() - c.at < ROSTER_TTL && c.list && c.list.length) {
        applyRoster(c.list, "（本機快取）");
        return;
      }
    } catch (e) {}
  }
  if (!GAS_URL) { setBar("尚未設定 GAS_URL，人事號需手動輸入姓名。"); return; }
  setBar("名冊載入中…");
  try {
    const r = await fetch(GAS_URL + "?action=roster", { method: "GET" });
    const j = await r.json();
    const list = j.roster || [];
    localStorage.setItem("rosterCache", JSON.stringify({ at: Date.now(), list }));
    applyRoster(list, "");
  } catch (e) {
    try {
      const c = JSON.parse(localStorage.getItem("rosterCache") || "null");
      if (c && c.list && c.list.length) { applyRoster(c.list, "（離線，使用舊快取）"); return; }
    } catch (e2) {}
    setBar(`名冊載入失敗，人事號需手動輸入姓名。
      <button type="button" class="g" onclick="loadRoster(true)">重試</button>`);
  }
}

function lookupEid() {
  const eidEl = document.getElementById("eid");
  if (!eidEl) return;
  const k = eidEl.value.trim().toUpperCase();
  const hit = ROSTER[k];
  const nm = document.getElementById("stu");
  const src = document.getElementById("nameSrc");
  if (!k) { if (src) { src.textContent = ""; src.className = "src"; } return; }
  if (hit) {
    if (nm) nm.value = hit.name || "";
    if (src) { src.textContent = "名冊"; src.className = "src"; }
    const lv = document.getElementById("lvl");
    if (lv && hit.level && ["PGY1", "PGY2"].includes(hit.level)) lv.value = hit.level;
  } else {
    if (src) { src.textContent = "查無，請手填"; src.className = "src warn"; }
  }
}

/* ---------- 離線暫存 ---------- */
let PENDING_KEY = "pendingRows";

function readPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch (e) { return []; }
}
function writePending(a) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(a)); } catch (e) {}
}
function pushPending(o) { const a = readPending(); a.push(o); writePending(a); }
function dropPending(ts, station) {
  writePending(readPending().filter(x => !(x.ts === ts && (station === undefined || x.station === station))));
}
function clearPending() {
  if (confirm("清除本機暫存的未送出紀錄？")) { writePending([]); showPending(); toast("已清除暫存"); }
}

function showPending() {
  const a = readPending(), box = document.getElementById("pending");
  if (!box) return;
  if (!a.length) { box.style.display = "none"; return; }
  box.style.display = "block";
  const who = [...new Set(a.map(x => x.name || x.eid || "未命名"))].join("、");
  box.innerHTML = `<b>本機尚有 ${a.length} 筆未確認送出</b>（${who}）。網路恢復後可按重送。<br>
    <button type="button" class="g" style="margin-top:7px" onclick="resend()">重送</button>
    <button type="button" class="g" style="margin-top:7px" onclick="clearPending()">清除暫存</button>`;
}

async function postGAS(o) {
  if (!GAS_URL) throw new Error("尚未設定 GAS_URL");
  await fetch(GAS_URL, {
    method: "POST", mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(o)
  });
}

async function resend() {
  const a = readPending();
  if (!a.length) return;
  const left = [];
  let ok = 0;
  for (const o of a) { try { await postGAS(o); ok++; } catch (e) { left.push(o); } }
  writePending(left); showPending();
  ok ? toast("已重送 " + ok + " 筆") : toast("重送失敗，請確認網路或 GAS_URL", true);
}

/* ---------- 初始化 ---------- */
function initCommon(opt) {
  opt = opt || {};
  PENDING_KEY = "pending_" + (opt.page || "form");

  const now = new Date();
  const dt = document.getElementById("dt");
  if (dt && !dt.value) dt.value = now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");

  buildYearOptions(); syncYear();
  dt?.addEventListener("change", syncYear);
  document.getElementById("yr")?.addEventListener("change", () => {
    yearManual = true;
    const s = document.getElementById("yrSrc"); if (s) s.textContent = "手動";
  });

  const eid = document.getElementById("eid");
  eid?.addEventListener("input", lookupEid);
  eid?.addEventListener("change", lookupEid);
  document.getElementById("stu")?.addEventListener("input", () => {
    const s = document.getElementById("nameSrc"); if (s) s.textContent = "";
  });

  // 記住上次填表者
  const who = opt.page === "assistant" ? "asst" : "rater";
  const el = document.getElementById(who);
  if (el) {
    const last = localStorage.getItem("last_" + who);
    if (last && !el.value) el.value = last;
    el.addEventListener("change", e => {
      if (e.target.value.trim()) localStorage.setItem("last_" + who, e.target.value.trim());
    });
  }

  showPending();
  loadRoster();
}
