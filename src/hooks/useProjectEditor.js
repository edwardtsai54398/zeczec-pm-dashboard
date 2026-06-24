import { useState, useRef, useCallback } from 'react';
import { projectToRow } from '../lib/projectMapping.js';

// 管理「目前選定專案」的編輯草稿。input 綁草稿。
// dirty 用 projectToRow 正規化後字串比對(不含 version)。
// 新增模式(isNew):草稿是一張還沒寫入的新專案,沒有已存版本可比;Save 才 insert。
export function useProjectEditor({ projects, sel, setProjects, saveProjectToCloud, isNew = false, makeDraft, insertProjectToCloud }) {
  const saved = isNew ? null : (projects.find((p) => p.id === sel) ?? null);

  // 新專案草稿從工廠函式產生
  const [draft, setDraft] = useState(() => (isNew ? makeDraft() : saved));

  // 三個 /project 路由共用同一個 ProjectPage 實例,切換時元件不會重新掛載,
  // 上面的 useState 初始值也只跑一次。改在 render 階段比對「上次的 sel/isNew」重設草稿:
  //   - 切進新增模式(isNew false→true):重建空白草稿,否則會殘留上一個專案的設定與日期
  //   - 換既有專案(sel 變):重設成該專案的已存版本
  // 只在 sel/isNew 真的變動時才重設,別頁改全域 projects(如 Gantt 釘選)不會誤清掉草稿。
  const prevSel = useRef(sel);
  const prevIsNew = useRef(isNew);
  if (sel !== prevSel.current || isNew !== prevIsNew.current) {
    prevSel.current = sel;
    prevIsNew.current = isNew;
    setDraft(isNew ? makeDraft() : (projects.find((p) => p.id === sel) ?? null));
  }

  // 新專案永遠視為「有未存內容」:讓儲存鈕出現、離開時被 useBlocker 攔下。
  const dirty =
    isNew
      ? true
      : (!!draft && !!saved &&
         JSON.stringify(projectToRow(draft)) !== JSON.stringify(projectToRow(saved)));


  const updateDraft = useCallback((updated) => setDraft(updated), []);

  // 新增模式 → insert 進雲端
  // 既有專案 → update
  // 同步草稿
  const save = useCallback(async () => {
    if (!draft) return;
    if (isNew) {
      const created = await insertProjectToCloud(draft);
      setProjects((v) => [...v, created]);
      return created;
    }
    const updated = await saveProjectToCloud(draft);
    setProjects((v) => v.map((p) => (p.id === updated.id ? updated : p)));
    setDraft(updated);
    return updated;
  }, [draft, isNew, insertProjectToCloud, saveProjectToCloud, setProjects]);

  // 捨棄:既有專案回到目前已存版本;新專案直接丟棄。
  const discard = useCallback(() => {
    if (isNew) return;
    setDraft(projects.find((p) => p.id === sel) ?? null);
  }, [projects, sel, isNew]);

  return { draft, updateDraft, dirty, save, discard };
}
