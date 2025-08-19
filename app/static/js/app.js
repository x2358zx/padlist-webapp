// ====== Constants ======
const leftLabels  = ["A","B","2","3","6","7","8","9","11","14","15","17","18","19","22","23","24","25","28","C","D"];
const rightLabels = ["J","I","79","77","75","74","73","72","69","68","65","63","61","60","59","58","57","56","53","H","G"];
const topLabels   = ["P","O","N","96","95","94","93","92","91","87","85","83","81","M","L","K"];
const bottomLabels= ["E","31","32","33","35","36","37","40","41","44","45","46","47","49","50","F"];

// === Drawing size constants ===
const PIN_DOT_RADIUS = 2;   // 紅點跟藍點的大小，原本是 4，改小點
const PIN_LINE_WIDTH = 1.5; // 連線大小，原本是 2

// === Label layout knobs ===
const STEP_V = 30;     // 垂直間距
const STEP_H = 30;     // 水平間距

const LEFT_LABEL_X  = 110, LEFT_INPUT_X  = 30,  LEFT_Y0  = 120;  //左排：把 LEFT_INPUT_X 往左移（數值變小）或 LEFT_LABEL_X 往右移（數值變大）。
const RIGHT_LABEL_X = 640, RIGHT_INPUT_X = 670, RIGHT_Y0 = 120;  //右排：把 RIGHT_INPUT_X 往右移（變大）或 RIGHT_LABEL_X 往左移（變小）。

const TOP_LABEL_Y   = 90,  TOP_INPUT_Y   = 10,  TOP_X0   = 155;  //頂/底排：微調 TOP_INPUT_Y / BOTTOM_INPUT_Y
const BOTTOM_LABEL_Y= 750, BOTTOM_INPUT_Y= 780, BOTTOM_X0= 155;  //（通常 +2~+6 px 就會離開 label），或微調 TOP_X0 / BOTTOM_X0 讓整排左右位移。

// === Pixel per micrometer (px/um) 依你的要求 ===
// 630 px ↔ 7 mm = 7000 um → 0.09 px/um（垂直）
// 480 px ↔ 5 mm = 5000 um → 0.096 px/um（水平）
const PX_PER_UM_Y = 630 / 7000;  // 0.09
const PX_PER_UM_X = 480 / 5000;  // 0.096

// 把 chip 尺寸(um) 轉成 畫面像素(px)
function sizeFromChipUm(w_um, h_um) {
  const wpx = Number(w_um) * PX_PER_UM_X;
  const hpx = Number(h_um) * PX_PER_UM_Y;
  return { w: wpx, h: hpx };
}

// 位置函式
function posLeftLabel(i){  return { x: LEFT_LABEL_X,  y: LEFT_Y0  + i*STEP_V }; }
function posLeftInput(i){  return { x: LEFT_INPUT_X,  y: LEFT_Y0  + i*STEP_V }; }
function posRightLabel(i){ return { x: RIGHT_LABEL_X, y: RIGHT_Y0 + i*STEP_V }; }
function posRightInput(i){ return { x: RIGHT_INPUT_X, y: RIGHT_Y0 + i*STEP_V }; }
function posTopLabel(i){   return { x: TOP_X0   + i*STEP_H, y: TOP_LABEL_Y   }; }
function posTopInput(i){   return { x: TOP_X0+20+ i*STEP_H, y: TOP_INPUT_Y, rotate:true }; }
function posBottomLabel(i){return { x: BOTTOM_X0+ i*STEP_H, y: BOTTOM_LABEL_Y }; }
function posBottomInput(i){return { x: BOTTOM_X0+20+ i*STEP_H, y: BOTTOM_INPUT_Y, rotate:true }; }

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

let SESSION_ID = null;
let DISPLAY_SCALE = 1.0;
let MIN_POINT = null; // {x,y}
let MAX_POINT = null; // {x,y}

let VALID_PINS = []; // {pin_no, pin_name, x, y}
let INVALID_PINS = [];

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

// 讓圖片成功載入才顯示；失敗就維持隱藏
chipImage.addEventListener('load', () => {
  chipImage.classList.add('loaded');
});
chipImage.addEventListener('error', () => {
  chipImage.classList.remove('loaded');   // 保持隱藏
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
  t.setAttribute("font-size","12");
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
  const r = imgRect();                   // {left, top, right, bottom, width, height}
  if (!r.width || !r.height) return false;
  MIN_POINT = { x: r.left,  y: r.bottom }; // 左下
  MAX_POINT = { x: r.right, y: r.top    }; // 右上
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
  VALID_PINS.forEach(p => {
    const el = inputsByLabel.get(p.pin_no);
    if(el){
//-     el.value = p.pin_name;
      el.textContent = p.pin_name || "";
    }else{
      const msg = `${p.pin_no}, ${p.pin_name}`;
      if(!INVALID_PINS.includes(msg)) INVALID_PINS.push(msg);
    }
  });
  applyInputColors();
  invalidEl.textContent = INVALID_PINS.join("\n");
}

// ====== Draw pins and lines ======
function drawPinsAndLines(){
  clearOverlay();
  // draw MIN/MAX (藍點)
  if(MIN_POINT){ drawCircle(MIN_POINT.x, MIN_POINT.y, PIN_DOT_RADIUS, "#00f"); drawText(MIN_POINT.x+10, MIN_POINT.y-10, "MIN","#00f"); }
  if(MAX_POINT){ drawCircle(MAX_POINT.x, MAX_POINT.y, PIN_DOT_RADIUS, "#00f"); drawText(MAX_POINT.x-10, MAX_POINT.y+10, "MAX","#00f"); }

  const chipW = Number(chipWidthEl.value), chipH = Number(chipHeightEl.value);
  if(!chipW || !chipH || !MIN_POINT || !MAX_POINT) return;

  VALID_PINS.forEach(p => {
    const pt = chipToStage(p.x, p.y, chipW, chipH);
    if(!pt) return;
    drawCircle(pt.x, pt.y, PIN_DOT_RADIUS, "#f00", `PIN_${p.pin_no}`);

    // Connect to label center (inside stage)
    const labelDiv = labelDivsByLabel.get(p.pin_no);
    if(labelDiv){
      const rect = { x: labelDiv.offsetLeft, y: labelDiv.offsetTop, w: labelDiv.offsetWidth, h: labelDiv.offsetHeight };
      const cx = rect.x + rect.w/2;
      const cy = rect.y + rect.h/2;
      drawLine(pt.x, pt.y, cx, cy, "#f00", PIN_LINE_WIDTH, `LINE_${p.pin_no}`);

      // Bold effect via CSS? quick: make font-weight bold
      labelDiv.style.fontWeight = "700";
    }
  });
}

// === 用 html2canvas 把 #stage 直接截圖（所見即所得） ===
// 為了避免 <input> 的 baseline 偏移，截圖時用 clone，把 .pin-input 改成 .pin-box
async function renderStageCanvas() {
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
  setStatus("上傳中...");
  const fd = new FormData();
  fd.append("file", f);
  const res = await fetch("/upload", { method:"POST", body: fd });
  if(!res.ok){ setError("上傳失敗"); console.error("Upload failed", res.status, await res.text()); return; }
  const data = await res.json();
  if(data.error){ setError(data.error); console.error("Server error:", data.error); return; }
  SESSION_ID = data.session_id;
  setStatus("已選擇檔案: " + f.name);

  // fill sheets
  sheetSelector.innerHTML = "";
  (data.sheets || []).forEach(name=>{
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    sheetSelector.appendChild(opt);
  });


  // handle no sheets
  if(!sheetSelector.options.length){
    setError("沒有偵測到有效工作表，已列出為空。\n請確認：\n1) 試著切換到有資料的工作表再存檔再上傳\n2) 或把範例檔給我，我會調整偵測規則");
  }
  // set image (if any)
  if(data.image_url){
    chipImage.src = data.image_url;
  }else{
    chipImage.removeAttribute("src");
  }

  // auto query sheet info
  if(sheetSelector.value){
    await querySheetInfo();
  }
});

sheetSelector.addEventListener("change", querySheetInfo);

async function querySheetInfo(){
  if(!SESSION_ID || !sheetSelector.value) return;
  setError("");
  const fd = new FormData();
  fd.append("session_id", SESSION_ID);
  fd.append("sheet_name", sheetSelector.value);
  fd.append("chip_size_cell", document.getElementById("chipCell").value || "C3");
  fd.append("project_code_cell", document.getElementById("projectCell").value || "C2");
  const res = await fetch("/sheet_info", { method:"POST", body: fd });
  const data = await res.json();
  if(data.error){ setError(data.error); return; }
  if (data.chip_size && data.chip_size.width && data.chip_size.height) {
    chipWidthEl.value  = Number(data.chip_size.width).toFixed(3);  // um
    chipHeightEl.value = Number(data.chip_size.height).toFixed(3); // um
  
    // 依 630px/7mm 與 480px/5mm 直接換算
    const sz = sizeFromChipUm(data.chip_size.width, data.chip_size.height);
    chipImage.style.width  = sz.w + "px";
    chipImage.style.height = sz.h + "px";
  
    // 置中到 800×900 的 stage
    const cw = sz.w, ch = sz.h;
    chipImage.style.left = ((800 - cw) / 2) + "px";
    chipImage.style.top  = ((900 - ch) / 2) + "px";
  }

  if(data.image_url){
	chipImage.classList.remove('loaded'); // 先移除，等 load 事件再顯示
    chipImage.src = data.image_url;       // 交給瀏覽器載入
  }else{
    chipImage.removeAttribute('src');
    chipImage.classList.remove('loaded'); // 保持隱藏，就不會出現「chip」字
  }
  projectCodeEl.textContent = data.project_code || "";

  // rebuild UI (labels/inputs), clear overlay & pins
  buildSideUI();
  clearOverlay(); MIN_POINT = null; MAX_POINT = null;
  VALID_PINS = []; INVALID_PINS = [];
  invalidEl.textContent = "";
  setStatus("工作表已載入，請確認 Chip Size 或直接按「2. 載入資料」");
}

document.getElementById("loadDataBtn").addEventListener("click", async ()=>{
  if(!SESSION_ID || !sheetSelector.value){ setError("請先選擇檔案與工作表"); return; }
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
});

// MIN/MAX selection
//let activeSelect = null; // "min" | "max" | null
//document.getElementById("btnMin").addEventListener("click", ()=>{
//  activeSelect = "min";
//  setStatus("請在畫布上點選 MIN(左下)");
//});
//document.getElementById("btnMax").addEventListener("click", ()=>{
//  activeSelect = "max";
//  setStatus("請在畫布上點選 MAX(右上)");
//});
//document.getElementById("btnReset").addEventListener("click", ()=>{
//  activeSelect = null; MIN_POINT = null; MAX_POINT = null;
//  clearOverlay();
//  buildSideUI(); // also reset bold style
//  setStatus("已重置座標");
//});

// Click inside stage to set min/max
//stage.addEventListener("click", (ev)=>{
//  if(!activeSelect) return;
//  const rect = stage.getBoundingClientRect();
//  const x = (ev.clientX - rect.left) / DISPLAY_SCALE;
//  const y = (ev.clientY - rect.top) / DISPLAY_SCALE;
//  if(activeSelect === "min"){
//    MIN_POINT = {x, y};
//    setStatus("已設置 MIN 點");
//  }else if(activeSelect === "max"){
//    MAX_POINT = {x, y};
//    setStatus("已設置 MAX 點");
//  }
//  activeSelect = null;
//  drawPinsAndLines();
//});

// Zoom
zoomRange.addEventListener("input", ()=>{
  const val = Number(zoomRange.value);
  zoomVal.textContent = Math.round(val*100) + "%";
  stage.style.transform = `scale(${val})`;
});

// Download
document.getElementById("btnDownload").addEventListener("click", downloadPNG);
document.getElementById("btnCopy").addEventListener("click", copyStageToClipboard);

// Initial side UI
buildSideUI();
