// ====== Constants ======
const leftLabels = ["A", "B", "2", "3", "6", "7", "8", "9", "11", "14", "15", "17", "18", "19", "22", "23", "24", "25", "28", "C", "D"];
const rightLabels = ["J", "I", "79", "77", "75", "74", "73", "72", "69", "68", "65", "63", "61", "60", "59", "58", "57", "56", "53", "H", "G"];
const topLabels = ["P", "O", "N", "96", "95", "94", "93", "92", "91", "87", "85", "83", "81", "M", "L", "K"];
const bottomLabels = ["E", "31", "32", "33", "35", "36", "37", "40", "41", "44", "45", "46", "47", "49", "50", "F"];

// === Drawing size (可調) ===
// MIN/MAX 藍點：固定半徑（維持可讀性）
const MINMAX_DOT_RADIUS = 1.5;

// Pins 的點線：以「基準 * 倍率」計算（倍率由 UI 選）
const BASE_PIN_DOT_RADIUS = 1.0;  // 基準半徑
const BASE_PIN_LINE_WIDTH = 1.0;  // 基準線寬

// 目前樣式狀態（預設：1.5×、灰 #BEBEBE）
let PIN_STYLE_SCALE = 1.5;
let PIN_STYLE_COLOR = "#BEBEBE";
// ★ 新增：內圈顏色（若 user 自訂則存這；若 null 則自動計算）
let PIN_STYLE_COLOR_INNER = null;
// 顯示哪一圈的「連線」：'all' | 'inner' | 'outer'（不記憶，僅當次）
let PIN_LINE_SCOPE = 'all';

// === Debug Switches ===
// 內/外圈的方形參考線（RING_OUTER / RING_INNER）預設不顯示
let DEBUG_SHOW_RING_RECTS = false;

/** 在 Console 或其他地方呼叫：
 *   setRingDebug(true)  // 顯示參考方框
 *   setRingDebug(false) // 隱藏參考方框
 */
window.setRingDebug = function (flag) {
  DEBUG_SHOW_RING_RECTS = !!flag;
  if (typeof drawPinsAndLines === 'function') drawPinsAndLines(); // 立即重繪
};
console.log("輸入 setRingDebug(true); 可以顯示參考線");

// 取當前點/線實際數值
function pinDotRadius() { return BASE_PIN_DOT_RADIUS * PIN_STYLE_SCALE; }
function pinLineWidth() { return BASE_PIN_LINE_WIDTH * PIN_STYLE_SCALE; }


// === Label layout knobs ===
const STEP_V = 33;     // 垂直間距
const STEP_H = 33;     // 水平間距

const LEFT_LABEL_X = 10, LEFT_INPUT_X = 35, LEFT_Y0 = 125;  //左排：把 LEFT_INPUT_X 往左移（數值變小）或 LEFT_LABEL_X 往右移（數值變大）。
const RIGHT_LABEL_X = 735, RIGHT_INPUT_X = 655, RIGHT_Y0 = 125;  //右排：把 RIGHT_INPUT_X 往右移（變大）或 RIGHT_LABEL_X 往左移（變小）。

const TOP_LABEL_Y = 10, TOP_INPUT_Y = 35, TOP_X0 = 125;  //頂/底排：微調 TOP_INPUT_Y / BOTTOM_INPUT_Y
const BOTTOM_LABEL_Y = 895, BOTTOM_INPUT_Y = 815, BOTTOM_X0 = 125;  //（通常 +2~+6 px 就會離開 label），或微調 TOP_X0 / BOTTOM_X0 讓整排左右位移。

// === Pixel per micrometer (px/um) ===
// 640 px ↔ 8.75 mm = 8750 um → 1 px/um（垂直:上盒最下邊 → 下盒最上邊內側距離）
// 480 px ↔ 6.75 mm = 6750 um → 1 px/um（水平:左盒最右邊 → 右盒最左邊的內側距離）
const PX_PER_UM_Y = 0.08;  //0.08
const PX_PER_UM_X = 0.08;  //0.08

// 把 chip 尺寸(um) 轉成 畫面像素(px)
function sizeFromChipUm(w_um, h_um) {
  const wpx = Number(w_um) * PX_PER_UM_X;
  const hpx = Number(h_um) * PX_PER_UM_Y;
  return { w: wpx, h: hpx };
}

// ✨ 讓 MIN/MAX 能微調的邊界（單位：px，stage座標）
let MINMAX_OFFSET = { left: 0, right: 0, top: 0, bottom: 0 };
// 例：若圖片四邊各有 ~3px 留白，可改成 {left:3, right:3, top:3, bottom:3}

// === 編輯權限：從 /me 取得當前使用者是否可編輯 ===
let IS_EDITOR = false;

/**
 * 向後端詢問身分，若可編輯：套用 .edit-enabled，並讓標記 data-editable 的元素可編輯
 * 你可以在要讓主管編輯的區塊加上 data-editable 屬性
 * 例：<div class="note" data-editable>...</div>
 */
async function checkEditor() {
  try {
    const r = await fetch("/me", { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const me = await r.json();
    IS_EDITOR = !!me?.is_editor;

    // 切換 body 的狀態 class（可用 CSS 做提示）
    document.body.classList.toggle("edit-enabled", IS_EDITOR);

    // 切換所有 data-editable 的元素
    // 只開放內容區，不要把 header/按鈕設成可編輯
    document.querySelectorAll(
      "[data-editable]:not(button):not(summary):not(.acc-header):not(.acc-content):not([role='button'])"
    ).forEach(el => {
      if (IS_EDITOR) {
        el.setAttribute("contenteditable", "true");
        el.classList.add("editable");
      } else {
        el.removeAttribute("contenteditable");
        el.classList.remove("editable");
      }
    });

    // 主管操作列（編輯/儲存/取消）— 有權限才顯示
    document.querySelectorAll(".acc-actions").forEach(el => {
      el.hidden = !IS_EDITOR;
    });

    // ★ 規則設定按鈕：有權限才顯示 (2026/1/1修改)
    const rulesBtn = document.getElementById("openRulesBtn");
    if (rulesBtn) rulesBtn.hidden = !IS_EDITOR;


  } catch (err) {
    console.warn("[checkEditor] failed:", err);
    IS_EDITOR = false; // 安全預設
  }
}

// ★ 2026/1/2修改：判斷鋁線/金線 Helper
// 規則：CUP為[no msg]或是空 & PadWindow >= 65X65 就是鋁線，其他為金線
function judgeWireType(padWindowStr, cupStr) {
  const c = (cupStr || "").trim().toLowerCase();
  const isCupEmpty = (!c || c === "[no msg]");

  // 解析 PadWindow 尺寸 (預期格式如 "70um x 70um", "90X90", "100" 等)
  // 這裡簡單抓取字串中的數字
  const nums = (padWindowStr || "").match(/(\d+(\.\d+)?)/g);
  let w = 0, h = 0;
  if (nums && nums.length >= 2) {
    w = parseFloat(nums[0]);
    h = parseFloat(nums[1]);
  } else if (nums && nums.length === 1) {
    // 若只有一個數字，假設是正方形? 或者當作無法判斷? 
    // 假設 user 說 "65X65"，通常會有兩個數字。若只寫 "90"，保險起見當作 90x90 或 90x? 
    // 依照 "65X65" 描述，應至少有兩數。若不足兩數，視為未達標 (或視情況而定)。
    // 這裡嚴謹一點，若抓不到兩個數字，視為 0x0
    w = parseFloat(nums[0]);
    h = w; // 假設正方形? 先保守處理，若不足兩數可能有誤，這裡暫且假設是正方形
  }

  // 判斷 >= 65x65 -> 寬 >= 65 且 高 >= 65
  const isLargePad = (w >= 65 && h >= 65);

  if (isCupEmpty && isLargePad) {
    return "鋁線";
  }
  return "金線";
}

// === 注意事項：預設值（沒有檔案時用） ===
const DEFAULT_NOTICES = {
  operation: "（預設）操作注意事項：\n1) …\n2) …",
  bonding: "（預設）bonding 注意事項：\n1) …\n2) …"
};

// 讀取全站注意事項
async function loadNotices() {
  let data = { ...DEFAULT_NOTICES };
  try {
    const r = await fetch(`/notices`, { cache: "no-store" });
    if (r.ok) data = await r.json();
  } catch (e) {
    console.warn("loadNotices failed:", e);
  }
  const op = document.getElementById("notice-op");
  const bd = document.getElementById("notice-bond");
  if (op) op.textContent = data.operation || "";
  if (bd) bd.textContent = data.bonding || "";
}


// 讓 textarea 隨內容自動調整高度
function autoResizeTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, Math.floor(window.innerHeight * 0.6)) + 'px';
}


// 綁定「編輯/儲存/取消」；只有 is_editor 才看得到按鈕（checkEditor 已處理）
function setupNoticeEditors() {
  document.querySelectorAll("#noticesAcc .acc-item").forEach(item => {
    const key = item.querySelector(".acc-header")?.dataset.key;
    const pre = item.querySelector(".acc-content");
    const editor = item.querySelector(".acc-editor");
    const actions = item.querySelector(".acc-actions");
    const btnEdit = item.querySelector(".acc-edit");
    const btnSave = item.querySelector(".acc-save");
    const btnCancel = item.querySelector(".acc-cancel");
    if (!key || !pre || !editor || !btnEdit || !btnSave || !btnCancel) return;

    // 進入編輯
    btnEdit.addEventListener("click", () => {
      editor.value = pre.textContent;
      pre.hidden = true; editor.hidden = false;
      btnEdit.hidden = true; btnSave.hidden = false; btnCancel.hidden = false;
      editor.focus();
      autoResizeTextarea(editor);
      editor.addEventListener('input', () => autoResizeTextarea(editor), { once: false });
    });

    // 取消
    btnCancel.addEventListener("click", () => {
      editor.hidden = true; pre.hidden = false;
      btnEdit.hidden = false; btnSave.hidden = true; btnCancel.hidden = true;
    });

    // 儲存
    btnSave.addEventListener("click", async () => {
      const text = editor.value;
      // 立刻反映到畫面
      pre.textContent = text;
      editor.hidden = true; pre.hidden = false;
      btnEdit.hidden = false; btnSave.hidden = true; btnCancel.hidden = true;

      // 固定寫到後端（全站共用）
      const fd = new FormData();
      fd.append("key", key);
      fd.append("text", text);

      try {
        const r = await fetch("/notices", { method: "POST", body: fd });
        if (!r.ok) throw new Error("HTTP " + r.status);
      } catch (e) {
        console.error("save failed:", e);
        alert("儲存失敗（可能沒有編輯權限或伺服器無法寫入）。請聯絡管理者。");
      }
    });

  });
}


function setupNoticesAccordion() {
  const acc = document.getElementById("noticesAcc");
  if (!acc) return;

  const headers = acc.querySelectorAll(".acc-header");

  headers.forEach(h => {
    h.addEventListener("click", () => {
      const panel = h.nextElementSibling;
      const expanded = h.getAttribute("aria-expanded") === "true";

      // 關掉其它項目（只允許一個打開）
      headers.forEach(other => {
        if (other !== h) {
          other.setAttribute("aria-expanded", "false");
          const p = other.nextElementSibling;
          if (p) p.hidden = true;
        }
      });

      // 切換自己
      h.setAttribute("aria-expanded", String(!expanded));
      if (panel) panel.hidden = expanded; // true=關, false=開
    });
  });
}


// 位置函式
function posLeftLabel(i) { return { x: LEFT_LABEL_X, y: LEFT_Y0 + i * STEP_V }; }
function posLeftInput(i) { return { x: LEFT_INPUT_X, y: LEFT_Y0 + i * STEP_V }; }
function posRightLabel(i) { return { x: RIGHT_LABEL_X, y: RIGHT_Y0 + i * STEP_V }; }
function posRightInput(i) { return { x: RIGHT_INPUT_X, y: RIGHT_Y0 + i * STEP_V }; }
function posTopLabel(i) { return { x: TOP_X0 + i * STEP_H, y: TOP_LABEL_Y }; }
function posTopInput(i) { return { x: TOP_X0 + 25 + i * STEP_H, y: TOP_INPUT_Y, rotate: true }; }
function posBottomLabel(i) { return { x: BOTTOM_X0 + i * STEP_H, y: BOTTOM_LABEL_Y }; }
function posBottomInput(i) { return { x: BOTTOM_X0 + 25 + i * STEP_H, y: BOTTOM_INPUT_Y, rotate: true }; }

const stage = document.getElementById("stage");
const overlay = document.getElementById("overlay");
const chipImage = document.getElementById("chipImage");

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const invalidTopEl = document.getElementById("invalidTop"); // ★ 新增：頂部膠囊
const invalidCountEl = document.getElementById("invalidCount");   // ★ 新增
const invalidPinsTopEl = document.getElementById("invalidPinsTop"); // ★ 新增
const invalidToggleEl = document.getElementById("invalidToggle");  // ★ 新增
const invalidCapsuleEl = document.getElementById("invalidCapsule"); // ★ 新增：膠囊容器

const invalidEl = document.getElementById("invalidPins");
const projectCodeEl = document.getElementById("projectCode");
const padwindowEl = document.getElementById("padwindow");   // ★ 新增
const cupEl = document.getElementById("cup");         // ★ 新增
const wireTypeEl = document.getElementById("wireType"); // ★ 新增：Wire Type 獨立膠囊


const chipWidthEl = document.getElementById("chipWidth");
const chipHeightEl = document.getElementById("chipHeight");

const sheetSelector = document.getElementById("sheetSelector");

const zoomRange = document.getElementById("zoomRange");
const zoomVal = document.getElementById("zoomVal");

const viewToggleBtn = document.getElementById("btnViewToggle"); // ★ 新增：放大/1:1 視圖切換
let BIG_VIEW_MODE = false;                                     // ★ false=1:1/既有比例，true=放大到黃色區0.9 (BIG_VIEW_RATIO)
const BIG_VIEW_RATIO = 0.9;                                    // ★ 放大到黃色區的佔比

const dataControls = document.getElementById("dataControls");
const hideDataControls = () => dataControls?.setAttribute("hidden", "");
const revealDataControls = () => dataControls?.removeAttribute("hidden");

// 載入資料按鈕（僅控制這顆，不動 hideDataControls）
const loadDataBtn = document.getElementById("loadDataBtn");
// 專用：隱藏/顯示載入按鈕（同時設 disabled，避免被鍵盤觸發）
const hideLoadBtn = () => { loadDataBtn?.setAttribute("hidden", ""); loadDataBtn.disabled = true; };
const revealLoadBtn = () => { loadDataBtn?.removeAttribute("hidden"); loadDataBtn.disabled = false; };

const stageWrapper = document.getElementById("stageWrapper"); // 平移手勢掛在外層容器


let SESSION_ID = null;
let CURRENT_FILE_NAME = ""; // ★ 新增：記住目前檔名（全域）
let DISPLAY_SCALE = 1.0;
let MIN_POINT = null; // {x,y}
let MAX_POINT = null; // {x,y}

let VALID_PINS = []; // {pin_no, pin_name, x, y}
let INVALID_PINS = [];
let CURRENT_SHEET_REQ = 0; // === Sheet 切換請求序號：只採用最後一次回應，避免瞬閃 ===

// === Dynamic Validation Rules ===
let VALIDATION_RULES = [];
let FORBIDDEN_PINS = [];

async function loadRules() {
  try {
    const r = await fetch("/api/rules", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      VALIDATION_RULES = data.rules || [];
      FORBIDDEN_PINS = data.forbidden_pins || [];
      // console.log("Rules loaded:", VALIDATION_RULES.length, "Forbidden:", FORBIDDEN_PINS.length);
    }
  } catch (e) {
    console.warn("Failed to load rules:", e);
  }
}

const inputsByLabel = new Map(); // label string -> input element
const labelDivsByLabel = new Map(); // label string -> label element
const inputsByLabelNorm = new Map();   // 正規化鍵

// === 無法連線 PIN 的 GIF 顯示控制（僅限每次載入後顯示一次） ===
function getInvalidGifEl() { return document.getElementById('invalidGif'); }
let invalidGifShownThisLoad = false;
// --- 成功 NICE.gif 控制（只在每次載入流程播一次） ---
function getOkGifEl() { return document.getElementById('okGif'); }
let okGifShownThisLoad = false;

function showInvalidGifOnce() {
  const invalidGifEl = getInvalidGifEl();
  if (invalidGifShownThisLoad || !invalidGifEl) return;
  invalidGifShownThisLoad = true;
  invalidGifEl.hidden = false;
  invalidGifEl.classList.add('show');
  clearTimeout(invalidGifEl._hideTimer);
  invalidGifEl._hideTimer = setTimeout(() => {
    invalidGifEl.classList.remove('show');
    invalidGifEl.hidden = true;
  }, 2200);
}
function showOkGifOnce() {
  const ok = getOkGifEl();
  if (okGifShownThisLoad || !ok) return;
  okGifShownThisLoad = true;
  ok.hidden = false;
  ok.classList.add('show');
  clearTimeout(ok._hideTimer);
  ok._hideTimer = setTimeout(() => {
    ok.classList.remove('show');
    ok.hidden = true;
  }, 2200);
}

// ====== Helpers ======
function setStatus(msg) { statusEl.textContent = msg; }
function setError(msg) { errorEl.textContent = msg || ""; }
// === 每次開始「新一輪載入 / 換檔 / 換表」前，清掉上一輪錯誤與提示 ===
function resetErrorUIForNewLoad() {
  // 1) 清錯誤文字列（#error）
  if (typeof setError === 'function') setError("");

  // 2) 關閉「無法連線 PIN」膠囊並清空內容
  if (typeof setInvalidPins === 'function') setInvalidPins([]);  // 已內含 hidden 與清空

  // 3) 保險：把膠囊殘留的樣式關閉（不同版本 class 可能不同，統一清）
  const capsule = document.getElementById('invalidCapsule');
  if (capsule) {
    capsule.classList.remove('open', 'show', 'active', 'collapsed');
    capsule.removeAttribute('style'); // 若曾用 inline style 顯示/定位
    capsule.setAttribute('aria-expanded', 'true');
    capsule.hidden = true; // 再保險收起
  }

  // 4) 關閉 GIF 並重置本輪只播一次的旗標（若有）
  const gif = document.getElementById('invalidGif');
  if (gif) { gif.classList.remove('show'); gif.hidden = true; }
  if (typeof invalidGifShownThisLoad !== 'undefined') invalidGifShownThisLoad = false;

  const ok = document.getElementById('okGif');
  if (ok) { ok.classList.remove('show'); ok.hidden = true; }
  okGifShownThisLoad = false;
}

function nowTime() {
  const dt = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  // yyyy-mm-dd-HHMMSS（避免用冒號，Windows/macOS 都安全）
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const nt = document.getElementById("nowtime");
if (nt) nt.textContent = nowTime();

function setInvalidPins(list) {
  // 1) 標準化陣列
  INVALID_PINS = Array.isArray(list) ? list : [];

  // 2) 頂部「無法連線 PIN」紅色膠囊
  if (invalidCapsuleEl) {
    if (INVALID_PINS.length) {
      // 有資料 → 顯示＋更新統計與內容
      invalidCapsuleEl.hidden = false;
      invalidCapsuleEl.classList.remove('collapsed');
      invalidCapsuleEl.setAttribute('aria-expanded', 'true');

      if (invalidTopEl) invalidTopEl.textContent = "無法連線 PIN：";
      if (invalidCountEl) invalidCountEl.textContent = String(INVALID_PINS.length);
      if (invalidPinsTopEl) invalidPinsTopEl.textContent = INVALID_PINS.join("\n");
      if (invalidToggleEl) invalidToggleEl.textContent = "▲"; // 展開中 → 顯示可收合

      // 本次載入只播一次的小動畫（若你有 showInvalidGifOnce）
      if (Array.isArray(INVALID_PINS) && INVALID_PINS.length > 0) {
        showInvalidGifOnce();
      }
    } else {
      // 沒有資料 → 正確的「外層」else：完全隱藏與清空
      invalidCapsuleEl.hidden = true;
      invalidCapsuleEl.classList.remove('collapsed');
      invalidCapsuleEl.setAttribute('aria-expanded', 'true');

      if (invalidPinsTopEl) invalidPinsTopEl.textContent = "";
      if (invalidCountEl) invalidCountEl.textContent = "0";
      if (invalidToggleEl) invalidToggleEl.textContent = "▲"; // 保持一致

      if (Array.isArray(VALID_PINS) && VALID_PINS.length > 0) {
        showOkGifOnce();
      }
    }
  }

  // 3) 右側 debug（預設 hidden）
  if (invalidEl) {
    invalidEl.textContent = INVALID_PINS.join("\n");
  }
}


function normLabel(s) {
  return String(s || "")
    .replace(/\s+/g, "")      // 去所有空白（含全形空白）
    .replace(/\u00A0/g, "")   // 去 NBSP
    .toUpperCase();           // 大寫化
}


function sanitizeNumberInput(el) {
  el.addEventListener("input", () => {
    let txt = el.value.replace(/[^0-9.]/g, "");
    const parts = txt.split(".");
    if (parts.length > 2) {
      txt = parts[0] + "." + parts.slice(1).join("");
    }
    el.value = txt;
  });
}

// === 驗證/紅框控制（只在「載入錯誤」時才加紅框） ===
// 判斷 chip 寬/高欄位是否都有有效數值
function hasChipSizeValues() {
  const w = parseFloat(chipWidthEl.value);
  const h = parseFloat(chipHeightEl.value);
  return Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0;
}

/** 控制 chip 寬/高欄位的紅框（.is-invalid）
 *  規則：
 *   1) 清空欄位時不自動加紅框（避免閃紅）
 *   2) 只有在「載入錯誤」時才 markChipSizeInvalid(true)
 *   3) 當欄位有值且載入正確時，再 markChipSizeInvalid(false) 清掉紅框
 */
function markChipSizeInvalid(show, reason = "") {
  [chipWidthEl, chipHeightEl].forEach(el => {
    if (!el) return;
    el.classList.toggle('is-invalid', !!show);
    if (show) { el.title = reason || "載入錯誤"; } else { el.removeAttribute('title'); }
  });
}


function resetChipSizeUI() {
  // 清空欄位
  chipWidthEl.value = "";
  chipHeightEl.value = "";
  // 清掉圖片尺寸，避免沿用上一張
  chipImage.style.width = "";
  chipImage.style.height = "";
}

sanitizeNumberInput(chipWidthEl);
sanitizeNumberInput(chipHeightEl);

// ====== Build side labels & inputs inside stage ======
function buildSideUI() {
  // Cleanup previous
  stage.querySelectorAll(".pin-label, .pin-input, .pin-box").forEach(n => n.remove());

  // Left
  leftLabels.forEach((lab, i) => {
    const L = posLeftLabel(i), I = posLeftInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-left";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
    // highlight special
    if (["17", "18", "19", "22"].includes(lab)) div.classList.add("bg-blue");
    if (["9"].includes(lab)) div.classList.add("bg-pink");
    if (["11"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    // input -> 改成不可編輯的 div
    //const inp = document.createElement("input");
    //inp.className = "pin-input side-left";
    //inp.style.left = I.x + "px"; inp.style.top = I.y + "px";
    //stage.appendChild(inp);
    //inputsByLabel.set(lab, inp);
    // box
    const box = document.createElement("div");
    box.className = "pin-box side-left";
    box.style.left = I.x + "px";
    box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
    inputsByLabelNorm.set(normLabel(lab), box);
  });

  // Right
  rightLabels.forEach((lab, i) => {
    const L = posRightLabel(i), I = posRightInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-right";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
    if (["56", "57", "58", "59"].includes(lab)) div.classList.add("bg-blue");
    if (["61"].includes(lab)) div.classList.add("bg-pink");
    if (["60"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    const box = document.createElement("div");
    box.className = "pin-box side-right";
    box.style.left = I.x + "px";
    box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
    inputsByLabelNorm.set(normLabel(lab), box);
  });

  // Top
  topLabels.forEach((lab, i) => {
    const L = posTopLabel(i), I = posTopInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-top";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
    if (["87", "92"].includes(lab)) div.classList.add("bg-pink");
    if (["91"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    const box = document.createElement("div");
    box.className = "pin-box rotate90 side-top";
    box.style.left = I.x + "px";
    box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
    inputsByLabelNorm.set(normLabel(lab), box);
  });

  // Bottom
  bottomLabels.forEach((lab, i) => {
    const L = posBottomLabel(i), I = posBottomInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-bottom";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
    if (["41"].includes(lab)) div.classList.add("bg-pink");
    if (["40"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    const box = document.createElement("div");
    box.className = "pin-box rotate90 side-bottom";
    box.style.left = I.x + "px";
    box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
    inputsByLabelNorm.set(normLabel(lab), box);
  });
}

// === 當 chip size 缺漏時，統一清乾淨畫面 ===
function clearImageAndState() {
  // 清圖片
  chipImage.removeAttribute('src');
  chipImage.classList.remove('loaded');
  chipImage.style.width = "";
  chipImage.style.height = "";
  // 再清欄位與狀態
  resetChipSizeUI();
  // 清幾何/疊圖
  clearOverlay();
  MIN_POINT = null;
  MAX_POINT = null;
  VALID_PINS = [];
  INVALID_PINS = [];
  setInvalidPins([]);              // 無法連線 PIN 資訊
  // chip 尺寸欄位與圖片尺寸歸零（保險）
  // 清空 Project Code（一起清掉舊專案代碼顯示）
  projectCodeEl.textContent = "";  // projectCode 資訊
  padwindowEl.textContent = "";  // padwindow 資訊
  cupEl.textContent = "";  // cup 資訊
  if (wireTypeEl) wireTypeEl.textContent = ""; // ★ 清空 Wire Type
  hideDataControls();
  hideLoadBtn(); // 註解：清畫面時一併把「載入資料」按鈕隱藏，避免殘留
}

// 取得元素在「stage 原始座標」的外框（會把縮放/平移還原）
function getStageRect(el) {
  const lb = el.getBoundingClientRect();
  const st = stage.getBoundingClientRect();
  return {
    left: (lb.left - st.left) / DISPLAY_SCALE,
    top: (lb.top - st.top) / DISPLAY_SCALE,
    right: (lb.right - st.left) / DISPLAY_SCALE,
    bottom: (lb.bottom - st.top) / DISPLAY_SCALE,
  };
}

// 量到四側 pin-box 內側的矩形（左=左排右緣、右=右排左緣、上=頂排下緣、下=底排上緣）
function measureInnerPinFrame() {
  const Ls = stage.querySelectorAll('.pin-box.side-left');
  const Rs = stage.querySelectorAll('.pin-box.side-right');
  const Ts = stage.querySelectorAll('.pin-box.side-top');
  const Bs = stage.querySelectorAll('.pin-box.side-bottom');
  if (!Ls.length || !Rs.length || !Ts.length || !Bs.length) return null;

  let leftEdge = -Infinity, rightEdge = Infinity, topEdge = -Infinity, bottomEdge = Infinity;
  Ls.forEach(b => { const r = getStageRect(b); leftEdge = Math.max(leftEdge, r.right); });
  Rs.forEach(b => { const r = getStageRect(b); rightEdge = Math.min(rightEdge, r.left); });
  Ts.forEach(b => { const r = getStageRect(b); topEdge = Math.max(topEdge, r.bottom); });
  Bs.forEach(b => { const r = getStageRect(b); bottomEdge = Math.min(bottomEdge, r.top); });

  if (!(isFinite(leftEdge) && isFinite(rightEdge) && isFinite(topEdge) && isFinite(bottomEdge))) return null;
  return { x: leftEdge, y: topEdge, w: rightEdge - leftEdge, h: bottomEdge - topEdge };
}

// 依內框置中 chip 圖
function centerChipImageInInnerFrame() {
  const frame = measureInnerPinFrame();
  if (!frame) return;
  const chipW = parseFloat(chipImage.style.width) || chipImage.width || 0;
  const chipH = parseFloat(chipImage.style.height) || chipImage.height || 0;
  if (!chipW || !chipH) return;

  chipImage.style.left = `${frame.x + (frame.w - chipW) / 2}px`;
  chipImage.style.top = `${frame.y + (frame.h - chipH) / 2}px`;
}


// 只有「當前工作表請求」的圖片載入成功，才開啟載入按鈕
chipImage.addEventListener('load', () => {
  chipImage.classList.add('loaded');
  const req = Number(chipImage.dataset.req || "0");
  if (req === CURRENT_SHEET_REQ) {
    revealLoadBtn();
    // ✅ 只有當寬/高都有數值時，才清除紅框（避免清空時先閃紅）
    if (hasChipSizeValues()) markChipSizeInvalid(false);
  }
});

chipImage.addEventListener('error', () => {
  chipImage.classList.remove('loaded');   // 失敗就維持圖片隱藏
  const req = Number(chipImage.dataset.req || "0");
  if (req !== CURRENT_SHEET_REQ) return;  // ⛔ 舊請求的錯誤忽略，避免瞬間閃紅
  hideLoadBtn();                          // 也把載入資料按鈕藏起來
  // ❌ 只有在「載入錯誤」時才加紅框
  markChipSizeInvalid(true, "圖片載入失敗或路徑無效");
});

// ====== Draw on SVG overlay ======
function clearOverlay() {
  while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
}
function drawCircle(x, y, r, color = "#f00", tag = null) {
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("cx", x); c.setAttribute("cy", y);
  c.setAttribute("r", r); c.setAttribute("fill", color);
  if (tag) c.dataset.tag = tag;
  overlay.appendChild(c);
  return c; // ← 回傳元素，之後可設 dataset.ring
}
function drawText(x, y, txt, color = "#00f") {
  const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
  t.setAttribute("x", x); t.setAttribute("y", y);
  t.setAttribute("fill", color);
  t.setAttribute("font-size", "8");
  t.textContent = txt;
  overlay.appendChild(t);
}
function drawLine(x1, y1, x2, y2, color = "#f00", width = 2, tag = null) {
  const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
  l.setAttribute("x1", x1); l.setAttribute("y1", y1);
  l.setAttribute("x2", x2); l.setAttribute("y2", y2);
  l.setAttribute("stroke", color); l.setAttribute("stroke-width", width);
  if (tag) l.dataset.tag = tag;
  overlay.appendChild(l);
  return l; // ← 回傳元素，之後可設 dataset.ring
}

// ====== Geometry ======
function computeDisplayScale(chipW, chipH) {
  // Align WPF: min(300/width, 600/height)
  if (!chipW || !chipH) return 1.0;
  const s = Math.min(300 / Number(chipW), 600 / Number(chipH));
  return s;
}

function imgRect() {
  const w = chipImage.naturalWidth ? chipImage.width : 0;
  const h = chipImage.naturalHeight ? chipImage.height : 0;
  const left = chipImage.offsetLeft;
  const top = chipImage.offsetTop;
  return { left, top, right: left + w, bottom: top + h, width: w, height: h };
}

// === Ring detection (內/外圈自動辨識) ===
// Ring detection (內/外圈自動辨識)
// 2026/1/1修改: 使用 0.0/1.0 (Min/Max) 作為外/內層判定，確保抓到最外與最內邊界
const RING_Q_OUTER = 0.0; // 2026/1/1修改
const RING_Q_INNER = 1.0; // 2026/1/1修改
const GEO_EPS = 0.5;      // 2026/1/1修改: 幾何判定容許誤差

// === Ring color mapping：以使用者選色為基底，內圈=偏亮、外圈=偏暗 ===
// 將兩個 hex 顏色依權重混合（w ∈ [0,1]）
function mixHex(c1, c2, w) {
  const toRgb = (h) => {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(ch => ch + ch).join("");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return { r, g, b };
  };
  const rgb1 = toRgb(c1), rgb2 = toRgb(c2);
  const r = Math.round(rgb1.r * (1 - w) + rgb2.r * w);
  const g = Math.round(rgb1.g * (1 - w) + rgb2.g * w);
  const b = Math.round(rgb1.b * (1 - w) + rgb2.b * w);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// 回傳圈別顏色（外圈=使用者選色；內圈=對應色）
function ringMate(baseHex) {
  const b = String(baseHex || "").toUpperCase();
  if (b === "#BEBEBE") return "#00EC00"; // 灰 → 內圈用綠
  if (b === "#00EC00") return "#00CACA"; // 綠 → 內圈用藍綠
  if (b === "#00CACA") return "#BEBEBE"; // 藍綠 → 內圈用灰
  return "#00EC00"; // 其它自訂顏色時，內圈預設配綠
}
function ringColor(baseHex, ring) {
  // 若目前是「自訂模式」(PIN_STYLE_COLOR === 'custom')
  if (PIN_STYLE_COLOR === 'custom') {
    const outerVal = document.getElementById('customColorOuter')?.value || '#FF0000';

    // 內圈：若有指定 inner 值就用，否則自動給配對色
    if (ring === 'inner') {
      return PIN_STYLE_COLOR_INNER || ringMate(outerVal);
    }
    // 外圈：回傳選色器的值
    return outerVal;
  }

  const base = baseHex || "#BEBEBE";
  if (ring === "inner") return ringMate(base);
  if (ring === "outer") return base;    // 外圈用使用者顏色
  return base;                           // unknown 時就用使用者顏色
}


// 內/外圈顏色（如果你有既定色彩規範可換）
const RING_COLORS = { inner: "#1f9d55", outer: "#e67e22" }; // 內=綠、外=橘

// 1D 分位數工具
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q)));
  return sorted[i];
}


// 回傳四邊 rails：left/right 用 x 值，top/bottom 用 y 值
// 新增輔助函式：計算全域邊界 (2026/1/1修改)
function computeGlobalBounds(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(pt => {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  });
  return { minX, maxX, minY, maxY };
}

// 新增輔助函式：幾何分類判定 Side (2026/1/1修改)
function getGeometricSide(pt, bounds) {
  const { minX, maxX, minY, maxY } = bounds;
  const dL = Math.abs(pt.x - minX);
  const dR = Math.abs(maxX - pt.x);
  const dT = Math.abs(pt.y - minY);
  const dB = Math.abs(maxY - pt.y);
  const minD = Math.min(dL, dR, dT, dB);

  if (dL <= minD + GEO_EPS) return "left";
  if (dR <= minD + GEO_EPS) return "right";
  if (dT <= minD + GEO_EPS) return "top";
  if (dB <= minD + GEO_EPS) return "bottom";
  return null;
}

// 回傳四邊 rails：left/right 用 x 值，top/bottom 用 y 值
function computeRingRails(chipW, chipH) {
  // 1. 蒐集所有有效點的 Stage 座標
  const points = [];
  (VALID_PINS || []).forEach(p => {
    const pt = chipToStage(p.x, p.y, chipW, chipH);
    if (pt) points.push(pt);
  });
  if (!points.length) return null;

  // 2. 計算全域邊界 (2026/1/1修改: 改用 helper)
  const bounds = computeGlobalBounds(points);

  const acc = { left: [], right: [], top: [], bottom: [] };

  // 3. 幾何分類：將每個點分配給距離最近的邊 (2026/1/1修改: 改用 helper)
  points.forEach(pt => {
    const side = getGeometricSide(pt, bounds);
    if (side && acc[side]) acc[side].push(side === "left" || side === "right" ? pt.x : pt.y);
  });

  // 轉成分位數（先排序）
  const sortAsc = (a, b) => a - b;
  const L = acc.left.sort(sortAsc), R = acc.right.sort(sortAsc);
  const T = acc.top.sort(sortAsc), B = acc.bottom.sort(sortAsc);

  // === 改用「雙中位數」來抓兩條軌道（更抗離群值，也不會把下側抬高） ===
  // 2026/1/1修改: 移除中位數與 splitMedians 邏輯，簡化為 Min/Max
  /* function median(arr)... function splitMedians(sorted)... (已移除) */
  function splitMedians(sorted) {
    if (sorted.length < 2) return { low: null, high: null };
    const mid = Math.floor(sorted.length / 2);
    return { low: median(sorted.slice(0, mid)), high: median(sorted.slice(mid)) };
  }
  // (分位數計算: Outer=0.0, Inner=1.0)
  // 規則：left/top 內圈=較靠中心（left: x 大、top: y 大）；right/bottom 內圈=較靠中心（right: x 小、bottom: y 小[舞台座標]）
  // 2026/1/1修改: 改用 Min/Max 判定 rails 座標
  const rails = {
    left: { outer: quantile(L, RING_Q_OUTER), inner: quantile(L, RING_Q_INNER) },
    right: { outer: quantile(R, 1 - RING_Q_OUTER), inner: quantile(R, RING_Q_OUTER) },
    top: { outer: quantile(T, RING_Q_OUTER), inner: quantile(T, RING_Q_INNER) },
    bottom: { outer: quantile(B, 1 - RING_Q_OUTER), inner: quantile(B, RING_Q_OUTER) },
  };

  // 任一邊缺資料就視為無法分圈
  if ([rails.left, rails.right, rails.top, rails.bottom].some(v => !v.outer || !v.inner)) return null;
  return rails;
}

// 判斷這張圖是否可明確分成「雙圈」
function hasTwoRings(rails) {
  if (!rails) return false;
  const TH = Math.max(2, pinLineWidth()); // 門檻：至少 2px 或當前線寬，避免誤差
  const sides = ["left", "right", "top", "bottom"];
  let strong = 0;
  for (const s of sides) {
    const r = rails[s];
    if (!r || !isFinite(r.inner) || !isFinite(r.outer)) return false; // 少資料 → 視為無法分圈
    if (Math.abs(r.inner - r.outer) >= TH) strong++;
  }
  // 至少有兩個側邊能清楚拉開，才視為雙圈
  return strong >= 2;
}


// 由 rails 算出外框/內框矩形
function buildRingRects(rails) {
  return {
    outer: { left: rails.left.outer, right: rails.right.outer, top: rails.top.outer, bottom: rails.bottom.outer },
    inner: { left: rails.left.inner, right: rails.right.inner, top: rails.top.inner, bottom: rails.bottom.inner },
  };
}

// 依 side 與座標值判定圈別
function decideRing(side, value, rails) {
  if (!rails || !rails[side]) return "unknown";
  const r = rails[side];
  // ★新增：這個側邊的兩條 rail 要有「足夠間距」才判圈別
  const TH_SIDE = Math.max(2, pinLineWidth()); // 與 hasTwoRings 同一精神的門檻
  if (!isFinite(r.inner) || !isFinite(r.outer) || Math.abs(r.inner - r.outer) < TH_SIDE) {
    return "unknown"; // 單圈或幾乎重疊：不要硬判，避免下邊整排變內圈
  }
  const mid = (r.inner + r.outer) / 2;
  // 內圈規則：靠中心
  if (side === "left" || side === "top") {
    // 左/上：中心方向是「數值比較大」
    return (value >= mid) ? "inner" : "outer";
  } else if (side === "right" || side === "bottom") {
    // 右/下：中心方向是「數值比較小」（舞台座標 y 往下變大）
    return (value <= mid) ? "inner" : "outer";
  }
  return "unknown";
}

// 畫矩形框（便於除錯/給使用者信心）
function drawRect(left, top, right, bottom, color, dashed = false, tag = null) {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", left);
  rect.setAttribute("y", top);
  rect.setAttribute("width", Math.max(0, right - left));
  rect.setAttribute("height", Math.max(0, bottom - top));
  rect.setAttribute("fill", "none");
  rect.setAttribute("stroke", color);
  rect.setAttribute("stroke-width", 1);
  if (dashed) rect.setAttribute("stroke-dasharray", "4 2");
  if (tag) rect.dataset.tag = tag;
  overlay.appendChild(rect);
  return rect;
}

// 取 label 盒子的 side 文字（left/right/top/bottom）
function getBoxSide(box) {
  if (box.classList.contains("side-left")) return "left";
  if (box.classList.contains("side-right")) return "right";
  if (box.classList.contains("side-top")) return "top";
  if (box.classList.contains("side-bottom")) return "bottom";
  return null;
}


// 依圖片邊界自動設定 MIN/MAX：MIN=左下角、MAX=右上角
function setMinMaxToImage() {
  const r = imgRect();
  if (!r.width || !r.height) return false;

  const off = MINMAX_OFFSET;
  MIN_POINT = { x: r.left + off.left, y: r.bottom - off.bottom }; // 左下往內縮
  MAX_POINT = { x: r.right - off.right, y: r.top + off.top }; // 右上往內縮
  return true;
}



function chipToStage(x_um, y_um, chipW, chipH) {
  // Using MIN (left-bottom) and MAX (right-top) in stage coords
  if (!MIN_POINT || !MAX_POINT) return null;
  const selW = Math.abs(MAX_POINT.x - MIN_POINT.x);
  const selH = Math.abs(MIN_POINT.y - MAX_POINT.y);
  const scaleX = selW / Number(chipW);
  const scaleY = selH / Number(chipH);
  const sx = MIN_POINT.x + x_um * scaleX;
  const sy = MIN_POINT.y - y_um * scaleY;
  return { x: sx, y: sy };
}

// ====== Color logic for inputs ======
// --- 小工具：取出要分類的文字（textContent 為主，value 為輔）
function getLabelText(el) {
  const t = (el.textContent ?? "").trim();
  if (t) return t;
  const v = (el.value ?? "").trim();
  return v;
}

// --- 小工具：回傳要套的顏色類別（不含 "bg-" 前綴）
function classifyInputLabel(val) {
  const U = (val || "").toUpperCase();

  if (!U) return "gray"; // 空字串 → 灰

  // 1) 地 (Ground)
  const GROUND_KEYS = ["VSS", "GND"];
  if (GROUND_KEYS.some(k => U.includes(k))) return "green";

  // 2) 電源 (Power)
  const POWER_KEYS = ["VDD", "VDP", "VCC", "VCCIO", "VDDIO"];
  if (POWER_KEYS.some(k => U.includes(k))) return "pink";

  // 3) Q 類（訊號腳 / 資料腳）-> 已移除，統一由 Rule Editor (validation_rules.json) 控制 (2026/1/1修改)
  // if (/^Q[0-7]$/.test(U)) return "blue";

  // 4) 其他 → 不上色
  return null;
}

// ====== Color logic for inputs ======
function applyInputColors() {
  // 動態驗證邏輯
  inputsByLabel.forEach((el, keyLabel) => {
    const val = getLabelText(el);
    const U = (val || "").toUpperCase();
    const kStr = String(keyLabel).trim();

    // 1. 預設顏色 (通用)
    let color = classifyInputLabel(val);
    let matchedRule = false;

    // 2. 禁止腳位檢查 (優先度最高) - 只有當「有輸入值」且在禁止清單中時才亮紅
    // 若該腳位為空，則不亮紅
    if (FORBIDDEN_PINS.map(String).includes(kStr) && val) {
      color = "red-alert";
      matchedRule = true;
    }

    // 3. 自定義規則 (遍歷)
    if (!matchedRule) {
      for (const rule of VALIDATION_RULES) {
        // rule.pins 包含此腳位嗎？
        if (rule.pins && rule.pins.includes(kStr)) {
          matchedRule = true;
          // 檢查是否符合 allowed_patterns
          // allowed_patterns 是一組 Regex 字串或純文字
          let isMatch = false;
          if (rule.allowed_patterns && rule.allowed_patterns.length > 0) {
            isMatch = rule.allowed_patterns.some(pat => {
              try {
                return new RegExp(pat).test(U);
              } catch (e) {
                return pat === U; // Fallback to exact match
              }
            });
          }

          if (isMatch) {
            color = rule.color; // Pass (Pink/Blue/Green)
          } else {
            color = "red-alert"; // Fail
          }

          break; // 找到第一個匹配的腳位規則就停 (通常一個腳位只屬一個群組)
        }
      }
    }

    // 4. 若無特定規則，使用 classifyInputLabel 的結果 (前面已賦值)
    // 或是舊有的硬規則 (如果需要保留相容性，可在此追加)

    // 清掉舊色
    el.classList.remove("bg-gray", "bg-green", "bg-pink", "bg-blue", "bg-red-alert");
    el.style.backgroundColor = "";
    el.style.color = "";
    el.style.fontWeight = "";

    // 套用顏色
    if (color === "red-alert") {
      el.style.backgroundColor = "#FF0000";
      el.style.color = "#FFFFFF";
      el.style.fontWeight = "bold";
      el.classList.add("bg-red-alert");
    } else if (color) {
      el.classList.add(`bg-${color}`);
    }
  });
}


// ====== Wiring pins to labels ======
function processPinDataToInputs() {
  // 先建立一個新的陣列，存真正有效的 pin
  const trulyValid = [];

  VALID_PINS.forEach(p => {
    const key = normLabel(p.pin_no);
    const el = inputsByLabel.get(p.pin_no) || inputsByLabelNorm.get(key);

    if (el) {
      // 如果有對應的 label 才算是有效 PIN
      const showName = (p.pin_name || "").trim();
      el.textContent = showName;
      const msg = `${p.pin_no}, ${showName}`;
      trulyValid.push(p);
    } else {
      // 沒有 label 的就丟到 INVALID_PINS
      const msg = `${p.pin_no}, ${p.pin_name}`;
      if (!INVALID_PINS.includes(msg)) INVALID_PINS.push(msg);
    }
  });

  // 更新 VALID_PINS，只留下真的有對應 label 的 pin
  VALID_PINS = trulyValid;

  applyInputColors();
  setInvalidPins(INVALID_PINS);

  // 額外輸出方便 debug
  console.log("真正有效的 pins:", VALID_PINS.map(p => p.pin_no));
  console.log("被扣掉的 pins:", INVALID_PINS);
}



// 根據 side-* 類別，回傳 .pin-box 在「stage 座標」中的內側邊緣中點
function innerAnchorOfBox(boxEl) {
  const lb = boxEl.getBoundingClientRect();        // 盒子在視窗的實際位置（含 rotate/scale）
  const st = stage.getBoundingClientRect();        // stage 在視窗的位置
  const toStageX = (vx) => (vx - st.left) / DISPLAY_SCALE;
  const toStageY = (vy) => (vy - st.top) / DISPLAY_SCALE;

  // 內側：指向 chip 的那一邊
  if (boxEl.classList.contains("side-left")) {
    // 右邊緣中點
    return { x: toStageX(lb.right), y: toStageY(lb.top + lb.height / 2) };
  }
  if (boxEl.classList.contains("side-right")) {
    // 左邊緣中點
    return { x: toStageX(lb.left), y: toStageY(lb.top + lb.height / 2) };
  }
  if (boxEl.classList.contains("side-top")) {
    // 下邊緣中點（rotate90 也會正確）
    return { x: toStageX(lb.left + lb.width / 2), y: toStageY(lb.bottom) };
  }
  if (boxEl.classList.contains("side-bottom")) {
    // 上邊緣中點
    return { x: toStageX(lb.left + lb.width / 2), y: toStageY(lb.top) };
  }
  // fallback: 中心點
  return { x: toStageX(lb.left + lb.width / 2), y: toStageY(lb.top + lb.height / 2) };
}

// === Corner exclusive rule (一個轉角只能打一條線) ===
// 依目前會畫線的 LABEL 檢查：D&E、F&G、A&P、K&J
function computeCornerConflictsFromValid() {
  const have = new Set(VALID_PINS.map(p => String(p.pin_no).trim().toUpperCase()));
  const corners = [
    { corner: "左下", labels: ["D", "E"] },
    { corner: "右下", labels: ["F", "G"] },
    { corner: "左上", labels: ["A", "P"] },
    { corner: "右上", labels: ["K", "J"] },
  ];
  return corners.filter(c => c.labels.every(lbl => have.has(lbl)));
}

// === 線段交叉檢測（有交叉就套用同樣的 .conflict 高亮） ===
function getOverlayLines() {
  const ov = document.getElementById("overlay");
  return Array.from(ov.querySelectorAll("line")).map(el => ({
    x1: +el.getAttribute("x1"),
    y1: +el.getAttribute("y1"),
    x2: +el.getAttribute("x2"),
    y2: +el.getAttribute("y2"),
    el,
    tag: el.dataset.tag || ""
  }));
}

const EPS = 0.0001;
const almostEqual = (a, b) => Math.abs(a - b) <= EPS;
const ptEq = (a, b) => almostEqual(a.x, b.x) && almostEqual(a.y, b.y);

function orient(ax, ay, bx, by, cx, cy) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
function onSeg(ax, ay, bx, by, cx, cy) {
  return Math.min(ax, bx) - EPS <= cx && cx <= Math.max(ax, bx) + EPS &&
    Math.min(ay, by) - EPS <= cy && cy <= Math.max(ay, by) + EPS &&
    Math.abs(orient(ax, ay, bx, by, cx, cy)) <= EPS;
}
function segIntersect(A, B) {
  const p1 = { x: A.x1, y: A.y1 }, p2 = { x: A.x2, y: A.y2 }, p3 = { x: B.x1, y: B.y1 }, p4 = { x: B.x2, y: B.y2 };
  // 共用端點不算交叉（避免在同一 pin/同一盒子接點被判定）
  if (ptEq(p1, p3) || ptEq(p1, p4) || ptEq(p2, p3) || ptEq(p2, p4)) return false;

  const o1 = orient(A.x1, A.y1, A.x2, A.y2, B.x1, B.y1);
  const o2 = orient(A.x1, A.y1, A.x2, A.y2, B.x2, B.y2);
  const o3 = orient(B.x1, B.y1, B.x2, B.y2, A.x1, A.y1);
  const o4 = orient(B.x1, B.y1, B.x2, B.y2, A.x2, A.y2);

  // 一般相交
  if ((o1 > EPS && o2 < -EPS || o1 < -EPS && o2 > EPS) &&
    (o3 > EPS && o4 < -EPS || o3 < -EPS && o4 > EPS)) return true;

  // 共線重疊也算交叉
  if (Math.abs(o1) <= EPS && (onSeg(A.x1, A.y1, A.x2, A.y2, B.x1, B.y1) || onSeg(A.x1, A.y1, A.x2, A.y2, B.x2, B.y2))) return true;
  if (Math.abs(o3) <= EPS && (onSeg(B.x1, B.y1, B.x2, B.y2, A.x1, A.y1) || onSeg(B.x1, B.y1, B.x2, B.y2, A.x2, A.y2))) return true;

  return false;
}

// === 線段交叉檢測（有交叉就套用同樣的 .conflict 高亮） ===
function checkLineIntersections() {
  const lines = getOverlayLines(); // {x1,y1,x2,y2, el, tag}

  // 依 data-ring 分組
  const groups = { inner: [], outer: [], unknown: [] };
  lines.forEach(L => {
    const ring = L.el.dataset.ring || "unknown";
    (groups[ring] || groups.unknown).push(L);
  });

  // 小工具：兩兩檢查是否相交
  const scan = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (segIntersect(arr[i], arr[j])) {
          arr[i].el.classList.add('conflict');
          arr[j].el.classList.add('conflict');
        }
      }
    }
  };

  // 若畫面上「沒有任何 inner/outer」→ 代表單圈（或未能分圈）
  // 單圈時就把全部線一起掃（含 unknown）
  const hasKnownRings = (groups.inner.length + groups.outer.length) > 0;
  if (hasKnownRings) {
    // 雙圈：各圈內部分開檢查，避免跨圈誤判
    scan(groups.inner);
    scan(groups.outer);
    // unknown 不與任何圈互檢
  } else {
    // 單圈：全部一起檢查
    scan(lines);
  }
}




// 將衝突的兩條線加上 .conflict（以 data-tag 選取）
// 每次先清掉舊的，再套新的
function highlightCornerLines(conflicts) {
  const ov = document.getElementById("overlay");
  if (!ov) return;
  ov.querySelectorAll("line.conflict").forEach(el => el.classList.remove("conflict"));
  (conflicts || []).forEach(c => (c.labels || []).forEach(lbl => {
    const el = ov.querySelector(`[data-tag="LINE_${lbl}"]`);
    if (el) el.classList.add("conflict");
  }));
}

// 每次重繪完成就檢查一次
function checkCornerExclusive() {
  const conflicts = computeCornerConflictsFromValid();
  highlightCornerLines(conflicts);
}

// === 視圖切換：1:1 / 放大到黃色區 0.9 倍 ===
// 取 chip 基本顯示尺寸（從 chip size 轉 px）
function baseChipPixelSize() {
  const w_um = Number(chipWidthEl.value) || 0;
  const h_um = Number(chipHeightEl.value) || 0;
  if (!w_um || !h_um) return null;
  return sizeFromChipUm(w_um, h_um); // {w,h}
}

// 將圖片置中到指定矩形（stage 座標）
function centerImageToRect(imgW, imgH, rect) {
  chipImage.style.left = `${rect.left + (rect.right - rect.left - imgW) / 2}px`;
  chipImage.style.top = `${rect.top + (rect.bottom - rect.top - imgH) / 2}px`;
}

// 依目前模式套用視圖
function applyViewMode() {
  if (!chipImage.classList.contains('loaded')) return; // 沒圖不處理
  const base = baseChipPixelSize();
  if (!base) return;

  if (!BIG_VIEW_MODE) {
    // 1:1 / 既有比例（用 chip size 像素值）→ 置中到四側 pin 盒的內框
    chipImage.style.width = base.w + "px";
    chipImage.style.height = base.h + "px";
    centerChipImageInInnerFrame();
  } else {
    // 放大視圖：塞進黃色區（#epadBackground）0.9 倍，長/寬先到就停
    const epad = document.getElementById("epadBackground");
    const rect = epad ? getStageRect(epad) : null;
    if (!rect) {
      // 找不到黃色區就退回 1:1（避免壞狀態）
      chipImage.style.width = base.w + "px";
      chipImage.style.height = base.h + "px";
      centerChipImageInInnerFrame();
    } else {
      const epadW = rect.right - rect.left;
      const epadH = rect.bottom - rect.top;
      const s = BIG_VIEW_RATIO * Math.min(epadW / base.w, epadH / base.h); // 等比例放大
      const w = base.w * s, h = base.h * s;
      chipImage.style.width = w + "px";
      chipImage.style.height = h + "px";
      centerImageToRect(w, h, rect); // 置中到黃色區
    }
  }
  // 依圖片邊界重設 MIN/MAX → 重畫（避免比例改變造成定位不符）
  if (typeof setMinMaxToImage === 'function') setMinMaxToImage();
  if (typeof drawPinsAndLines === 'function') drawPinsAndLines();
}

// ★ 切換按鈕監聽：文字與模式互切
viewToggleBtn?.addEventListener('click', () => {
  BIG_VIEW_MODE = !BIG_VIEW_MODE;
  viewToggleBtn.textContent = BIG_VIEW_MODE ? "1:1視圖" : "放大視圖";
  applyViewMode();
});


// ====== Draw pins and lines ======
function drawPinsAndLines() {
  clearOverlay();
  // 先把所有側邊標籤字重還原，避免殘留粗體
  labelDivsByLabel.forEach(div => { div.style.fontWeight = "400"; });
  // draw MIN/MAX (藍點)
  // ★ MIN/MAX 固定藍色與固定半徑（MINMAX_DOT_RADIUS）
  if (MIN_POINT) { drawCircle(MIN_POINT.x, MIN_POINT.y, pinDotRadius(), "#00f"); drawText(MIN_POINT.x + 5, MIN_POINT.y - 5, "MIN", "#00f"); }
  if (MAX_POINT) { drawCircle(MAX_POINT.x, MAX_POINT.y, pinDotRadius(), "#00f"); drawText(MAX_POINT.x - 20, MAX_POINT.y + 10, "MAX", "#00f"); }

  const chipW = Number(chipWidthEl.value), chipH = Number(chipHeightEl.value);
  if (!chipW || !chipH || !MIN_POINT || !MAX_POINT) return;

  // 新增：計算全域邊界供繪圖迴圈使用 (2026/1/1修改: 改用 helper)
  const allPoints = [];
  (VALID_PINS || []).forEach(p => {
    const pt = chipToStage(p.x, p.y, chipW, chipH);
    if (pt) allPoints.push(pt);
  });
  // 需有 bounds 才能做後續幾何分類
  const bounds = allPoints.length ? computeGlobalBounds(allPoints) : null;


  // ① 計算內/外圈 rails + 兩個方形框
  const rails = computeRingRails(chipW, chipH);
  const rects = rails ? buildRingRects(rails) : null;
  // === 只有單圈 → 鎖定「全部」並停用選單；有雙圈 → 可切換 ===
  const twoRings = hasTwoRings(rails);
  updatePinScopeLock(twoRings);

  // 只有在 Debug 開啟時才畫出方形參考線（預設不畫）
  // 註：不影響分圈與主流程，只是視覺上的參考
  if (rects && DEBUG_SHOW_RING_RECTS) {
    // 參考線（外橘內綠、虛線）：不影響主流程
    drawRect(rects.outer.left, rects.outer.top, rects.outer.right, rects.outer.bottom, RING_COLORS.outer, true, "RING_OUTER");
    drawRect(rects.inner.left, rects.inner.top, rects.inner.right, rects.inner.bottom, RING_COLORS.inner, true, "RING_INNER");
  }

  VALID_PINS.forEach(p => {
    const pt = chipToStage(p.x, p.y, chipW, chipH);
    if (!pt) return;

    // ② 依圈別決定顏色（unknown 則維持預設色）
    const boxEl = inputsByLabel.get(p.pin_no) || inputsByLabelNorm.get(normLabel(p.pin_no));

    // 2026/1/1修改: 改用幾何位置判定 Side (Helper)
    let geoSide = null;
    if (bounds) {
      geoSide = getGeometricSide(pt, bounds);
    }

    let ring = "unknown";
    if (rects && geoSide && hasTwoRings(rails)) {
      const axisVal = (geoSide === "left" || geoSide === "right") ? pt.x : pt.y;
      ring = decideRing(geoSide, axisVal, rails);
    }
    // 以「使用者選色」為基底：內圈偏亮、外圈偏暗；unknown 就用原色
    const color = ringColor(PIN_STYLE_COLOR, ring);
    const dotEl = drawCircle(pt.x, pt.y, pinDotRadius(), color, `PIN_${p.pin_no}`);
    if (dotEl) dotEl.dataset.ring = ring;

    if (boxEl) {
      const anchor = innerAnchorOfBox(boxEl); // 內側錨點（既有）

      // === 新增：顯示線篩選（只影響連線，不影響點/參考虛線） ===
      // ring 可能是 'inner' / 'outer' / 'unknown'
      // - 當 PIN_LINE_SCOPE 為 'inner' 或 'outer' 時，只有對應圈別才畫線
      // - 'unknown' 僅在 'all' 模式才會畫線（避免誤判）
      if (
        PIN_LINE_SCOPE !== 'all' &&
        ring !== PIN_LINE_SCOPE // 不同圈別就跳過畫線
      ) {
        // 不畫線，但點已在上面照常畫出
      } else {
        const lineEl = drawLine(pt.x, pt.y, anchor.x, anchor.y, color, pinLineWidth(), `LINE_${p.pin_no}`);
        if (lineEl) lineEl.dataset.ring = ring; // 保留 dataset，供紅線/碰撞檢查用
        const labelDiv = labelDivsByLabel.get(p.pin_no); //使連到的標籤加粗
        if (labelDiv) labelDiv.style.fontWeight = "700";
      }
    }

  });

  checkCornerExclusive();     // 先做轉角互斥（會清掉舊 .conflict 再套角落高亮）
  checkLineIntersections();   // 再做「線交叉」→ 把交叉線也加上 .conflict 高亮
}

function updatePinScopeLock(twoRings) {
  const sels = document.querySelectorAll('#pinLineScope'); // 就算誤有兩個，一次處理
  if (!sels.length) return;
  if (!twoRings) {
    sels.forEach(sel => {
      sel.disabled = true;
      sel.value = 'all';
      sel.title = '偵測到單圈：僅能顯示全部';
    });
    PIN_LINE_SCOPE = 'all';
  } else {
    sels.forEach(sel => {
      sel.disabled = false;
      sel.title = '';
    });
  }
}


// === 用 html2canvas 把 #stage 直接截圖（所見即所得） ===
// 為了避免 <input> 的 baseline 偏移，截圖時用 clone，把 .pin-input 改成 .pin-box
async function renderStageCanvas() {
  // 新增：截圖前刷新時間顯示
  const nt = document.getElementById("nowtime");
  if (nt) nt.textContent = nowTime();

  const stage = document.getElementById("stage");
  const canvas = await html2canvas(stage, {
    backgroundColor: "#fff",
    scale: 2,
    useCORS: true,
    logging: false
  });
  return canvas;
}



async function downloadPNG() {
  try {
    const canvas = await renderStageCanvas();
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "padlist_snapshot.png";
    a.click();
  } catch (err) {
    console.error("下載截圖失敗：", err);
    setError("下載截圖失敗，請查看 console 訊息。");
  }
}

async function copyStageToClipboard() {
  try {
    const canvas = await renderStageCanvas();
    await new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ]);
          resolve();
        } catch (e) { reject(e); }
      }, "image/png");
    });
    setStatus("已複製截圖到剪貼簿！");
  } catch (err) {
    console.error("複製到剪貼簿失敗：", err);
    setError("複製到剪貼簿失敗（瀏覽器可能不支援或權限被拒）。");
  }
}

// 將 canvas 轉 blob（PNG）
async function canvasToBlob(canvas) {
  return await new Promise(res => canvas.toBlob(b => res(b), "image/png"));
}

// 以「目前視圖」把舞台區截成 canvas（沿用你現有的 html2canvas/渲染流程）
async function captureStageBlobAtCurrentView() {
  const canvas = await renderStageCanvas();   // 你專案既有的截圖函式
  return await canvasToBlob(canvas);
}

// ★ 只在截圖期間臨時調整點線倍率，截完立即還原
async function withTempPinScale(scale, task) {
  const prevScale = PIN_STYLE_SCALE;
  PIN_STYLE_SCALE = scale;
  if (typeof drawPinsAndLines === 'function') drawPinsAndLines(); // 依新倍率重繪
  await new Promise(r => requestAnimationFrame(() => r()));       // 等一個 frame

  try {
    return await task();  // 交給呼叫端執行（通常是 captureStageBlobAtCurrentView）
  } finally {
    // 還原
    PIN_STYLE_SCALE = prevScale;
    if (typeof drawPinsAndLines === 'function') drawPinsAndLines();
    await new Promise(r => requestAnimationFrame(() => r()));
  }
}


// 主要流程：兩次截圖（1:1 與 放大），POST 到 API，拿回 Excel 檔案
async function downloadExcelViaAPI() {
  try {
    if (!SESSION_ID) {
      setError("尚未上傳 Excel / 尚未建立 session"); // 你專案的錯誤顯示函式
      return;
    }
    const sheet = (typeof sheetSelector !== "undefined" && sheetSelector?.value) ? sheetSelector.value : "";

    // 記住原本視圖狀態
    const prev = BIG_VIEW_MODE;

    // 左圖：1:1 視圖
    BIG_VIEW_MODE = false;
    applyViewMode();                          // 你專案用來套用 BIG_VIEW_MODE 的函式
    await new Promise(r => requestAnimationFrame(() => r())); // 等畫面更新
    const leftBlob = await withTempPinScale(1.5, async () => {
      return await captureStageBlobAtCurrentView();
    });

    // 右圖：放大視圖（黃色區 0.9 倍）
    BIG_VIEW_MODE = true;
    applyViewMode();
    await new Promise(r => requestAnimationFrame(() => r()));
    const rightBlob = await withTempPinScale(4, async () => {
      return await captureStageBlobAtCurrentView();
    });

    // 回復原視圖（避免影響使用者）
    BIG_VIEW_MODE = prev;
    applyViewMode();

    // 組 FormData 打 API
    const fd = new FormData();
    fd.append("session_id", SESSION_ID);
    fd.append("sheet_name", sheet);               // 後端用來取名新分頁
    fd.append("img_left", leftBlob, "view_1to1.png");
    fd.append("img_right", rightBlob, "view_zoom.png");

    const resp = await fetch("/excel/paste_snapshot", { method: "POST", body: fd });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error("伺服器錯誤：" + t);
    }
    const blob = await resp.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const code = (projectCodeEl?.textContent || "padlist").trim() || "padlist";
    a.download = `${code}_${nowStamp()}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    setError(err.message || String(err));
  }
}


// 允許重新選擇同名檔案也會觸發 change（關鍵修正）
// 放在 excelFile 的 change 綁定「前面」
const excelInput = document.getElementById('excelFile');
excelInput.addEventListener('click', () => {
  // 清空目前選擇，確保相同檔名再次選取也會觸發 change
  excelInput.value = '';
});

// ★ 檢查是否已有「輸出後的分頁」（1to1 / 1to9）
function hasGeneratedTabsFrom(data) {
  // 允許底線/空白/連字號作為邊界
  const re = /(^|[_\s-])1to1($|[_\s-])|(^|[_\s-])1to9($|[_\s-])/i;
  const names = [...new Set([...(data.all_sheets || []), ...(data.sheets || [])])];
  return names.some(n => re.test(String(n || "")));
}


// ====== Event wiring ======
document.getElementById("excelFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) { return; }
  CURRENT_FILE_NAME = f.name; // ★ 新增
  resetErrorUIForNewLoad();  // ★ 換檔 → 先清上一輪錯誤/膠囊/GIF
  setError("");
  hideLoadBtn();           // 換新檔 → 先把載入資料按鈕藏起來
  // 先清空圖片，再清空 chip 欄位（避免先清欄位造成瞬間閃爍）
  clearImageAndState();
  if (window.resetOffsets) window.resetOffsets(); // ★ 換新檔案 → OFFSET 歸零（不緩存）
  if (window.resetPinStyle) window.resetPinStyle(); // ★ 換新檔案 → Pin 樣式回預設（倍率 1.5×、#BEBEBE）
  setStatus("上傳中...");
  hideDataControls();
  const fd = new FormData();
  fd.append("file", f);
  const res = await fetch("/upload", { method: "POST", body: fd });
  if (!res.ok) { setError("上傳失敗"); console.error("Upload failed", res.status, await res.text()); return; }
  const data = await res.json();
  if (data.error) { setError(data.error); console.error("Server error:", data.error); return; }
  SESSION_ID = data.session_id;
  // ★ 插入：偵測 1to1 / 1to9
  if (hasGeneratedTabsFrom(data)) {
    setError("偵測到1to1、1to9，請刪除後，再試一次");
    sheetSelector.innerHTML = "";
    chipImage.removeAttribute("src");
    chipImage.classList.remove("loaded");
    return;
  }

  setStatus("已選擇檔案: " + f.name);


  // 只填入「有圖的工作表」
  sheetSelector.innerHTML = "";
  (data.sheets || []).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sheetSelector.appendChild(opt);
  });

  // 若沒有任何含圖的工作表 → 顯示提示並維持空畫面
  if (!sheetSelector.options.length) {
    setError("這個檔案內沒有任何『含圖片』的工作表：\n請在 Excel 中插入圖片（插入→圖片），存檔後再上傳。");
    chipImage.removeAttribute("src");
    chipImage.classList.remove("loaded");
    return;
  }

  // auto query sheet info
  if (sheetSelector.value) {
    await querySheetInfo();
  }
});

sheetSelector.addEventListener("change", querySheetInfo);

async function querySheetInfo() {
  hideDataControls();
  hideLoadBtn();           // 註解：切表當下先把載入按鈕藏起來
  resetErrorUIForNewLoad();  // ★ 切表 → 先清上一輪（避免舊膠囊掛在畫面上）

  if (window.resetOffsets) window.resetOffsets(); // ★ 換新檔案 → OFFSET 歸零（不緩存）
  if (window.resetPinStyle) window.resetPinStyle(); // ★ 切換工作表 → Pin 樣式回預設
  if (!SESSION_ID || !sheetSelector.value) return;
  setError("");

  // ★ 這次查詢的序號（只用最後一次的結果）
  const token = ++CURRENT_SHEET_REQ;

  const fd = new FormData();
  fd.append("session_id", SESSION_ID);
  fd.append("sheet_name", sheetSelector.value);
  const res = await fetch("/sheet_info", { method: "POST", body: fd });
  const data = await res.json();

  // 若這不是最後一次請求的回應 → 丟棄，避免舊回應覆蓋新狀態
  if (token !== CURRENT_SHEET_REQ) return;
  if (data.error) { setError(data.error); return; }

  // === 依 chip size 是否有值，決定是否載入圖片 ===
  const w = Number(data?.chip_size?.width) || 0;
  const h = Number(data?.chip_size?.height) || 0;
  const hasChipSize = w > 0 && h > 0;

  if (!hasChipSize) {
    // 這個工作表沒有 chip size → 不載圖、清乾淨、顯示錯誤
    clearImageAndState();
    setError("此工作表未偵測到 chip size（寬/高）。請於指定儲存格填入格式：123 um x 456 um");
    // ❌ 這是「載入錯誤」類型（資料缺失），此時才加紅框
    markChipSizeInvalid(true, "未偵測到 chip size（寬/高）");
    return;
  } else {
    // ✅ 有 chip size → 設定顯示尺寸並載圖 & 先填值，再清除紅框（有值才清掉，避免清空時閃紅）
    chipWidthEl.value = w.toFixed(3);
    chipHeightEl.value = h.toFixed(3);
    markChipSizeInvalid(false);

    const sz = sizeFromChipUm(w, h);
    chipImage.style.width = sz.w + "px";
    chipImage.style.height = sz.h + "px";
    if (data.image_url) {
      chipImage.classList.remove('loaded');  // 成功後由 load 事件顯示 & 開啟按鈕
      chipImage.removeAttribute('src');      // 先取消舊請求，降低競態
      chipImage.dataset.req = String(token); // 標記此圖對應的請求序號
      chipImage.src = data.image_url + `?v=${Date.now()}`; // 加上時間戳避免快取
    } else {
      // 找不到圖 → 視為載入錯誤，才加紅框
      clearImageAndState();
      setError("此工作表未找到可用圖片。");
      markChipSizeInvalid(true, "此工作表未找到可用圖片");
      return; // 這裡直接結束，避免後面流程繼續
    }
  }
  projectCodeEl.textContent = data.project_code || "";

  // ★ 新增：把 PadWindow / CUP 寫進膠囊
  if (data.extras) {
    const rawPw = data.extras.PadWindow || "";
    const rawCup = data.extras.CUP || "";

    // ★ 2026/1/2修改：判斷鋁線/金線邏輯
    // 規則：CUP為[no msg]或是空 & PadWindow >= 65X65 就是鋁線，其他為金線
    const wireType = judgeWireType(rawPw, rawCup);

    padwindowEl.textContent = rawPw;
    // 顯示 CUP 原始值
    cupEl.textContent = rawCup || "[no msg]";

    // ★ 2026/1/2修改：將判斷結果顯示在獨立的 Wire Type 膠囊
    if (wireTypeEl) wireTypeEl.textContent = wireType;
  } else {
    padwindowEl.textContent = "";
    cupEl.textContent = "";
    if (wireTypeEl) wireTypeEl.textContent = "";
  }


  // rebuild UI (labels/inputs), clear overlay & pins
  buildSideUI();
  // 依四側 pin-box 內側框置中 chip 圖
  // 置中僅在有圖時才做，避免做多餘動作
  if (hasChipSize && data.image_url) {
    centerChipImageInInnerFrame();
    // ★ 視圖模式套用（若使用者已切到放大視圖會即時生效）
    if (typeof applyViewMode === "function") applyViewMode();
    clearOverlay(); MIN_POINT = null; MAX_POINT = null;
    VALID_PINS = []; INVALID_PINS = [];
    setInvalidPins([]);
    setStatus(`已載入 ${CURRENT_FILE_NAME || "所選檔案"}：所選擇工作表中最大張圖片與 chip size；可直接按「2. 載入資料」`);
  }
}

document.getElementById("loadDataBtn").addEventListener("click", async () => {
  if (!SESSION_ID || !sheetSelector.value) { setError("請先選擇檔案與工作表"); return; }

  if (!chipWidthEl.value || !chipHeightEl.value) {
    setError("本工作表缺少 chip size（寬/高），已略過載入。請先於 Excel 指定儲存格填入 chip size（寬/高）。");
    return;
  }
  // ★ 每次按「載入資料」前重置：這次載入只播一次
  invalidGifShownThisLoad = false;
  const _el = getInvalidGifEl();
  if (_el) { _el.classList.remove('show'); _el.hidden = true; }

  resetErrorUIForNewLoad();  // ★ 新一輪載入 → 先清上一輪
  setError("");
  const fd = new FormData();
  fd.append("session_id", SESSION_ID);
  fd.append("sheet_name", sheetSelector.value);
  const res = await fetch("/parse_pins", { method: "POST", body: fd });
  const data = await res.json();
  if (data.error) { setError(data.error); return; }
  VALID_PINS = data.valid_pins || [];
  INVALID_PINS = data.invalid_pins || [];
  processPinDataToInputs();

  // ★ 新增：自動以圖片邊界設定 MIN/MAX
  const ok = setMinMaxToImage();
  if (!ok) {
    setError("圖片尚未載入，無法自動設定 MIN/MAX");
  }
  else {
    setStatus(`資料載入完成，有效的 pin 數量: ${VALID_PINS.length}（已以圖片邊界自動設定 MIN/MAX）`);
  }

  drawPinsAndLines();
  revealDataControls(); //把隱藏區域打開
});

// === Pan/Zoom 狀態（空白鍵拖曳平移、Ctrl+滾輪縮放） ===
let CURRENT_ZOOM = 1.0;     // 既有：縮放倍率

function applyZoom(z) {
  CURRENT_ZOOM = Math.min(Math.max(z, 0.2), 3);
  stage.style.transform = `scale(${CURRENT_ZOOM})`; // 只縮放，不平移
  DISPLAY_SCALE = CURRENT_ZOOM;
  if (zoomVal) zoomVal.textContent = Math.round(CURRENT_ZOOM * 100) + "%";
}

// Ctrl + 滾輪
window.addEventListener("wheel", (e) => {
  if (e.ctrlKey) {
    e.preventDefault(); // 阻止瀏覽器整頁縮放
    const step = 0.05;
    if (e.deltaY < 0) applyZoom(CURRENT_ZOOM + step); // 放大
    else applyZoom(CURRENT_ZOOM - step);              // 縮小
  }
}, { passive: false });

// === 空白鍵 + 拖曳：平移畫面 ===
let isSpaceDown = false;
let isPanning = false;
let panStart = { x: 0, y: 0 };      // 滑鼠按下座標（視窗座標）
let panOrigin = { x: 0, y: 0 };     // 當下 PAN_X/Y

// 工具：判斷是否在輸入控件上（避免擋住輸入空白）
function inEditable(el) {
  return el && (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}

//window.addEventListener('keydown', (e)=>{
//  if ((e.code === 'Space' || e.key === ' ') && !inEditable(e.target)) {
//    e.preventDefault(); // 避免空白鍵捲動頁面/觸發按鈕 click
//    isSpaceDown = true;
//    stageWrapper.classList.add('space-pan-ready'); // 換成「🖐 可拖動」游標
//  }
//});
//
//window.addEventListener('keyup', (e)=>{
//  if (e.code === 'Space' || e.key === ' ') {
//    isSpaceDown = false;
//    if (!isPanning) stageWrapper.classList.remove('space-pan-ready');
//  }
//});

// 只在畫布容器內支援拖曳
stageWrapper.addEventListener('mousedown', (e) => {
  // ✨ 修改：檢查是否為滑鼠中鍵 (e.button === 1)
  if (e.button !== 1) return;
  e.preventDefault();
  isPanning = true;
  stageWrapper.classList.add('space-pan-active'); // 改成用 class 控制游標樣式
  panStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;

  const scroller = document.scrollingElement || document.documentElement;
  scroller.scrollLeft -= dx;   // ← 往滑鼠反方向捲動，視覺上就是「拖畫面」
  scroller.scrollTop -= dy;

  panStart = { x: e.clientX, y: e.clientY }; // 基準改成目前位置
});


window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    stageWrapper.classList.remove('space-pan-active');
    // 若空白鍵還按著，保留「ready」游標；放開空白鍵就移除
    if (!isSpaceDown) stageWrapper.classList.remove('space-pan-ready');
  }
});

// 初始縮放顯示
applyZoom(1.0);
// 預設就隱藏載入按鈕，直到圖片真的載入成功
hideLoadBtn();

// Download
document.getElementById("btnDownload").addEventListener("click", downloadPNG);
document.getElementById("btnCopy").addEventListener("click", copyStageToClipboard);
document.getElementById("btnExcelApi").addEventListener("click", downloadExcelViaAPI);

// --- MIN/MAX OFFSET UI wiring ---
document.addEventListener('DOMContentLoaded', async () => {
  await checkEditor(); // 先同步權限，再綁其它 UI（避免看到非主管卻能編輯）
  setupNoticesAccordion();
  setupNoticeEditors();
  await loadNotices();

  const offsetAll = document.getElementById('offsetAll');
  const offsetLink = document.getElementById('offsetLink');
  const offsetTop = document.getElementById('offsetTop');
  const offsetRight = document.getElementById('offsetRight');
  const offsetBottom = document.getElementById('offsetBottom');
  const offsetLeft = document.getElementById('offsetLeft');
  const offsetReset = document.getElementById('offsetReset');

  const vAll = document.getElementById('offsetAllValue');
  const vTop = document.getElementById('offsetTopValue');
  const vRight = document.getElementById('offsetRightValue');
  const vBottom = document.getElementById('offsetBottomValue');
  const vLeft = document.getElementById('offsetLeftValue');
  const grid = document.getElementById('offsetGrid');

  // === Pin Style UI 綁定 ===
  const scaleSel = document.getElementById('pinStyleScale');
  const colorRadios = document.querySelectorAll('input[name="pinStyleColor"]');
  const scopeSel = document.getElementById('pinLineScope'); // ← 新增：顯示線篩選


  // 讓外部（切檔/切表）也能把 Pin 樣式回預設並同步 UI
  window.resetPinStyle = function () {
    // 預設：1.5× 與 #BEBEBE（與你的常數初始值一致）
    PIN_STYLE_SCALE = 1.5;
    PIN_STYLE_COLOR = "#BEBEBE";
    PIN_STYLE_COLOR_INNER = null; // 重置內圈

    // 同步 UI：顯示線（可選）— 回到全部
    if (typeof scopeSel !== 'undefined' && scopeSel) {
      scopeSel.value = 'all';
    }
    PIN_LINE_SCOPE = 'all';

    // 不需要 localStorage removeItem，因為我們不再存了

    // 同步 UI：倍率下拉
    if (scaleSel) {
      const val = "1.5";
      if ([...scaleSel.options].some(o => o.value === val)) scaleSel.value = val;
    }
    // 同步 UI：顏色單選
    if (colorRadios && colorRadios.length) {
      colorRadios.forEach(r => { r.checked = (r.value === PIN_STYLE_COLOR); });
    }

    // 同步 UI：隱藏自訂色盤
    const ccDiv = document.getElementById('customColorControls');
    if (ccDiv) ccDiv.style.display = 'none';

    // 立即重畫（不用觸發 change 事件）
    if (typeof drawPinsAndLines === 'function') drawPinsAndLines();
  };


  //function loadOffset() {
  //  try {
  //    const s = localStorage.getItem('minmax_offset');
  //    if (!s) return;
  //    const o = JSON.parse(s);
  //    ['left','right','top','bottom'].forEach(k=>{
  //      if (typeof o[k] === 'number') MINMAX_OFFSET[k] = o[k];
  //    });
  //  } catch(e){}
  //}

  // 不再從 localStorage 載入，初始化就歸零
  function loadOffset() {
    // ★ 取消緩存：每次進頁面都回 0
    MINMAX_OFFSET = { left: 0, right: 0, top: 0, bottom: 0 };
    // ★ 一次性清掉舊版留下的快取鍵（避免其他地方誤讀到）
    try { localStorage.removeItem('minmax_offset'); } catch (e) { }
  }

  //function saveOffset() {
  //  localStorage.setItem('minmax_offset', JSON.stringify(MINMAX_OFFSET));
  //}

  function syncUI() {
    const eq = (MINMAX_OFFSET.left === MINMAX_OFFSET.right) &&
      (MINMAX_OFFSET.left === MINMAX_OFFSET.top) &&
      (MINMAX_OFFSET.left === MINMAX_OFFSET.bottom);
    if (eq) {
      offsetLink.checked = true;
      offsetAll.value = MINMAX_OFFSET.left;
      grid.style.display = 'none';
    } else {
      offsetLink.checked = false;
      grid.style.display = 'grid';
    }

    offsetTop.value = MINMAX_OFFSET.top;
    offsetRight.value = MINMAX_OFFSET.right;
    offsetBottom.value = MINMAX_OFFSET.bottom;
    offsetLeft.value = MINMAX_OFFSET.left;

    vAll.textContent = offsetAll.value;
    vTop.textContent = offsetTop.value;
    vRight.textContent = offsetRight.value;
    vBottom.textContent = offsetBottom.value;
    vLeft.textContent = offsetLeft.value;
  }

  function applyAndRedraw() {
    //saveOffset();//取消緩存
    if (typeof setMinMaxToImage === 'function') setMinMaxToImage();
    if (typeof drawPinsAndLines === 'function') drawPinsAndLines();
  }

  // listeners
  offsetAll?.addEventListener('input', e => {
    const v = +e.target.value;
    if (offsetLink.checked) {
      MINMAX_OFFSET = { left: v, right: v, top: v, bottom: v };
      syncUI();
      applyAndRedraw();
    }
    vAll.textContent = v;
  });

  [['offsetTop', 'top'], ['offsetRight', 'right'],
  ['offsetBottom', 'bottom'], ['offsetLeft', 'left']
  ].forEach(([id, key]) => {
    const el = document.getElementById(id);
    el?.addEventListener('input', e => {
      const v = +e.target.value;
      MINMAX_OFFSET[key] = v;
      if (offsetLink.checked) {
        // 使用者動了單邊，就自動解鎖四邊連動
        offsetLink.checked = false;
        grid.style.display = 'grid';
      }
      syncUI();
      applyAndRedraw();
    });
  });

  offsetLink?.addEventListener('change', () => {
    // 開啟連動時，用目前 all 的值覆蓋四邊
    if (offsetLink.checked) {
      const v = +offsetAll.value;
      MINMAX_OFFSET = { left: v, right: v, top: v, bottom: v };
      syncUI();
      applyAndRedraw();
    } else {
      grid.style.display = 'grid';
    }
  });

  offsetReset?.addEventListener('click', () => {
    MINMAX_OFFSET = { left: 0, right: 0, top: 0, bottom: 0 };
    syncUI();
    applyAndRedraw();
  });

  // 移除 localStorage 載入 bias 的相關程式碼
  // ... (我們不載入 pin_style 了)

  // 事件監聽：改變就即時重畫＋存偏好
  const saveStyle = () => {
    try {
      localStorage.setItem('pin_style', JSON.stringify({
        scale: PIN_STYLE_SCALE,
        color: PIN_STYLE_COLOR
      }));
    } catch (e) { }
  };

  scaleSel?.addEventListener('change', () => {
    const v = parseFloat(scaleSel.value);
    PIN_STYLE_SCALE = isFinite(v) ? v : 1.5;
    drawPinsAndLines();  // 即時重畫
    // saveStyle(); // 不存檔
  });

  // 綁定自訂顏色 UI
  const customControls = document.getElementById('customColorControls');
  const customOuter = document.getElementById('customColorOuter');
  const customInner = document.getElementById('customColorInner');

  // 顯示/隱藏自訂區塊的 helper
  const updateCustomUI = () => {
    if (!customControls) return;
    if (PIN_STYLE_COLOR === 'custom') {
      customControls.style.display = 'flex'; // 或 block/grid
    } else {
      customControls.style.display = 'none';
    }
  };

  colorRadios?.forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) {
        PIN_STYLE_COLOR = r.value;

        // 若切換到標準色，把 inner 歸 null，讓 ringMate 接手
        if (PIN_STYLE_COLOR !== 'custom') {
          PIN_STYLE_COLOR_INNER = null;
        } else {
          // 切到自訂：初始化顏色（若變數是空的，讀 DOM 的值）
          if (customOuter) PIN_STYLE_COLOR = 'custom'; // 標記
          // 確保 PIN_STYLE_COLOR_INNER 有值
          if (!PIN_STYLE_COLOR_INNER && customInner) {
            PIN_STYLE_COLOR_INNER = customInner.value;
          }
        }

        updateCustomUI();
        drawPinsAndLines();  // 即時重畫
        // saveStyle(); // 不存檔
      }
    });
  });

  // 監聽自訂顏色變更 (Outer)
  customOuter?.addEventListener('input', (e) => {
    // 只有在 custom 模式下生效
    document.querySelector('input[name="pinStyleColor"][value="custom"]').checked = true;
    PIN_STYLE_COLOR = 'custom';

    // 重畫
    drawPinsAndLines();
  });

  // 監聽自訂顏色變更 (Inner)
  customInner?.addEventListener('input', (e) => {
    document.querySelector('input[name="pinStyleColor"][value="custom"]').checked = true;
    PIN_STYLE_COLOR = 'custom';
    PIN_STYLE_COLOR_INNER = e.target.value;

    drawPinsAndLines();
  });

  // 顯示線（不存偏好，不記憶）— 改變就重畫
  document.querySelectorAll('#pinLineScope').forEach(sel => {
    sel.addEventListener('change', () => {
      if (sel.disabled) {
        sel.value = 'all';
        PIN_LINE_SCOPE = 'all';
        drawPinsAndLines?.();
        return;
      }
      PIN_LINE_SCOPE = sel.value || 'all';
      // 同步其他下拉（若未來又誤植複本，也不會不同步）
      document.querySelectorAll('#pinLineScope').forEach(s2 => {
        if (s2 !== sel) s2.value = PIN_LINE_SCOPE;
      });
      drawPinsAndLines?.();
    });
  });


  // init
  loadRules(); // ★ 預載規則
  checkEditor();
  loadOffset();
  syncUI();
  // 首次載入就套用一次（若你要等圖片載好再套，可以把這行移到 onload 後）
  applyAndRedraw();

  // ★ 讓外部（切檔/切表）也能重置 OFFSET 並同步 UI
  window.resetOffsets = function () {
    MINMAX_OFFSET = { left: 0, right: 0, top: 0, bottom: 0 };
    // 同步 UI 顯示狀態（四邊連動/拉桿值/顯示數字）
    if (typeof syncUI === 'function') syncUI();
    // 重新套用到計算與繪圖
    if (typeof setMinMaxToImage === 'function') setMinMaxToImage();
    if (typeof drawPinsAndLines === 'function') drawPinsAndLines();
  };


  // === Shift + 滾輪：調整「邊界內縮」 ===
  // 規則：
  // 1) 有焦點的拉桿（上/右/下/左/全部）優先被調整
  // 2) 沒有焦點：若「四邊連動」開啟 → 同步調整四邊；未連動 → 四邊同值微調
  // 3) 每格步進 1px，範圍 0~30（與 UI 一致）
  stageWrapper.addEventListener('wheel', (e) => {
    if (!e.shiftKey || e.ctrlKey) return;   // 只處理 Shift，避免和 Ctrl+滾輪縮放衝突
    e.preventDefault();

    const step = (e.deltaY < 0) ? +1 : -1;
    const clamp = (n) => Math.max(0, Math.min(30, n));
    const ids = ['offsetAll', 'offsetTop', 'offsetRight', 'offsetBottom', 'offsetLeft'];

    const ae = document.activeElement;
    const focusedId = (ae && ids.includes(ae.id)) ? ae.id : null;

    if (focusedId && focusedId !== 'offsetAll') {
      if (focusedId === 'offsetTop') MINMAX_OFFSET.top = clamp(MINMAX_OFFSET.top + step);
      if (focusedId === 'offsetRight') MINMAX_OFFSET.right = clamp(MINMAX_OFFSET.right + step);
      if (focusedId === 'offsetBottom') MINMAX_OFFSET.bottom = clamp(MINMAX_OFFSET.bottom + step);
      if (focusedId === 'offsetLeft') MINMAX_OFFSET.left = clamp(MINMAX_OFFSET.left + step);
    } else {
      if (offsetLink.checked) {
        const v = clamp(MINMAX_OFFSET.left + step);
        MINMAX_OFFSET = { left: v, right: v, top: v, bottom: v };
        offsetAll.value = v; // 同步主拉桿
      } else {
        MINMAX_OFFSET = {
          left: clamp(MINMAX_OFFSET.left + step),
          right: clamp(MINMAX_OFFSET.right + step),
          top: clamp(MINMAX_OFFSET.top + step),
          bottom: clamp(MINMAX_OFFSET.bottom + step),
        };
      }
    }
    syncUI();          // ← 這裡會同步數值膠囊(vAll/vTop/...)
    applyAndRedraw();  // ← 存 localStorage、重算 MIN/MAX、重畫 overlay
  }, { passive: false });

});

invalidToggleEl?.addEventListener("click", () => {
  if (!invalidCapsuleEl) return;
  const expanded = invalidCapsuleEl.getAttribute('aria-expanded') === 'true';
  if (expanded) {
    invalidCapsuleEl.classList.add('collapsed');
    invalidCapsuleEl.setAttribute('aria-expanded', 'false');
    invalidToggleEl.textContent = "▼"; // 收合後顯示「可展開」
  } else {
    invalidCapsuleEl.classList.remove('collapsed');
    invalidCapsuleEl.setAttribute('aria-expanded', 'true');
    invalidToggleEl.textContent = "▲"; // 展開後顯示「可收合」
  }
});



// Initial side UI
buildSideUI();

// === Rule Editor UI Logic ===
function setupRuleEditor() {
  const modal = document.getElementById('rulesModal');
  const btnOpen = document.getElementById('openRulesBtn');
  const btnClose = document.getElementById('closeRulesBtn');
  const btnSave = document.getElementById('saveRulesBtn');
  const btnAdd = document.getElementById('addRuleBtn');
  const rulesContainer = document.getElementById('rulesContainer');
  const forbiddenInput = document.getElementById('forbiddenPinsInput');
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  if (!modal || !btnOpen) return;

  // 1. 開啟 Modal
  btnOpen.addEventListener('click', async () => {
    console.log("BtnOpen clicked");
    try {
      console.log("Loading rules...");
      await loadRules();
      console.log("Rules loaded. Rendering UI...");
      renderRulesUI();
      console.log("UI Rendered. Showing modal...");
      modal.hidden = false;
      // Force reflow
      void modal.offsetWidth;
      modal.style.opacity = '1';
      console.log("Modal shown.");
    } catch (err) {
      console.error("Error opening modal:", err);
      alert("Error: " + err);
    }
  });

  // 2. 關閉 Modal
  const close = () => {
    modal.style.opacity = 0;
    setTimeout(() => { modal.hidden = true; }, 300);
  };
  btnClose.addEventListener('click', close);

  // 3. Tab 切換
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      panels.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById(t.dataset.tab).classList.add('active');
    });
  });

  // 4. Render UI
  function renderRulesUI() {
    forbiddenInput.value = FORBIDDEN_PINS.join(", ");
    rulesContainer.innerHTML = '';

    VALIDATION_RULES.forEach((rule, idx) => {
      const card = document.createElement('div');
      card.className = 'rule-card';

      const patStr = rule.allowed_patterns ? rule.allowed_patterns.join(", ") : "";
      const pinsStr = rule.pins ? rule.pins.join(", ") : "";

      card.innerHTML = `
        <div class="rule-header">
           <div class="rule-title">
             <span class="badge ${rule.color}">${rule.description || 'Custom Rule'}</span>
           </div>
           <div class="rule-controls">
             <button class="btn-sm btn-delete" data-idx="${idx}">刪除</button>
           </div>
        </div>
        <div class="grid-2" style="grid-template-columns: 1fr 2fr;">
           <label>群組描述</label>
           <input type="text" class="rule-desc" value="${rule.description || ''}" placeholder="例如: VDD Check">
           
           <label>顏色</label>
           <select class="rule-color">
             <option value="pink" ${rule.color === 'pink' ? 'selected' : ''}>粉紅 (Power)</option>
             <option value="green" ${rule.color === 'green' ? 'selected' : ''}>綠色 (Ground)</option>
             <option value="blue" ${rule.color === 'blue' ? 'selected' : ''}>藍色 (Signal)</option>
           </select>

           <label>適用腳位 (逗號分隔)</label>
           <input type="text" class="rule-pins" value="${pinsStr}" placeholder="例如: 87, 92">

           <label>允許模式 (Regex)</label>
           <input type="text" class="rule-pats" value="${patStr}" placeholder="例如: ^VDDP$">
        </div>
      `;
      rulesContainer.appendChild(card);
    });

    // 綁定刪除按鈕
    cardDeleteBind();
  }

  function cardDeleteBind() {
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.idx;
        VALIDATION_RULES.splice(idx, 1);
        renderRulesUI();
      });
    });
  }

  // 5. Add New Rule
  btnAdd.addEventListener('click', () => {
    VALIDATION_RULES.unshift({
      id: "new_rule_" + Date.now(),
      pins: [],
      allowed_patterns: [],
      color: "blue",
      description: "New Rule"
    });
    renderRulesUI();
  });

  // 6. Save
  btnSave.addEventListener('click', async () => {
    // Collect Data
    const newRules = [];
    document.querySelectorAll('.rule-card').forEach(card => {
      const desc = card.querySelector('.rule-desc').value.trim();
      const color = card.querySelector('.rule-color').value;
      const pinsRaw = card.querySelector('.rule-pins').value;
      const patsRaw = card.querySelector('.rule-pats').value;

      const pins = pinsRaw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      const pats = patsRaw.split(/[,，]/).map(s => s.trim()).filter(Boolean);

      newRules.push({
        id: "rule_" + Math.random().toString(36).substr(2, 9),
        pins: pins,
        allowed_patterns: pats,
        color: color,
        description: desc
      });
    });

    const fbRaw = forbiddenInput.value;
    const fb = fbRaw.split(/[,，]/).map(s => s.trim()).filter(Boolean);

    const payload = {
      rules: newRules,
      forbidden_pins: fb
    };

    try {
      const r = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        alert("規則除存成功！");
        VALIDATION_RULES = newRules;
        FORBIDDEN_PINS = fb;
        close();
        // 若已有載入資料，重新套用顏色
        applyInputColors();
      } else {
        alert("儲存失敗");
      }
    } catch (e) {
      console.error(e);
      alert("儲存錯誤: " + e);
    }
  });
}

// 啟動編輯器邏輯
document.addEventListener("DOMContentLoaded", () => {
  setupRuleEditor();
});
