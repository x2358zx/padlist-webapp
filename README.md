# PAD List WebApp (Python + FastAPI)

將原本的 WPF 工具轉成 Python 網頁版，支援：
- 上傳 Excel（.xlsx）並選擇工作表
- 自動解析 `Chip Size`（預設 C3，可調整）與 `Project Code`（預設 C2）
- 取得 Excel 內第一張嵌入圖片（自動抽取 `xl/media/image*.png|jpg`）
- 在畫面中選擇 MIN(左下) 與 MAX(右上) 點位
- 載入 PIN 資料（PinNo/PinName/X/Y/起始列可調整），清理文字並著色
- 繪製針點與連線到邊框標籤，並顯示無法連線的 PIN 清單
- 支援縮放（0.5 ~ 3.0）
- 一鍵匯出「主視覺畫布」PNG 截圖

> 本專案預設畫布寬高為 **800x900**，內部相對位置對齊原程式的座標配置。

## 快速開始

### 1) Docker 執行
```bash
# 於專案根目錄
docker build -t padlist-webapp .
docker run --rm -p 8000:8000 padlist-webapp
# 開啟 http://localhost:8000
```

### 2) 直接執行（僅供本機開發）
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## 使用流程
1. 上傳 Excel（.xlsx）。
2. 於「選擇工作表」選擇工作表；系統會嘗試解析 Chip Size 及 Project Code，並抽出第一張圖片。
3. 調整欄位設定（如 `PinNo` 欄位、`X/Y` 欄位、起始列）。
4. 按「載入資料」→ 會填入邊框各個腳位的名稱，並且著色：
   - `VSS` → 淺綠色
   - `VDD` 或 `VDP` → 粉紅色
   - 空白 → 灰色
   - 文字含 `Q` → 淺藍色（補強注意事項提到的 Q 類型）
5. 依序按下「選擇 MIN(左下)」、「選擇 MAX(右上)」並在主畫面點選位置，完成後自動繪製針點及連線。
6. 需要截圖時，按「下載 PNG 截圖」即可下載 800×900 之主畫布圖片。

## 注意事項
- 僅支援 `.xlsx`，請勿同時在 Excel 中開啟檔案。
- 圖片以解壓 `xl/media/` 取得第一張圖片；若沒有嵌入圖片，請在 Excel 內插入一張圖後再上傳。
- 「有資料工作表」的判定邏輯：`A1:E6` 任一格不為空即視為候選。
- 版面配置與 WPF 版本盡量一致，並將主視覺（包含邊框標籤）放於單一畫布，方便縮放與截圖。

