import os
import io
import uuid
import zipfile
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from openpyxl import load_workbook
from openpyxl.utils.cell import coordinate_from_string
from openpyxl.utils import get_column_letter
from PIL import Image

import json
import posixpath as pp
import xml.etree.ElementTree as ET

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/favicon.ico")
async def favicon():
    return RedirectResponse(url="/static/app.ico")

# === 新增：將檔名安全化（用於輸出圖檔）===
def _safe_name(name: str) -> str:
    keep = "-_.()[]{}+@！@全形也可用"
    return "".join(ch if ch.isalnum() or ch in keep else "_" for ch in name).strip("_") or "sheet"

# === 新增：建構「每個工作表 → 最大張圖片」對應表，並把圖片解出來到 session 目錄 ===
def _build_sheet_image_map(xlsx_path: str, out_dir: str):
    """
    回傳:
      (ordered_sheet_names, map_name_to_saved_path)
      - ordered_sheet_names: 依 workbook sheets 原始順序的名稱清單
      - map_name_to_saved_path: {sheet_name: /abs/save/path/of/largest_image}
    規則：
      - 只挑每張工作表面積最大的圖片（用 cx*cy 估算）
      - 若該表沒有圖片，略過（不進下拉）
      - 若無尺寸資訊，退回第一張
    """
    with zipfile.ZipFile(xlsx_path, "r") as zf:
        # 1) 解析 workbook.xml，取得 sheet name 與 rid
        wbk_xml = "xl/workbook.xml"
        wbk_rels = "xl/_rels/workbook.xml.rels"
        ns = {
            "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
            "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
            "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
            "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
            "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
        }
        sheets_order = []
        wtree = ET.fromstring(zf.read(wbk_xml))
        for s in wtree.findall(".//main:sheets/main:sheet", ns):
            sheets_order.append((s.attrib.get("name",""), s.attrib.get("{%s}id" % ns["r"], "")))

        # 2) rId → worksheet 路徑
        rid_to_ws = {}
        rtree = ET.fromstring(zf.read(wbk_rels))
        for rel in rtree.findall(".//pr:Relationship", ns):
            rid = rel.attrib.get("Id","")
            tgt = rel.attrib.get("Target","")
            # target 通常像 "worksheets/sheet1.xml"
            rid_to_ws[rid] = pp.normpath(pp.join("xl", tgt))

        # 3) worksheet → drawing → images，挑最大張
        name_to_saved = {}
        for sheet_name, rid in sheets_order:
            ws_path = rid_to_ws.get(rid)
            if not ws_path or ws_path not in zf.namelist():
                continue

            # 找這張工作表的 rels，裡面會有 drawing
            ws_rels = pp.normpath(pp.join("xl/worksheets/_rels", pp.basename(ws_path) + ".rels"))
            if ws_rels not in zf.namelist():
                continue

            wsrels_tree = ET.fromstring(zf.read(ws_rels))
            drawing_target = None
            for rel in wsrels_tree.findall(".//pr:Relationship", ns):
                if rel.attrib.get("Type","").endswith("/drawing"):
                    drawing_target = rel.attrib.get("Target","")  # ex: "../drawings/drawing1.xml"
                    break
            if not drawing_target:
                continue

            drawing_xml = pp.normpath(pp.join(pp.dirname(ws_path), drawing_target))  # → xl/drawings/drawing1.xml
            if drawing_xml not in zf.namelist():
                continue

            # drawing 的 rels：把 r:embed → 影像檔路徑對上
            drawing_rels = pp.normpath(pp.join(pp.dirname(drawing_xml), "_rels", pp.basename(drawing_xml) + ".rels"))
            if drawing_rels not in zf.namelist():
                continue
            drels_tree = ET.fromstring(zf.read(drawing_rels))
            embed_to_media = {}
            for rel in drels_tree.findall(".//pr:Relationship", ns):
                if rel.attrib.get("Type","").endswith("/image"):
                    rid_img = rel.attrib.get("Id","")
                    tgt_img = rel.attrib.get("Target","")  # ex: "../media/image1.png"
                    media_path = pp.normpath(pp.join(pp.dirname(drawing_xml), tgt_img))  # → xl/media/image1.png
                    embed_to_media[rid_img] = media_path

            # 解析 drawing.xml 找出所有圖片的 a:blip（拿 r:embed）與 a:ext（拿 cx, cy）
            dtree = ET.fromstring(zf.read(drawing_xml))
            candidates = []  # [(area, embed_id)]
            for pic in dtree.findall(".//xdr:pic", ns):
                blip = pic.find(".//a:blip", ns)
                if blip is None:
                    continue
                embed_id = blip.attrib.get("{%s}embed" % ns["r"])
                # 嘗試抓尺寸（有些檔可能沒有 ext）
                ext = pic.find(".//a:xfrm/a:ext", ns)
                try:
                    cx = int(ext.attrib.get("cx","0")) if ext is not None else 0
                    cy = int(ext.attrib.get("cy","0")) if ext is not None else 0
                except Exception:
                    cx = cy = 0
                area = cx * cy
                candidates.append((area, embed_id))

            if not candidates:
                continue
            # 依面積挑最大；若都 0，這個排序也會保留第一張
            candidates.sort(key=lambda t: t[0], reverse=True)
            _, best_embed = candidates[0]
            media_rel = embed_to_media.get(best_embed)
            if not media_rel or media_rel not in zf.namelist():
                continue

            # 寫出檔案到 session 目錄
            ext = os.path.splitext(media_rel)[1].lower() or ".png"
            out_name = f"{_safe_name(sheet_name)}_largest{ext}"
            out_path = os.path.join(out_dir, out_name)
            with open(out_path, "wb") as f:
                f.write(zf.read(media_rel))

            name_to_saved[sheet_name] = out_path

        # 只有「有圖」的工作表需要列入選單
        ordered_names_with_image = [nm for nm, _ in sheets_order if nm in name_to_saved]
        return ordered_names_with_image, name_to_saved

def _sheet_has_data(ws) -> bool:
    """Heuristic: if any cell in the used range has a non-empty value."""
    try:
        min_row = 1
        max_row = ws.max_row or 0
        min_col = 1
        max_col = ws.max_column or 0
        max_row = min(max_row, 200)
        max_col = min(max_col, 50)
        for r in range(min_row, max_row + 1):
            for c in range(min_col, max_col + 1):
                if ws.cell(row=r, column=c).value not in (None, ""):
                    return True
        return False
    except Exception:
        return False

def _read_cell_text(ws, cell_addr: str) -> str:
    try:
        value = ws[cell_addr].value
        if value not in (None, ""):
            return str(value)
        # 若空，嘗試從合併儲存格取值
        target_col_letter, target_row = coordinate_from_string(cell_addr)
        target_col_idx = ws[cell_addr].column  # numeric
        for mr in ws.merged_cells.ranges:
            min_col, min_row, max_col, max_row = mr.bounds
            # 與 WPF 相同邏輯：同列、且目標欄在合併範圍內
            if min_row == int(target_row) and min_col <= target_col_idx <= max_col:
                v = ws.cell(row=min_row, column=min_col).value
                if v not in (None, ""):
                    return str(v)
    except Exception:
        pass
    return ""

def _extract_first_image_from_xlsx(xlsx_path: str, out_dir: str) -> Optional[str]:
    # 直接從 zip 取 xl/media/* 第一張
    try:
        with zipfile.ZipFile(xlsx_path, "r") as zf:
            media_files = [n for n in zf.namelist() if n.startswith("xl/media/") and (n.lower().endswith(".png") or n.lower().endswith(".jpg") or n.lower().endswith(".jpeg"))]
            if not media_files:
                return None
            name = media_files[0]
            data = zf.read(name)
            ext = os.path.splitext(name)[1].lower()
            out_path = os.path.join(out_dir, f"chip_image{ext}")
            with open(out_path, "wb") as f:
                f.write(data)
            return out_path
    except Exception:
        return None

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    try:
        sid = uuid.uuid4().hex[:10]
        sess_dir = os.path.join(UPLOAD_DIR, sid)
        os.makedirs(sess_dir, exist_ok=True)

        saved_path = os.path.join(sess_dir, "workbook.xlsx")
        with open(saved_path, "wb") as f:
            f.write(await file.read())

        # wb = load_workbook(saved_path, data_only=True)
        # sheets = [ws.title for ws in wb.worksheets if _sheet_has_data(ws)]
        # if not sheets:
        #     sheets = list(wb.sheetnames)
        # 
        # img_path = _extract_first_image_from_xlsx(saved_path, sess_dir)
        # img_url = f"/uploads/{sid}/" + os.path.basename(img_path) if img_path else None
        # 
        # return JSONResponse({"session_id": sid, "sheets": sheets, "image_url": img_url})
        # 讀 workbook，建立「每表最大圖」對應（只列出有圖的工作表）
        wb = load_workbook(saved_path, data_only=True)
        sheets_with_img_ordered, map_name_to_saved = _build_sheet_image_map(saved_path, sess_dir)

        # 將對應表存成 json，給 /sheet_info 使用
        mapping_json = os.path.join(sess_dir, "sheet_images.json")
        with open(mapping_json, "w", encoding="utf-8") as f:
            json.dump({k: os.path.basename(v) for k, v in map_name_to_saved.items()}, f, ensure_ascii=False)

        # 預設顯示第一個有圖的工作表之圖片
        default_image_url = None
        if sheets_with_img_ordered:
            first_sheet = sheets_with_img_ordered[0]
            fname = os.path.basename(map_name_to_saved[first_sheet])
            default_image_url = f"/uploads/{sid}/{fname}"

        return JSONResponse({
            "session_id": sid,
            # 僅包含「有圖」的工作表，前端下拉就不會出現沒圖的表
            "sheets": sheets_with_img_ordered,
            # 初始圖（第一個工作表的「最大張」）
            "default_image_url": default_image_url
        })
    except Exception as e:
        return JSONResponse({"error": f"Failed to read Excel: {type(e).__name__}: {e}"}, status_code=400)

@app.get("/uploads/{sid}/{fname}")
async def serve_upload(sid: str, fname: str):
    path = os.path.join(UPLOAD_DIR, sid, fname)
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse({"error": "file not found"}, status_code=404)

@app.post("/sheet_info")
async def sheet_info(
    session_id: str = Form(...),
    sheet_name: str = Form(...),
    chip_size_cell: str = Form("C3"),
    project_code_cell: str = Form("C2"),
):
    sess_dir = os.path.join(UPLOAD_DIR, session_id)
    xlsx_path = os.path.join(sess_dir, "workbook.xlsx")
    if not os.path.exists(xlsx_path):
        return JSONResponse({"error": "session not found"}, status_code=404)

    wb = load_workbook(xlsx_path, data_only=True)
    if sheet_name not in wb.sheetnames:
        return JSONResponse({"error": "sheet not found"}, status_code=404)
    ws = wb[sheet_name]

    # 解析 chip size (e.g. "123 um x 456 um")
    import re
    text = _read_cell_text(ws, chip_size_cell)
    width = height = None
    m = re.search(r"(\d+\.?\d*)\s*um\s*[X×x]\s*(\d+\.?\d*)\s*um", str(text))
    if m:
        width = float(m.group(1))
        height = float(m.group(2))

    project_code = _read_cell_text(ws, project_code_cell)

    # 圖片 URL（若未抽取過則再抽一次）
    #img_path = None
    #for ext in (".png", ".jpg", ".jpeg"):
    #    candidate = os.path.join(sess_dir, f"chip_image{ext}")
    #    if os.path.exists(candidate):
    #        img_path = candidate
    #        break
    #if img_path is None:
    #    img_path = _extract_first_image_from_xlsx(xlsx_path, sess_dir)
    #img_url = f"/uploads/{session_id}/" + os.path.basename(img_path) if img_path else None

    # 依工作表回傳對應的「最大張圖片」
    mapping_json = os.path.join(sess_dir, "sheet_images.json")
    img_url = None
    if os.path.exists(mapping_json):
        try:
            with open(mapping_json, "r", encoding="utf-8") as f:
                m = json.load(f)  # {sheet_name: filename}
            fname = m.get(sheet_name)
            if fname:
                img_url = f"/uploads/{session_id}/{fname}"
        except Exception:
            img_url = None

    return JSONResponse({
        "chip_size": {"width": width, "height": height},
        "project_code": project_code,
        "image_url": img_url
    })

@app.post("/parse_pins")
async def parse_pins(
    session_id: str = Form(...),
    sheet_name: str = Form(...),
    pin_no_col: str = Form("B"),
    pin_name_col: str = Form("C"),
    x_col: str = Form("D"),
    y_col: str = Form("E"),
    start_row: int = Form(8),
):
    sess_dir = os.path.join(UPLOAD_DIR, session_id)
    xlsx_path = os.path.join(sess_dir, "workbook.xlsx")
    if not os.path.exists(xlsx_path):
        return JSONResponse({"error": "session not found"}, status_code=404)

    wb = load_workbook(xlsx_path, data_only=True)
    if sheet_name not in wb.sheetnames:
        return JSONResponse({"error": "sheet not found"}, status_code=404)
    ws = wb[sheet_name]
    if ws.max_row is None or ws.max_row == 0:
        return JSONResponse({"valid_pins": [], "invalid_pins": []})

    valid_pins = []
    invalid_pins = []

    def read_cell(col_letter: str, row_idx: int) -> str:
        try:
            return str(ws[f"{col_letter}{row_idx}"].value or "").strip()
        except Exception:
            return ""

    for r in range(start_row, ws.max_row + 1):
        pin_no = read_cell(pin_no_col, r)
        pin_name = read_cell(pin_name_col, r)
        x_text = read_cell(x_col, r).replace(" ", "")
        y_text = read_cell(y_col, r).replace(" ", "")

        if pin_no == "" and pin_name == "":
            continue

        # NC 或 無效
        try:
            x = float(x_text)
            y = float(y_text)
        except Exception:
            x = y = None

        if pin_no == "" or pin_name.upper() == "NC" or x is None or y is None:
            invalid_pins.append(f"{pin_no}, {pin_name}")
            continue

        # 清理名稱（去除空格）
        cleaned_name = pin_name.replace(" ", "")
        valid_pins.append({"pin_no": pin_no, "pin_name": cleaned_name, "x": x, "y": y})

    return JSONResponse({"valid_pins": valid_pins, "invalid_pins": invalid_pins})

