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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI()
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

@app.get("/favicon.ico")
async def favicon():
    return RedirectResponse(url="/static/app.ico")

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

        wb = load_workbook(saved_path, data_only=True)
        sheets = [ws.title for ws in wb.worksheets if _sheet_has_data(ws)]
        if not sheets:
            sheets = list(wb.sheetnames)

        img_path = _extract_first_image_from_xlsx(saved_path, sess_dir)
        img_url = f"/uploads/{sid}/" + os.path.basename(img_path) if img_path else None

        return JSONResponse({"session_id": sid, "sheets": sheets, "image_url": img_url})
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
    img_path = None
    for ext in (".png", ".jpg", ".jpeg"):
        candidate = os.path.join(sess_dir, f"chip_image{ext}")
        if os.path.exists(candidate):
            img_path = candidate
            break
    if img_path is None:
        img_path = _extract_first_image_from_xlsx(xlsx_path, sess_dir)
    img_url = f"/uploads/{session_id}/" + os.path.basename(img_path) if img_path else None

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

