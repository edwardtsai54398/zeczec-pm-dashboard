import { useState, useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';
import { fmtF, pD, addD } from '../../../lib/dateUtils.js';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useDraftEditor } from '../../../hooks/useDraftEditor.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal.jsx';
import { getTone } from '../shared.js';
import DateInput from '../../../components/DateInput.jsx';
import styles from './KOLPage.module.css';

const KOL_MILESTONES = [
  { id: "ship",   n: "寄出產品",      o: 0 },
  { id: "brief",  n: "提供 Brief",    o: 1 },
  { id: "script", n: "腳本初版",      o: 6 },
  { id: "sfb",    n: "品牌腳本回饋",  o: 8 },
  { id: "sfinal", n: "腳本確認",      o: 9 },
  { id: "acopy",  n: "影片 A copy",   o: 13 },
  { id: "afb",    n: "品牌影片回饋",  o: 15 },
  { id: "final",  n: "Final 完成",    o: 16 },
  { id: "live",   n: "上線",          o: 17 },
];

// KOL 合作清單頁:草稿單位是「一個專案的整包 KOLs」。
// 新增/編輯/刪除多個 KOL 都只改本地草稿,按「儲存」才一次寫回雲端(走 projects 整列儲存)。
export default function KOLPage() {
  const { projects, setProjects, saveProjectToCloud } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editKOL'); // viewer 唯讀:隱藏新增/刪除/儲存,日期欄停用
  const [sel, setSel] = useState(projects[0]?.id || "");
  const [showForm, setShowForm] = useState(false);
  const [newKol, setNewKol] = useState({ name: "", wave: 1 });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const p = projects.find((x) => x.id === sel);

  // 草稿 = 這個專案的 kols 陣列;換專案或儲存成功(context 更新)時由 useDraftEditor 自動重設。
  const kols = useDraftEditor(p?.kols || []);
  const draftKols = kols.draft;

  // 切換專案 tab 前若有未存草稿,先用 modal 攔下(tab 是本地 state,不會觸發 useBlocker)。
  const [pendingSel, setPendingSel] = useState(null);
  const selectTab = (id) => {
    if (id === sel) return;
    if (kols.dirty) { setPendingSel(id); return; }
    setSel(id);
  };

  const addKol = () => {
    if (!newKol.name || !p) return;
    kols.setDraft([...draftKols, {
      id: `k${crypto.randomUUID()}`,
      name: newKol.name,
      wave: newKol.wave,
      milestones: KOL_MILESTONES.map((m) => ({ id: m.id, name: m.n, date: "" })),
    }]);
    setNewKol({ name: "", wave: 1 });
    setShowForm(false);
  };

  const updateMilestone = (kolId, milestoneId, date) => {
    const updated = draftKols.map((k) => {
      if (k.id !== kolId) return k;
      const ms = k.milestones.map((m) => m.id === milestoneId ? { ...m, date } : m);
      // 填入「寄出產品」日期後,自動推算其餘還沒填的里程碑
      if (milestoneId === "ship" && date) {
        const base = pD(date);
        if (base) ms.forEach((m) => {
          if (m.id !== "ship" && !m.date) {
            const def = KOL_MILESTONES.find((x) => x.id === m.id);
            if (def) m.date = fmtF(addD(base, def.o));
          }
        });
      }
      return { ...k, milestones: ms };
    });
    kols.setDraft(updated);
  };

  const removeKol = (kolId) => kols.setDraft(draftKols.filter((x) => x.id !== kolId));

  // 把整包草稿寫回雲端(saveProjectToCloud 有 version 樂觀鎖),成功後同步全域 projects。
  const save = useCallback(async () => {
    if (!p) return;
    const updated = await saveProjectToCloud({ ...p, kols: draftKols });
    setProjects((v) => v.map((x) => (x.id === updated.id ? updated : x)));
  }, [p, draftKols, saveProjectToCloud, setProjects]);

  const handleSave = async () => {
    setSaving(true);
    setSaveErr("");
    try { await save(); }
    catch (e) { setSaveErr(e?.message || "儲存失敗，請稍後再試"); }
    finally { setSaving(false); }
  };

  // 有未存草稿時,換路由攔截、重整/關分頁前提醒(比照 ProjectPage / SettingsPage)。
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        kols.dirty && currentLocation.pathname !== nextLocation.pathname,
      [kols.dirty],
    ),
  );
  useEffect(() => {
    if (!kols.dirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [kols.dirty]);

  // 換 tab 與換路由共用同一個 modal:確認後依來源放行。
  const modalOpen = blocker.state === 'blocked' || pendingSel != null;
  const proceed = useCallback(() => {
    if (pendingSel != null) { setSel(pendingSel); setPendingSel(null); }
    if (blocker.state === 'blocked') blocker.proceed();
  }, [pendingSel, blocker]);
  const closeModal = useCallback(() => { setPendingSel(null); blocker.reset?.(); }, [blocker]);

  return (
    <div>
      <div className="proj-tabs">
        {projects.map((pp) => {
          const tone = getTone(pp);
          // 正在編輯的這個專案 badge 顯示草稿數量,其餘顯示已存數量。
          const count = pp.id === sel ? draftKols.length : (pp.kols || []).length;
          return (
            <button key={pp.id} onClick={() => selectTab(pp.id)}
                    className={`proj-tab ${sel === pp.id ? "active" : ""}`}>
              <span className="dot" style={{ background: tone.bg }}></span>
              {pp.name}
              <span className="badge">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">
          <span>KOL 合作清單</span>
          {canEdit && (
            <div className={styles.titleActions}>
              {kols.dirty && (
                <>
                  {saveErr && <span className={styles.saveErr}>{saveErr}</span>}
                  <button className={styles.discardBtn} onClick={kols.discard} disabled={saving}
                          title="還原成已儲存的 KOL 清單">還原</button>
                  <button className={styles.saveBtn} onClick={handleSave} disabled={saving}
                          title="儲存這個專案的 KOL 清單到雲端">
                    <i className="ti ti-device-floppy"></i>{saving ? "儲存中…" : "儲存"}
                  </button>
                </>
              )}
              <button className="ghost-btn" onClick={() => setShowForm(!showForm)}>
                <i className="ti ti-plus"></i>新增 KOL
              </button>
            </div>
          )}
        </div>
        <p className="card-sub">填入「寄出產品」日期後，會自動推算後續里程碑；編輯後需按「儲存」才會寫入雲端</p>

        {canEdit && showForm && (
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", padding: 14, background: "var(--surface-tint)", borderRadius: "var(--r)", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>KOL 名稱</div>
              <input className="text-in" style={{ width: 160 }}
                     value={newKol.name} onChange={(e) => setNewKol((v) => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4, fontWeight: 500 }}>波段</div>
              <select className="text-in" value={newKol.wave}
                      onChange={(e) => setNewKol((v) => ({ ...v, wave: +e.target.value }))}>
                <option value={1}>第一波</option>
                <option value={2}>第二波</option>
              </select>
            </div>
            <button className="cta-primary" style={{ padding: "10px 18px" }} onClick={addKol}>確認</button>
          </div>
        )}

        {!draftKols.length && !showForm && (
          <div className="todo-empty">{canEdit ? "尚未新增 KOL · 按右上「新增 KOL」" : "尚未新增 KOL"}</div>
        )}

        {draftKols.map((k) => (
          <div key={k.id} className="kol-card">
            <div className="kol-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="kol-name">{k.name}</span>
                <span className="todo-tag" style={{
                  background: k.wave === 1 ? "var(--t-peach)" : "var(--t-sky)",
                  color: k.wave === 1 ? "var(--t-peach-ink)" : "var(--t-sky-ink)",
                }}>
                  第 {k.wave} 波
                </span>
              </div>
              {canEdit && (
                <button className="iconbtn-x" onClick={() => removeKol(k.id)}>
                  <i className="ti ti-trash"></i>
                </button>
              )}
            </div>
            <div className="kol-body">
              {k.milestones.map((ms) => (
                <div key={ms.id} className="kol-row">
                  <span className="lbl">{ms.name}</span>
                  <DateInput value={ms.date || ""} disabled={!canEdit}
                         onChange={(e) => updateMilestone(k.id, ms.id, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <UnsavedChangesModal
        open={modalOpen}
        onDiscard={() => { kols.discard(); proceed(); }}
        onSave={async () => { await save(); proceed(); }}
        onClose={closeModal}
      />
    </div>
  );
}
