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

## 一個 `.jsx` 只放一個 React 元件

一個 `.jsx` 檔只匯出**一個** React 元件,不要把多個元件塞進同一支檔案。
拆出來的子元件各自獨立成檔(需要自己樣式就照上面的同名資料夾結構)。

❌ 不要這樣(一個檔案塞多個元件):
```jsx
// Dashboard.jsx
export function Dashboard() { ... }
function MilestonesCard() { ... }
function TodoCard() { ... }
```

✅ 每個元件一支檔(同名資料夾 + `index.jsx`):
```
Dashboard/
├─ index.jsx                 ← Dashboard 本體
├─ utils.js                  ← 純工具函式(非元件),不受這條限制
├─ MilestonesCard/index.jsx
└─ TodoCard/index.jsx
```

跟元件相關的**純資料/工具函式**(非 React 元件)可以集中放在同層的 `utils.js`,
不算「多個元件」。

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

## 元件專屬的 selector 不要遺留在 index.css

`src/index.css` 只放**全域工具 class**(`.app` `.main` `.avatar` `.card` `.card-title`
`.modal-overlay`…—被多個元件共用的)。**只有單一元件用到**的 selector 不該留在這裡,要拉到
該元件的 `ComponentName.module.css`,改用 `className={styles.xxx}`。

寫(或改)一個元件時,順手檢查 `index.css` 裡有沒有「**只有這個元件**會用到」的 selector
還沒搬:

```bash
# 例:確認 .hero / .greeting 只有 Dashboard 在用 → 該搬進 Dashboard.module.css
grep -rn "className=\"hero\"" src   # 只命中一個元件 = 元件專屬,搬走
```

判斷原則:**這個 class 還有沒有別人用?** 只有一個元件用 → 搬進該元件的 module；
兩個以上元件共用 → 留在 `index.css` 當全域工具 class。共用的判斷以「有沒有別的元件掛這個
class」為準,不是看名字像不像通用。

搬移時的接縫(module 內引用全域 class)用 `:global()`:

```css
/* Dashboard.module.css —— 卡片外觀沿用全域 .card,只在這裡排版 */
.dashCards > :global(.card) { flex: 1 1 calc(50% - 9px); }
:global(body.density-compact) .hero { padding: 10px 4px 18px; }
```

別漏了**被一起連動的選擇器**:`body.density-compact .hero`、`.hero .random-cat` 這種
帶著元件專屬 class 的規則,也要一起搬;只搬 `.hero` 本體、把 compact 覆寫留在 index.css,
會變成「改一個欄位要動兩個檔」的裂縫。

## 變數命名不要用簡寫

變數一律用完整、看得懂的名字,不要縮成單一字母或殘缺簡寫。

❌ 不要這樣:
```jsx
const s = new Date(t.start), e = new Date(t.end);
projects.forEach((p) => { p });
```

✅ 改成完整命名:
```jsx
const startDate = new Date(task.start), endDate = new Date(task.end);
projects.forEach((project) => {});
```

例外:**第二層巢狀迴圈**的變數若會和外層完整名稱衝突,才退而用簡寫。

## 資料在「用到的那層」呼叫,不要從最上層一路 props 傳下來

資料(context、雲端 hook)在**真正用到它的那層元件**自己呼叫,不要在最上層先全部叫出來、
再用 props 一路串到深層才使用。呼叫點離使用點越遠,中間每一層都被迫掛上不相干的 props,
改一個欄位要動一串檔案,而且中間層也被綁死、不好單獨重用。

判斷原則:**誰在用這份資料,就在誰那層讀**。共享資料已放在 `WorkspaceContext` /
`AuthContext`,任何層級直接讀 context 都「不算」往下傳——要避免的是「在上層讀出來、再用 props
傳下去」這條長鏈。

✅ 這樣可以(現有最佳實踐):route 接點只負責 render,頁面自己取資料:
```jsx
// views/AppContent/routes.jsx
export function KOLRoute() {
  return <KOLPage />;               // route 不讀資料
}

// views/AppContent/KOLPage/index.jsx —— 真正用到 projects 的那層,自己取
export function KOLPage() {
  const { projects, setProjects, saveProjectToCloud } = useWorkspace();
  // ...
}
```

✅ Dashboard 的完成狀態也一樣:`useCloudWorkspaceState` 在 `Dashboard` 自己呼叫,
不從 route 傳進來:
```jsx
// views/AppContent/Dashboard/index.jsx
export function Dashboard({ projects, data, miles, onJump }) {
  const { workspaceId, session } = useAuthContext();
  const { todoDone, toggleTodoDone, dismissOverdue } =
    useCloudWorkspaceState(workspaceId, session?.user?.id);
  // ...
}
```

❌ 不要這樣(把資料 hoist 到 route / 上層,再一路 props 傳下去):
```jsx
// routes.jsx —— 不要在這裡叫完成狀態,再塞給 Dashboard
export function DashboardRoute() {
  const { todoDone, toggleTodoDone, dismissOverdue } =
    useCloudWorkspaceState(workspaceId, userId);
  // Dashboard 收下後,還得把這些原封不動再往 TodoCard / TimelineCard 傳一層,鏈越拉越長
  return <Dashboard todoDone={todoDone} onToggle={toggleTodoDone} onDismiss={dismissOverdue} />;
}
```

界線:傳給**緊鄰的呈現用子元件**是 OK 的(例:`Dashboard` 把 `done` / `onToggle`
傳給葉子卡片 `TodoCard`、`TimelineCard`)。要避免的是「跨越不相干的中間層,把資料的呼叫點
推到離使用點很遠的地方」。

## 其他慣例

- 元件用**具名匯出**:`export function Foo() {}`(預設匯出只用在像 ErrorFallback 這種既有檔)。
- 註解用**繁體中文**,而且寫「為什麼」而不是「做什麼」,只在邏輯不直觀處註解,簡單程式碼不加。
- 每個 `.module.css` 開頭放一行註解,說明這支樣式 scope 了哪個元件、放了什麼。
- 測試放在元件旁的 `__tests__/` 資料夾,檔名 `ComponentName.test.jsx`。
- import 路徑帶副檔名(`.js` / `.jsx`),與現有檔案一致。

## 驗證

改完跑 `npm test`(vitest)和 `npm run build` 確認沒壞。
