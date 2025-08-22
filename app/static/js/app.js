// ====== Constants ======
const leftLabels  = ["A","B","2","3","6","7","8","9","11","14","15","17","18","19","22","23","24","25","28","C","D"];
const rightLabels = ["J","I","79","77","75","74","73","72","69","68","65","63","61","60","59","58","57","56","53","H","G"];
const topLabels   = ["P","O","N","96","95","94","93","92","91","87","85","83","81","M","L","K"];
const bottomLabels= ["E","31","32","33","35","36","37","40","41","44","45","46","47","49","50","F"];

// === Drawing size constants ===
const PIN_DOT_RADIUS = 2;   // 紅點跟藍點的大小，原本是 4，改小點
const PIN_LINE_WIDTH = 1.5; // 連線大小，原本是 2

// === Label layout knobs ===
const STEP_V = 33;     // 垂直間距
const STEP_H = 33;     // 水平間距

const LEFT_LABEL_X  = 10, LEFT_INPUT_X  = 35,  LEFT_Y0  = 125;  //左排：把 LEFT_INPUT_X 往左移（數值變小）或 LEFT_LABEL_X 往右移（數值變大）。
const RIGHT_LABEL_X = 735, RIGHT_INPUT_X = 655, RIGHT_Y0 = 125;  //右排：把 RIGHT_INPUT_X 往右移（變大）或 RIGHT_LABEL_X 往左移（變小）。

const TOP_LABEL_Y   = 10,  TOP_INPUT_Y   = 35,  TOP_X0   = 125;  //頂/底排：微調 TOP_INPUT_Y / BOTTOM_INPUT_Y
const BOTTOM_LABEL_Y= 895, BOTTOM_INPUT_Y= 815, BOTTOM_X0= 125;  //（通常 +2~+6 px 就會離開 label），或微調 TOP_X0 / BOTTOM_X0 讓整排左右位移。

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
let MINMAX_OFFSET = { left:0, right:0, top:0, bottom:0 };
// 例：若圖片四邊各有 ~3px 留白，可改成 {left:3, right:3, top:3, bottom:3}


// 位置函式
function posLeftLabel(i){  return { x: LEFT_LABEL_X,  y: LEFT_Y0  + i*STEP_V }; }
function posLeftInput(i){  return { x: LEFT_INPUT_X,  y: LEFT_Y0  + i*STEP_V }; }
function posRightLabel(i){ return { x: RIGHT_LABEL_X, y: RIGHT_Y0 + i*STEP_V }; }
function posRightInput(i){ return { x: RIGHT_INPUT_X, y: RIGHT_Y0 + i*STEP_V }; }
function posTopLabel(i){   return { x: TOP_X0   + i*STEP_H, y: TOP_LABEL_Y   }; }
function posTopInput(i){   return { x: TOP_X0+25+ i*STEP_H, y: TOP_INPUT_Y, rotate:true }; }
function posBottomLabel(i){return { x: BOTTOM_X0+ i*STEP_H, y: BOTTOM_LABEL_Y }; }
function posBottomInput(i){return { x: BOTTOM_X0+25+ i*STEP_H, y: BOTTOM_INPUT_Y, rotate:true }; }

const stage = document.getElementById("stage");
const overlay = document.getElementById("overlay");
const chipImage = document.getElementById("chipImage");

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const invalidEl = document.getElementById("invalidPins");
const projectCodeEl = document.getElementById("projectCode");

const chipWidthEl = document.getElementById("chipWidth");
const chipHeightEl = document.getElementById("chipHeight");

const sheetSelector = document.getElementById("sheetSelector");

const zoomRange = document.getElementById("zoomRange");
const zoomVal = document.getElementById("zoomVal");

const dataControls = document.getElementById("dataControls");
const hideDataControls   = () => dataControls?.setAttribute("hidden", "");
const revealDataControls = () => dataControls?.removeAttribute("hidden");

// 載入資料按鈕（僅控制這顆，不動 hideDataControls）
const loadDataBtn = document.getElementById("loadDataBtn");
// 專用：隱藏/顯示載入按鈕（同時設 disabled，避免被鍵盤觸發）
const hideLoadBtn   = () => { loadDataBtn?.setAttribute("hidden",""); loadDataBtn.disabled = true;  };
const revealLoadBtn = () => { loadDataBtn?.removeAttribute("hidden");  loadDataBtn.disabled = false; };

const stageWrapper = document.getElementById("stageWrapper"); // 平移手勢掛在外層容器


let SESSION_ID = null;
let DISPLAY_SCALE = 1.0;
let MIN_POINT = null; // {x,y}
let MAX_POINT = null; // {x,y}

let VALID_PINS = []; // {pin_no, pin_name, x, y}
let INVALID_PINS = [];
let CURRENT_SHEET_REQ = 0; // === Sheet 切換請求序號：只採用最後一次回應，避免瞬閃 ===

const inputsByLabel = new Map(); // label string -> input element
const labelDivsByLabel = new Map(); // label string -> label element

// ====== Helpers ======
function setStatus(msg){ statusEl.textContent = msg; }
function setError(msg){ errorEl.textContent = msg || ""; }
function nowTime(){
  const dt = new Date();
  const pad = (n)=> n.toString().padStart(2,"0");
  return `${dt.getFullYear()}/${pad(dt.getMonth()+1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
document.getElementById("nowtime").textContent = nowTime();

function sanitizeNumberInput(el){
  el.addEventListener("input", () => {
    let txt = el.value.replace(/[^0-9.]/g, "");
    const parts = txt.split(".");
    if(parts.length > 2){
      txt = parts[0] + "." + parts.slice(1).join("");
    }
    el.value = txt;
  });
}

// === 驗證/紅框控制（只在「載入錯誤」時才加紅框） ===
// 判斷 chip 寬/高欄位是否都有有效數值
function hasChipSizeValues(){
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
function markChipSizeInvalid(show, reason = ""){
  [chipWidthEl, chipHeightEl].forEach(el=>{
    if(!el) return;
    el.classList.toggle('is-invalid', !!show);
    if(show){ el.title = reason || "載入錯誤"; } else { el.removeAttribute('title'); }
  });
}


function resetChipSizeUI(){
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
function buildSideUI(){
  // Cleanup previous
  stage.querySelectorAll(".pin-label, .pin-input, .pin-box").forEach(n => n.remove());

  // Left
  leftLabels.forEach((lab,i)=>{
    const L = posLeftLabel(i), I = posLeftInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-left";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
    // highlight special
    if(["17","18","19","22"].includes(lab)) div.classList.add("bg-blue");
	if(["9"].includes(lab)) div.classList.add("bg-pink");
	if(["11"].includes(lab)) div.classList.add("bg-green");
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
    box.style.top  = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
  });

  // Right
  rightLabels.forEach((lab,i)=>{
    const L = posRightLabel(i), I = posRightInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-right";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
    if(["56","57","58","59"].includes(lab)) div.classList.add("bg-blue");
	if(["61"].includes(lab)) div.classList.add("bg-pink");
	if(["60"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    const box = document.createElement("div");
    box.className = "pin-box side-right";
    box.style.left = I.x + "px";
	box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
  });

  // Top
  topLabels.forEach((lab,i)=>{
    const L = posTopLabel(i), I = posTopInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-top";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
	if(["87","92"].includes(lab)) div.classList.add("bg-pink");
	if(["91"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    const box = document.createElement("div");
    box.className = "pin-box rotate90 side-top";
    box.style.left = I.x + "px";
	box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
  });

  // Bottom
  bottomLabels.forEach((lab,i)=>{
    const L = posBottomLabel(i), I = posBottomInput(i);
    const div = document.createElement("div");
    div.className = "pin-label side-bottom";
    div.style.left = L.x + "px"; div.style.top = L.y + "px";
    div.textContent = lab;
	if(["41"].includes(lab)) div.classList.add("bg-pink");
	if(["40"].includes(lab)) div.classList.add("bg-green");
    stage.appendChild(div);
    labelDivsByLabel.set(lab, div);

    const box = document.createElement("div");
    box.className = "pin-box rotate90 side-bottom";
    box.style.left = I.x + "px";
	box.style.top = I.y + "px";
    stage.appendChild(box);
    inputsByLabel.set(lab, box);
  });
}

// === 當 chip size 缺漏時，統一清乾淨畫面 ===
function clearImageAndState(){
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
  invalidEl.textContent = "";
  // chip 尺寸欄位與圖片尺寸歸零（保險）
  // 清空 Project Code（一起清掉舊專案代碼顯示）
  projectCodeEl.textContent = "";
  hideDataControls();
  hideLoadBtn(); // 註解：清畫面時一併把「載入資料」按鈕隱藏，避免殘留
}

// 取得元素在「stage 原始座標」的外框（會把縮放/平移還原）
function getStageRect(el) {
  const lb = el.getBoundingClientRect();
  const st = stage.getBoundingClientRect();
  return {
    left:   (lb.left   - st.left) / DISPLAY_SCALE,
    top:    (lb.top    - st.top ) / DISPLAY_SCALE,
    right:  (lb.right  - st.left) / DISPLAY_SCALE,
    bottom: (lb.bottom - st.top ) / DISPLAY_SCALE,
  };
}

// 量到四側 pin-box 內側的矩形（左=左排右緣、右=右排左緣、上=頂排下緣、下=底排上緣）
function measureInnerPinFrame(){
  const Ls = stage.querySelectorAll('.pin-box.side-left');
  const Rs = stage.querySelectorAll('.pin-box.side-right');
  const Ts = stage.querySelectorAll('.pin-box.side-top');
  const Bs = stage.querySelectorAll('.pin-box.side-bottom');
  if(!Ls.length || !Rs.length || !Ts.length || !Bs.length) return null;

  let leftEdge = -Infinity, rightEdge = Infinity, topEdge = -Infinity, bottomEdge = Infinity;
  Ls.forEach(b => { const r = getStageRect(b); leftEdge  = Math.max(leftEdge,  r.right); });
  Rs.forEach(b => { const r = getStageRect(b); rightEdge = Math.min(rightEdge, r.left ); });
  Ts.forEach(b => { const r = getStageRect(b); topEdge   = Math.max(topEdge,   r.bottom); });
  Bs.forEach(b => { const r = getStageRect(b); bottomEdge= Math.min(bottomEdge,r.top   ); });

  if(!(isFinite(leftEdge)&&isFinite(rightEdge)&&isFinite(topEdge)&&isFinite(bottomEdge))) return null;
  return { x: leftEdge, y: topEdge, w: rightEdge - leftEdge, h: bottomEdge - topEdge };
}

// 依內框置中 chip 圖
function centerChipImageInInnerFrame(){
  const frame = measureInnerPinFrame();
  if(!frame) return;
  const chipW = parseFloat(chipImage.style.width)  || chipImage.width  || 0;
  const chipH = parseFloat(chipImage.style.height) || chipImage.height || 0;
  if(!chipW || !chipH) return;

  chipImage.style.left = `${frame.x + (frame.w - chipW)/2}px`;
  chipImage.style.top  = `${frame.y + (frame.h - chipH)/2}px`;
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
function clearOverlay(){
  while(overlay.firstChild) overlay.removeChild(overlay.firstChild);
}
function drawCircle(x,y,r,color="#f00", tag=null){
  const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
  c.setAttribute("cx", x); c.setAttribute("cy", y);
  c.setAttribute("r", r); c.setAttribute("fill", color);
  if(tag) c.dataset.tag = tag;
  overlay.appendChild(c);
}
function drawText(x,y,txt,color="#00f"){
  const t = document.createElementNS("http://www.w3.org/2000/svg","text");
  t.setAttribute("x", x); t.setAttribute("y", y);
  t.setAttribute("fill", color);
  t.setAttribute("font-size","8");
  t.textContent = txt;
  overlay.appendChild(t);
}
function drawLine(x1,y1,x2,y2,color="#f00", width=2, tag=null){
  const l = document.createElementNS("http://www.w3.org/2000/svg","line");
  l.setAttribute("x1", x1); l.setAttribute("y1", y1);
  l.setAttribute("x2", x2); l.setAttribute("y2", y2);
  l.setAttribute("stroke", color); l.setAttribute("stroke-width", width);
  if(tag) l.dataset.tag = tag;
  overlay.appendChild(l);
}

// ====== Geometry ======
function computeDisplayScale(chipW, chipH){
  // Align WPF: min(300/width, 600/height)
  if(!chipW || !chipH) return 1.0;
  const s = Math.min(300/Number(chipW), 600/Number(chipH));
  return s;
}

function imgRect(){
  const w = chipImage.naturalWidth ? chipImage.width : 0;
  const h = chipImage.naturalHeight ? chipImage.height : 0;
  const left = chipImage.offsetLeft;
  const top = chipImage.offsetTop;
  return {left, top, right:left+w, bottom: top+h, width:w, height:h};
}

// 依圖片邊界自動設定 MIN/MAX：MIN=左下角、MAX=右上角
function setMinMaxToImage() {
  const r = imgRect();
  if (!r.width || !r.height) return false;

  const off = MINMAX_OFFSET;
  MIN_POINT = { x: r.left  + off.left,  y: r.bottom - off.bottom }; // 左下往內縮
  MAX_POINT = { x: r.right - off.right, y: r.top    + off.top    }; // 右上往內縮
  return true;
}



function chipToStage(x_um, y_um, chipW, chipH){
  // Using MIN (left-bottom) and MAX (right-top) in stage coords
  if(!MIN_POINT || !MAX_POINT) return null;
  const selW = Math.abs(MAX_POINT.x - MIN_POINT.x);
  const selH = Math.abs(MIN_POINT.y - MAX_POINT.y);
  const scaleX = selW / Number(chipW);
  const scaleY = selH / Number(chipH);
  const sx = MIN_POINT.x + x_um * scaleX;
  const sy = MIN_POINT.y - y_um * scaleY;
  return {x: sx, y: sy};
}

// ====== Color logic for inputs ======
function applyInputColors(){
  inputsByLabel.forEach((el)=>{
//-   const val = (el.value || "").trim();
    const val = (el.textContent || "").trim();
    el.classList.remove("bg-gray","bg-green","bg-pink","bg-blue");
    if(!val) el.classList.add("bg-gray");
    else if(val.includes("VSS")) el.classList.add("bg-green");
    else if(val.includes("VDD") || val.includes("VDP")) el.classList.add("bg-pink");
    else if(val.toUpperCase().includes("Q")) el.classList.add("bg-blue");
  });
}


// ====== Wiring pins to labels ======
function processPinDataToInputs(){
  // 先建立一個新的陣列，存真正有效的 pin
  const trulyValid = [];

  VALID_PINS.forEach(p => {
    const el = inputsByLabel.get(p.pin_no);
    if(el){
      // 如果有對應的 label 才算是有效 PIN
      el.textContent = p.pin_name || "";
      trulyValid.push(p);
    }else{
      // 沒有 label 的就丟到 INVALID_PINS
      const msg = `${p.pin_no}, ${p.pin_name}`;
      if(!INVALID_PINS.includes(msg)) INVALID_PINS.push(msg);
    }
  });

  // 更新 VALID_PINS，只留下真的有對應 label 的 pin
  VALID_PINS = trulyValid;

  applyInputColors();
  invalidEl.textContent = INVALID_PINS.join("\n");

  // 額外輸出方便 debug
  console.log("真正有效的 pins:", VALID_PINS.map(p=>p.pin_no));
  console.log("被扣掉的 pins:", INVALID_PINS);
}



// 根據 side-* 類別，回傳 .pin-box 在「stage 座標」中的內側邊緣中點
function innerAnchorOfBox(boxEl) {
  const lb = boxEl.getBoundingClientRect();        // 盒子在視窗的實際位置（含 rotate/scale）
  const st = stage.getBoundingClientRect();        // stage 在視窗的位置
  const toStageX = (vx) => (vx - st.left) / DISPLAY_SCALE;
  const toStageY = (vy) => (vy - st.top ) / DISPLAY_SCALE;

  // 內側：指向 chip 的那一邊
  if (boxEl.classList.contains("side-left")) {
    // 右邊緣中點
    return { x: toStageX(lb.right), y: toStageY(lb.top + lb.height/2) };
  }
  if (boxEl.classList.contains("side-right")) {
    // 左邊緣中點
    return { x: toStageX(lb.left),  y: toStageY(lb.top + lb.height/2) };
  }
  if (boxEl.classList.contains("side-top")) {
    // 下邊緣中點（rotate90 也會正確）
    return { x: toStageX(lb.left + lb.width/2), y: toStageY(lb.bottom) };
  }
  if (boxEl.classList.contains("side-bottom")) {
    // 上邊緣中點
    return { x: toStageX(lb.left + lb.width/2), y: toStageY(lb.top) };
  }
  // fallback: 中心點
  return { x: toStageX(lb.left + lb.width/2), y: toStageY(lb.top + lb.height/2) };
}


// ====== Draw pins and lines ======
function drawPinsAndLines(){
  clearOverlay();
  // draw MIN/MAX (藍點)
  if(MIN_POINT){ drawCircle(MIN_POINT.x, MIN_POINT.y, PIN_DOT_RADIUS, "#00f"); drawText(MIN_POINT.x+5, MIN_POINT.y-5, "MIN","#00f"); }
  if(MAX_POINT){ drawCircle(MAX_POINT.x, MAX_POINT.y, PIN_DOT_RADIUS, "#00f"); drawText(MAX_POINT.x-20, MAX_POINT.y+10, "MAX","#00f"); }

  const chipW = Number(chipWidthEl.value), chipH = Number(chipHeightEl.value);
  if(!chipW || !chipH || !MIN_POINT || !MAX_POINT) return;

  VALID_PINS.forEach(p => {
    const pt = chipToStage(p.x, p.y, chipW, chipH);
    if(!pt) return;
    drawCircle(pt.x, pt.y, PIN_DOT_RADIUS, "#f00", `PIN_${p.pin_no}`);

    // 以「pin 盒子 .pin-box」為對象，連到內側邊緣
    const boxEl = inputsByLabel.get(p.pin_no);
    if (boxEl) {
      const anchor = innerAnchorOfBox(boxEl); // 內側錨點
      drawLine(pt.x, pt.y, anchor.x, anchor.y, "#f00", PIN_LINE_WIDTH, `LINE_${p.pin_no}`);
    
      // （可選）讓對應的標籤加粗
      const labelDiv = labelDivsByLabel.get(p.pin_no);
      if (labelDiv) labelDiv.style.fontWeight = "700";
    }

  });
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

// ====== Event wiring ======
document.getElementById("excelFile").addEventListener("change", async (e)=>{
  const f = e.target.files[0];
  if(!f){ return; }
  setError("");
  hideLoadBtn();           // 換新檔 → 先把載入資料按鈕藏起來
  // 先清空圖片，再清空 chip 欄位（避免先清欄位造成瞬間閃爍）
  clearImageAndState();
  setStatus("上傳中...");
  hideDataControls();
  const fd = new FormData();
  fd.append("file", f);
  const res = await fetch("/upload", { method:"POST", body: fd });
  if(!res.ok){ setError("上傳失敗"); console.error("Upload failed", res.status, await res.text()); return; }
  const data = await res.json();
  if(data.error){ setError(data.error); console.error("Server error:", data.error); return; }
  SESSION_ID = data.session_id;
  setStatus("已選擇檔案: " + f.name);

  // 只填入「有圖的工作表」
  sheetSelector.innerHTML = "";
  (data.sheets || []).forEach(name=>{
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sheetSelector.appendChild(opt);
  });

//  // handle no sheets
//  if(!sheetSelector.options.length){
//    setError("沒有偵測到有效工作表，已列出為空。\n請確認：\n1) 試著切換到有資料的工作表再存檔再上傳\n2) 或把範例檔給我，我會調整偵測規則");
//  }
//  // set image (if any)
//  if(data.image_url){
//    chipImage.src = data.image_url;
//  }else{
//    chipImage.removeAttribute("src");
//  }

  // 若沒有任何含圖的工作表 → 顯示提示並維持空畫面
  if(!sheetSelector.options.length){
    setError("這個檔案內沒有任何『含圖片』的工作表：\n請在 Excel 中插入圖片（插入→圖片），存檔後再上傳。");
    chipImage.removeAttribute("src");
    chipImage.classList.remove("loaded");
    return;
  }
  //註解:避免在還不知道 chip size 時就先顯示圖片（會被下一步清掉而閃一下）
  // 初始：顯示第一個有圖工作表的「最大張」圖片
  //if (data.default_image_url) {
  //  chipImage.classList.remove('loaded');
  //  chipImage.src = data.default_image_url;
  //} else {
  //  chipImage.removeAttribute("src");
  //  chipImage.classList.remove("loaded");
  //}

  // auto query sheet info
  if(sheetSelector.value){
    await querySheetInfo();
  }
});

sheetSelector.addEventListener("change", querySheetInfo);

async function querySheetInfo(){
  hideDataControls();
  hideLoadBtn();           // 註解：切表當下先把載入按鈕藏起來
  
  if(!SESSION_ID || !sheetSelector.value) return;
  setError("");
  
  // ★ 這次查詢的序號（只用最後一次的結果）
  const token = ++CURRENT_SHEET_REQ;
  
  const fd = new FormData();
  fd.append("session_id", SESSION_ID);
  fd.append("sheet_name", sheetSelector.value);
  fd.append("chip_size_cell", document.getElementById("chipCell").value || "C3");
  fd.append("project_code_cell", document.getElementById("projectCell").value || "C2");
  const res = await fetch("/sheet_info", { method:"POST", body: fd });
  const data = await res.json();
  
  // 若這不是最後一次請求的回應 → 丟棄，避免舊回應覆蓋新狀態
  if (token !== CURRENT_SHEET_REQ) return;
  if (data.error){ setError(data.error); return; }

    // === 依 chip size 是否有值，決定是否載入圖片 ===
    const w = Number(data?.chip_size?.width)  || 0;
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
      chipWidthEl.value  = w.toFixed(3);
      chipHeightEl.value = h.toFixed(3);
	  markChipSizeInvalid(false);
	  
      const sz = sizeFromChipUm(w, h);
      chipImage.style.width  = sz.w + "px";
      chipImage.style.height = sz.h + "px";
      if (data.image_url) {
      chipImage.classList.remove('loaded');  // 成功後由 load 事件顯示 & 開啟按鈕
      chipImage.removeAttribute('src');      // 先取消舊請求，降低競態
      chipImage.dataset.req = String(token); // 標記此圖對應的請求序號
      chipImage.src = data.image_url;        // 交給瀏覽器載入
      } else {
        // 找不到圖 → 視為載入錯誤，才加紅框
        clearImageAndState();
        setError("此工作表未找到可用圖片。");
        markChipSizeInvalid(true, "此工作表未找到可用圖片");
        return; // 這裡直接結束，避免後面流程繼續
      }
    }
  projectCodeEl.textContent = data.project_code || "";

  // rebuild UI (labels/inputs), clear overlay & pins
  buildSideUI();
  // 依四側 pin-box 內側框置中 chip 圖
  // 置中僅在有圖時才做，避免做多餘動作
  if (hasChipSize && data.image_url) {
    centerChipImageInInnerFrame();
    clearOverlay(); MIN_POINT = null; MAX_POINT = null;
    VALID_PINS = []; INVALID_PINS = [];
    invalidEl.textContent = "";
    setStatus("已載入：最大張圖片與 chip size；可直接按「2. 載入資料」");
  }
}

document.getElementById("loadDataBtn").addEventListener("click", async ()=>{
  if(!SESSION_ID || !sheetSelector.value){ setError("請先選擇檔案與工作表"); return; }
  
  if(!chipWidthEl.value || !chipHeightEl.value){
   setError("本工作表缺少 chip size（寬/高），已略過載入。請先於 Excel 指定儲存格填入 chip size（寬/高）。");
   return;
  }
  
  setError("");
  const fd = new FormData();
  fd.append("session_id", SESSION_ID);
  fd.append("sheet_name", sheetSelector.value);
  fd.append("pin_no_col", document.getElementById("pinNoCol").value || "B");
  fd.append("pin_name_col", document.getElementById("pinNameCol").value || "C");
  fd.append("x_col", document.getElementById("xCol").value || "D");
  fd.append("y_col", document.getElementById("yCol").value || "E");
  fd.append("start_row", document.getElementById("startRow").value || "8");
  const res = await fetch("/parse_pins", { method:"POST", body: fd });
  const data = await res.json();
  if(data.error){ setError(data.error); return; }
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

function applyZoom(z){
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
let isPanning   = false;
let panStart = { x:0, y:0 };      // 滑鼠按下座標（視窗座標）
let panOrigin = { x:0, y:0 };     // 當下 PAN_X/Y

// 工具：判斷是否在輸入控件上（避免擋住輸入空白）
function inEditable(el){
  return el && (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}

window.addEventListener('keydown', (e)=>{
  if ((e.code === 'Space' || e.key === ' ') && !inEditable(e.target)) {
    e.preventDefault(); // 避免空白鍵捲動頁面/觸發按鈕 click
    isSpaceDown = true;
    stageWrapper.classList.add('space-pan-ready'); // 換成「🖐 可拖動」游標
  }
});

window.addEventListener('keyup', (e)=>{
  if (e.code === 'Space' || e.key === ' ') {
    isSpaceDown = false;
    if (!isPanning) stageWrapper.classList.remove('space-pan-ready');
  }
});

// 只在畫布容器內支援拖曳
stageWrapper.addEventListener('mousedown', (e)=>{
  if (!isSpaceDown) return;
  e.preventDefault();
  isPanning = true;
  stageWrapper.classList.add('space-pan-active');
  panStart = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mousemove', (e)=>{
  if (!isPanning) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;

  const scroller = document.scrollingElement || document.documentElement;
  scroller.scrollLeft -= dx;   // ← 往滑鼠反方向捲動，視覺上就是「拖畫面」
  scroller.scrollTop  -= dy;

  panStart = { x: e.clientX, y: e.clientY }; // 基準改成目前位置
});


window.addEventListener('mouseup', ()=>{
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
// --- MIN/MAX OFFSET UI wiring ---
document.addEventListener('DOMContentLoaded', () => {
  const offsetAll   = document.getElementById('offsetAll');
  const offsetLink  = document.getElementById('offsetLink');
  const offsetTop   = document.getElementById('offsetTop');
  const offsetRight = document.getElementById('offsetRight');
  const offsetBottom= document.getElementById('offsetBottom');
  const offsetLeft  = document.getElementById('offsetLeft');
  const offsetReset = document.getElementById('offsetReset');

  const vAll   = document.getElementById('offsetAllValue');
  const vTop   = document.getElementById('offsetTopValue');
  const vRight = document.getElementById('offsetRightValue');
  const vBottom= document.getElementById('offsetBottomValue');
  const vLeft  = document.getElementById('offsetLeftValue');
  const grid   = document.getElementById('offsetGrid');

  function loadOffset() {
    try {
      const s = localStorage.getItem('minmax_offset');
      if (!s) return;
      const o = JSON.parse(s);
      ['left','right','top','bottom'].forEach(k=>{
        if (typeof o[k] === 'number') MINMAX_OFFSET[k] = o[k];
      });
    } catch(e){}
  }

  function saveOffset() {
    localStorage.setItem('minmax_offset', JSON.stringify(MINMAX_OFFSET));
  }

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

    offsetTop.value    = MINMAX_OFFSET.top;
    offsetRight.value  = MINMAX_OFFSET.right;
    offsetBottom.value = MINMAX_OFFSET.bottom;
    offsetLeft.value   = MINMAX_OFFSET.left;

    vAll.textContent    = offsetAll.value;
    vTop.textContent    = offsetTop.value;
    vRight.textContent  = offsetRight.value;
    vBottom.textContent = offsetBottom.value;
    vLeft.textContent   = offsetLeft.value;
  }

  function applyAndRedraw() {
    saveOffset();
    if (typeof setMinMaxToImage === 'function') setMinMaxToImage();
    if (typeof drawPinsAndLines  === 'function') drawPinsAndLines();
  }

  // listeners
  offsetAll?.addEventListener('input', e => {
    const v = +e.target.value;
    if (offsetLink.checked) {
      MINMAX_OFFSET = { left:v, right:v, top:v, bottom:v };
      syncUI();
      applyAndRedraw();
    }
    vAll.textContent = v;
  });

  [ ['offsetTop','top'], ['offsetRight','right'],
    ['offsetBottom','bottom'], ['offsetLeft','left']
  ].forEach(([id, key])=>{
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
      MINMAX_OFFSET = { left:v, right:v, top:v, bottom:v };
      syncUI();
      applyAndRedraw();
    } else {
      grid.style.display = 'grid';
    }
  });

  offsetReset?.addEventListener('click', () => {
    MINMAX_OFFSET = { left:0, right:0, top:0, bottom:0 };
    syncUI();
    applyAndRedraw();
  });

  // init
  loadOffset();
  syncUI();
  // 首次載入就套用一次（若你要等圖片載好再套，可以把這行移到 onload 後）
  applyAndRedraw();
  
  // === Shift + 滾輪：調整「邊界內縮」 ===
// 規則：
// 1) 有焦點的拉桿（上/右/下/左/全部）優先被調整
// 2) 沒有焦點：若「四邊連動」開啟 → 同步調整四邊；未連動 → 四邊同值微調
// 3) 每格步進 1px，範圍 0~30（與 UI 一致）
stageWrapper.addEventListener('wheel', (e) => {
  if (!e.shiftKey || e.ctrlKey) return;   // 只處理 Shift，避免和 Ctrl+滾輪縮放衝突
  e.preventDefault();

  const step = (e.deltaY < 0) ? +1 : -1;
  const clamp = (n)=> Math.max(0, Math.min(30, n));
  const ids = ['offsetAll','offsetTop','offsetRight','offsetBottom','offsetLeft'];

  const ae = document.activeElement;
  const focusedId = (ae && ids.includes(ae.id)) ? ae.id : null;

  if (focusedId && focusedId !== 'offsetAll') {
    if (focusedId === 'offsetTop')    MINMAX_OFFSET.top    = clamp(MINMAX_OFFSET.top    + step);
    if (focusedId === 'offsetRight')  MINMAX_OFFSET.right  = clamp(MINMAX_OFFSET.right  + step);
    if (focusedId === 'offsetBottom') MINMAX_OFFSET.bottom = clamp(MINMAX_OFFSET.bottom + step);
    if (focusedId === 'offsetLeft')   MINMAX_OFFSET.left   = clamp(MINMAX_OFFSET.left   + step);
  } else {
    if (offsetLink.checked) {
      const v = clamp(MINMAX_OFFSET.left + step);
      MINMAX_OFFSET = { left:v, right:v, top:v, bottom:v };
      offsetAll.value = v; // 同步主拉桿
    } else {
      MINMAX_OFFSET = {
        left:   clamp(MINMAX_OFFSET.left   + step),
        right:  clamp(MINMAX_OFFSET.right  + step),
        top:    clamp(MINMAX_OFFSET.top    + step),
        bottom: clamp(MINMAX_OFFSET.bottom + step),
      };
    }
  }
  syncUI();          // ← 這裡會同步數值膠囊(vAll/vTop/...)
  applyAndRedraw();  // ← 存 localStorage、重算 MIN/MAX、重畫 overlay
}, { passive:false });

});




// Initial side UI
buildSideUI();
