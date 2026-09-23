# 睡眠的內在節奏：EMD 互動實驗室

黃鍔院士（Norden E. Huang）演講「EMD 在睡眠上的研究」的課前導讀網站。它把 **經驗模態分解（EMD）、CEEMD、Hilbert–Huang 轉換、Holo-Hilbert 頻譜分析（HHSA）與 iPDF** 用原生 JavaScript 實作，全部在瀏覽器裡即時計算，讓讀者可以動手操作每一個步驟。

🔗 **網站：https://hsps40120.github.io/emd-sleep-lab/**

## 內容

| 節 | 互動 | 對應論文 |
|---|---|---|
| 1 為什麼傅立葉不夠 | 調整非線性程度 ε，比較傅立葉諧波與 Hilbert 瞬時頻率 | Huang et al. 1998 |
| 2 Sifting 篩選 | 一步一步看上下包絡、包絡平均、IMF 的產生 | Huang et al. 1998 |
| 3 拆解睡眠腦波 | W / N2 / N3 / REM 的 IMF、Hilbert 譜、邊際譜 vs FFT | Huang 1998; Yeh, Shieh & Huang 2010 |
| 4 模態混疊與 CEEMD | 間歇紡錘波：EMD vs CEEMD | Wu & Huang 2009; Yeh et al. 2010 |
| 5 HHSA | 載波頻率 × 調幅頻率的二維全息譜 | Huang et al. 2016 |
| 6 iPDF | 四個睡眠期 IMF 部分和的機率分布與峰度 | Huang et al. 2025 |
| 7 論文與提問 | 9 篇論文 DOI、主題意義、演講可問的問題 | — |

> ⚠ 睡眠腦波為依各期典型特徵**人工合成**的教學訊號（fs = 100 Hz），非真實 PSG；演算法為教學用簡化實作（固定 10 次 sifting、極值鏡射邊界）。

## 本機執行

純靜態網站，無需建置：

```bash
npx serve .        # 或 python3 -m http.server
npm test           # Node 驗證 EMD 重建誤差、雙正弦分離、iPDF 趨勢
```

## 結構

```
index.html      內容與版面
style.css       樣式（含深色模式）
js/emd.js       演算法：FFT、Hilbert、EMD、CEEMD、Hilbert 譜、HHSA、iPDF、合成訊號
js/plot.js      canvas 繪圖
js/app.js       互動邏輯
test/           Node 測試
```

## 主要參考文獻

- Huang NE, et al. (1998) *Proc R Soc Lond A* 454:903–995. doi:10.1098/rspa.1998.0193
- Wu Z, Huang NE (2009) *Adv Adapt Data Anal* 1:1–41. doi:10.1142/S1793536909000047
- Yeh JR, Shieh JS, Huang NE (2010) *Adv Adapt Data Anal* 2:135–156. doi:10.1142/S1793536910000422
- Huang NE, et al. (2016) *Phil Trans R Soc A* 374:20150206. doi:10.1098/rsta.2015.0206
- Liu MY, Huang A, Huang NE (2017) *Front Hum Neurosci* 11:261. doi:10.3389/fnhum.2017.00261
- Huang NE, et al. (2025) *Biol Psychol* 200:109101. doi:10.1016/j.biopsycho.2025.109101
