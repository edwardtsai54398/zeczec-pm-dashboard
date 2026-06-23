# CLAUDE.md

募資專案管理 dashboard。React + Vite + Supabase（雲端化進行中）。
這份文件記錄這個專案的**撰寫風格**,寫任何程式碼前請先遵照以下規範。

## 元件檔案結構

需要自己樣式的元件,一律拆成「一個資料夾」,不要把 JSX 和 CSS 混在同一個 `.jsx`:

```
ComponentName/
├─ index.jsx              ← 元件邏輯與 JSX（具名匯出 export function ComponentName）
└─ ComponentName.module.css  ← 該元件專屬的 scoped 樣式
```

- 光把 JSX 和 CSS 拆成兩個檔案還不夠,**一定要再用同名資料夾包起來**。
  ❌ `ProjectPage.jsx` + `ProjectPage.module.css` 平放在同一層;
  ✅ `ProjectPage/index.jsx` + `ProjectPage/ProjectPage.module.css`。

- 進入點檔名固定是 `index.jsx`,匯入時寫完整路徑:`./components/ComponentName/index.jsx`。
- CSS 檔用**元件名稱**命名(`ComponentName.module.css`),不要用 `index.module.css`。
  與現有 `Report/Report.module.css`、`SettingsIO/AvatarMenu.module.css` 一致。
- 樣式用 CSS Modules 匯入後以物件取用:
  ```jsx
  import styles from './ComponentName.module.css';
  // ...
  <div className={styles.wrap}>
  ```
- 同一個功能群組的相關小元件可共用一個資料夾(例:`SettingsIO/` 放 AvatarMenu + settingsIO.js)。

## 不要寫 inline style 物件

❌ 不要這樣（把靜態樣式寫成 JS 物件）:
```jsx
return <div style={wrap}>...</div>;
const wrap = { minHeight: '100vh', display: 'flex', ... };
```

✅ 改寫進 `.module.css`,用 `className={styles.wrap}`。

例外:**真正執行期才算得出來**的一次性樣式(例如某個值由 props 計算),可以保留
`style={{ ... }}`。但只要是固定、可重用的版面,就放進 module.css。

## 樣式用設計 token,不要寫死

顏色、圓角、陰影、字體一律用 `src/index.css` / `src/App.css` 定義的 CSS 變數:

- 顏色:`var(--ink)` `var(--ink-2)` `var(--ink-3)` `var(--surface)` `var(--surface-soft)`
  `var(--bg)` `var(--border)` `var(--border-strong)` `var(--accent-deep)` 主題色 `var(--t-lime)` 等
- 圓角:`var(--r-sm)` `var(--r-lg)`
- 陰影:`var(--shadow-lg)`
- 字體:`var(--font-sans)` `var(--font-display)`

只有真正的一次性強調色(例如錯誤紅 `#b4453c`)才寫死。

## 全域 class 與 scoped class 並存

`src/App.css` / `src/index.css` 有全域工具 class(`.app` `.main` `.avatar`
`.modal-overlay` `.modal-box` 等)。沿用全域樣式時,用樣板字串把全域 class 和 module class 串起來,
**不要**把全域樣式複製進 module.css:

```jsx
<button className={`avatar ${styles.trigger}`}>
```

## 其他慣例

- 元件用**具名匯出**:`export function Foo() {}`(預設匯出只用在像 ErrorFallback 這種既有檔)。
- 註解用**繁體中文**,而且寫「為什麼」而不是「做什麼」,只在邏輯不直觀處註解,簡單程式碼不加。
- 每個 `.module.css` 開頭放一行註解,說明這支樣式 scope 了哪個元件、放了什麼。
- 測試放在元件旁的 `__tests__/` 資料夾,檔名 `ComponentName.test.jsx`。
- import 路徑帶副檔名(`.js` / `.jsx`),與現有檔案一致。

## 驗證

改完跑 `npm test`(vitest)和 `npm run build` 確認沒壞。
