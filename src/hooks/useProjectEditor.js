import { useState, useEffect, useRef, useCallback } from 'react';
import { projectToRow } from '../lib/projectMapping.js';

// 管理「目前選定專案」的編輯草稿。input 綁草稿。
// dirty 用 projectToRow 正規化後字串比對(不含 version)。
// 新增模式(isNew):草稿是一張還沒寫入的新專案,沒有已存版本可比;Save 才 insert。
export function useProjectEditor({ projects, sel, setProjects, saveProjectToCloud, isNew = false, makeDraft, insertProjectToCloud }) {
  const saved = isNew ? null : (projects.find((p) => p.id === sel) ?? null);

  // 新專案草稿從工廠函式產生
  const [draft, setDraft] = useState(() => (isNew ? makeDraft() : saved));

  // 只在「換專案(sel 變)」時把草稿重設成該專案的已存版本。
  // 用 ref 比對前一個 sel,避免別頁改全域 projects(如 Gantt 釘選)時誤清掉草稿。
  const prevSel = useRef(sel);
  useEffect(() => {
    if (isNew) return;
    if (prevSel.current !== sel) {
      prevSel.current = sel;
      setDraft(projects.find((p) => p.id === sel) ?? null);
    }
  }, [sel, projects, isNew]);

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
