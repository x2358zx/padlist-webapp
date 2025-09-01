# PAD List WebApp (Python + FastAPI)

把原本 WPF 的 PAD List 視覺化工具移植成 Python 網頁版，
提供 Excel 解析、晶片圖片對齊、Pin 視覺化、注意事項（operation/bonding）維護、以及一鍵截圖等功能。

---

## 功能總覽
- 上傳 Excel（.xlsx）→ 解析 **有圖** 的工作表，抽取**面積最大**的嵌入圖片顯示。
- 自動或手動設定 `Chip Size` 與 `Project Code`，主畫面選擇 **MIN(左下)** / **MAX(右上)** 校準座標。
- 依 Excel 欄位載入 Pin（PinNo/PinName/X/Y/起始列可調），清理文字與著色，繪製至四邊框標籤。
- 顯示「**無法連線的 PIN**」清單（頂部紅色膠囊 + 右側面板），避免忽略異常。
- 支援 Pin 樣式（倍率與顏色）預設/還原，支援 MIN/MAX 邊界 OFFSET 微調。
- **注意事項**（operation / bonding）可由主管**線上編輯**並保存為**全站共用**文案。
- 一鍵 **下載 PNG 截圖**、**複製到剪貼簿**。

---

## 專案架構（簡述）
- **後端**：FastAPI，靜態檔與模板服務、Excel 解析、圖片抽取、Pin 數據處理、身分判斷與 notices API。
- **前端**：原生 HTML/CSS/JS；主畫布（圖片 + SVG overlay）+ 左側控制面板 + 注意事項手風琴。
- **檔案儲存**：
  - `uploads/`：每次上傳的 session 暫存（Excel、抽出的圖片、工作表對應等）。
  - `data/notices.json`：**全站共用注意事項**（可用環境變數 `NOTICES_FILE` 自訂路徑）。
---

## 快速開始（Docker Compose 推薦）

### 1) 建立資料夾結構
```bash
# 專案根目錄
mkdir -p uploads data
# 如果要預先放一份注意事項：
echo '{ "operation": "…", "bonding": "…" }' > data/notices.json
```

### 2) 編寫（或更新） docker-compose.yml
```yaml
version: "3.9"
services:
  padlist-webapp:
    build: .
    container_name: padlist-webapp
    restart: unless-stopped
    # 開發期可開放直連（正式走 nginx 可註解掉）
    # ports:
    #   - "8000:8000"
    volumes:
      - ./uploads:/app/uploads
      - ./data:/app/data              # ← 全站 notices 存這裡
    environment:
      - TRUST_PROXY=1                 # 反向代理下信任 X-Forwarded-* 標頭
      - DEPLOY_ENV=${DEPLOY_ENV:-test}
      - SUPERVISOR_USERS=${SUPERVISOR_USERS:-}
      - ALLOWED_EDITOR_IPS=${ALLOWED_EDITOR_IPS:-}
      - DEV_ALLOW_LOCAL_EDITOR=${DEV_ALLOW_LOCAL_EDITOR:-}
      - NOTICES_FILE=/app/data/notices.json  # ← 指定全站 notices.json
  nginx:
    image: nginx:1.27-alpine
    container_name: padlist-proxy
    depends_on: [ padlist-webapp ]
    ports:
      - "8002:80"                     # Windows 開發用；Linux 正式可改 "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped
```

### 3) 建立 `.env`（選用）
```dotenv
# test / prod（純顯示用）
DEPLOY_ENV=test
# AD 帳號白名單（例：MSI\User，多個以逗號分隔）
SUPERVISOR_USERS=MSI\\User
# 允許成為編輯者的 IP 清單（逗號分隔）
ALLOWED_EDITOR_IPS=192.168.10.20,192.168.10.50,127.0.0.1
# 本機開發容許 localhost 自動成為編輯者
DEV_ALLOW_LOCAL_EDITOR=1
```

### 4) 啟動
```bash
docker compose up -d --build
# 若開了 nginx：瀏覽 http://localhost:8002
# 若直連 FastAPI：瀏覽 http://localhost:8000
```

> **nginx 設定重點**：請在反向代理中設定：
> ```nginx
> proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
> proxy_set_header X-Real-IP       $remote_addr;
> proxy_set_header X-Remote-User   $remote_user;   # 若有整合 AD/SSO
> ```

---

## 本機開發（不走 Docker）
```bash
# 1) 安裝相依
python -m venv .venv && . .venv/bin/activate  # Windows 以 PowerShell 啟動 venv 亦可
pip install -r requirements.txt

# 2) 設定環境變數（可用 .env）
export TRUST_PROXY=0
export DEV_ALLOW_LOCAL_EDITOR=1
export NOTICES_FILE="$(pwd)/data/notices.json"

# 3) 啟動開發伺服器
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## 使用流程（前端）
1. **選擇 Excel**（僅支援 `.xlsx`）。
2. 下拉 **選擇工作表**（只列出有圖的表）；系統會抽取該表面積最大的一張圖片顯示。
3. 調整必要欄位（`PinNo/PinName/X/Y/起始列`）；按 **載入資料**。
4. 點 **選擇 MIN(左下)** → 於主畫面點選 → 再點 **選擇 MAX(右上)** 完成校準；系統繪製針點連線與邊框標籤。
5. 如有需要，調整 **MIN/MAX OFFSET** 或 **Pin 樣式**。
6. 需要輸出時，按 **下載 PNG 截圖** 或 **複製截圖**。
7. **注意事項**：主管可按「編輯」→ 修改文本 →「儲存」，會寫入 **全站 `notices.json`**。

---

## 權限與安全
- 後端會根據：
  1) `X-Remote-User` 是否在 `SUPERVISOR_USERS` 清單，或
  2) 來源 IP 是否在 `ALLOWED_EDITOR_IPS`，或
  3) 本機開發 `DEV_ALLOW_LOCAL_EDITOR=1` 且 IP 為 `127.0.0.1/::1`  
  來決定是否開啟「編輯」功能。
- 注意事項儲存採 **原子化** 寫入，並建議將 `data/` 納入備份策略。

---

## 檔案/資料夾說明（常見）
```
├── main.py                # FastAPI 主程式（上傳/抽圖/Pin/權限/notices API 等）
├── index.html / static/   # 前端頁面與資源（app.js, style.css, html2canvas.min.js, 圖示等）
├── uploads/               # 上傳 session 暫存（Excel、抽出的圖片、sheet_images.json…）
├── data/
│   └── notices.json       # 全站共用的 operation/bonding 注記
├── docker-compose.yml
├── Dockerfile
└── .env                   # 部署相關環境變數
```