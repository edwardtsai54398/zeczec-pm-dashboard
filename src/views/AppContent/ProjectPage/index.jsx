import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useBlocker, Navigate } from 'react-router-dom';
import { dBt, fmt, fmtF, pD, addD } from '../../../lib/dateUtils.js';
import { BT, PH } from '../../../lib/tasks.js';
import { mkTasks } from '../../../lib/schedulerV2.js';
import { TONE_PALETTE } from '../../../constants.js';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useProjectEditor } from '../../../hooks/useProjectEditor.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { getTone } from '../shared.js';
import DateInput from '../../../components/DateInput.jsx';
import ConfirmModal from '../../../components/ConfirmModal.jsx';
import UnsavedChangesModal from '../../../components/UnsavedChangesModal.jsx';
import styles from './ProjectPage.module.css';

// 新專案的預設值
function makeNewProject(projects) {
  const tone = TONE_PALETTE[projects.length % TONE_PALETTE.length];
  return {
    name: '新專案', template: 'full',
    startDate: '', surveyStart: '', surveyEnd: '',
    campaignStart: '', campaignEnd: '',
    tone, tasks: mkTasks('full'), kols: [], notes: '',
    position: projects.length, is_archive: false, version: 0,
  };
}

// isNew 時(/project/new)則是草稿。
export default function ProjectPage({ isNew = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    projects, setProjects, miles,
    saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud,
  } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editProject'); // viewer 唯讀:停用編輯欄位、隱藏新增/封存/儲存

  // 專案頁的草稿/dirty/儲存
  const editor = useProjectEditor({
    projects, sel: id, setProjects, saveProjectToCloud,
    isNew, makeDraft: () => makeNewProject(projects), insertProjectToCloud,
  });
  const [archiveTarget, setArchiveTarget] = useState(null);
  
  const skipBlockerRef = useRef(false);
  
  // 離開前有未存變更時用 useBlocker 攔下。
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        editor.dirty && !skipBlockerRef.current && currentLocation.pathname !== nextLocation.pathname,
      [editor.dirty],
    ),
  );
  
  // 放行旗標用過即收,否則目的頁的 blocker 會一直被停用。
  useEffect(() => { skipBlockerRef.current = false; }, [id, isNew]);
  
  // 新增模式按「儲存」:insert 拿回真 uuid 後導到正式網址(放行 blocker)
  const handleNewSave = useCallback(async () => {
    const created = await editor.save();
    if (created) {
      skipBlockerRef.current = true;
      navigate(`/project/${created.id}`, { replace: true });
    }
  }, [editor, navigate]);
  
  // 取消:丟棄草稿直接離開
  const handleCancel = useCallback(() => {
    skipBlockerRef.current = true;
    navigate(projects.length ? '/project' : '/dashboard');
  }, [navigate, projects.length]);
  
  // 重整/關分頁的提醒
  useEffect(() => {
    if (!editor.dirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editor.dirty]);

  // 封存
  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveProjectInCloud(archiveTarget);
      setProjects((v) => v.filter((p) => p.id !== archiveTarget));
    } catch (e) {
      console.error('封存失敗', e);
    } finally {
      setArchiveTarget(null);
    }
  };

  if (!isNew && !projects.length) {
    return <div className="empty"><i className="ti ti-folder-plus"></i>還沒有專案，按右上「新增專案」開始</div>;
  }
  // id 對不到→ 補選第一個。
  if (!isNew && !projects.some((p) => p.id === id)) {
    return <Navigate to={`/project/${projects[0].id}`} replace />;
  }

  return (
    <div>
      <div className="proj-tabs">
        {projects.map((pp) => {
          const tone = getTone(pp);
          return (
            <button key={pp.id} onClick={() => navigate(`/project/${pp.id}`)}
                    className={`proj-tab ${id === pp.id ? "active" : ""}`}>
              <span className="dot" style={{ background: tone.bg }}></span>
              {pp.name}
            </button>
          );
        })}
        {canEdit && (
          <button className={`proj-tab ${isNew ? "active" : ""}`} onClick={() => navigate('/project/new')}>
            <i className="ti ti-plus" style={{ fontSize: 14 }}></i> 新增
          </button>
        )}
      </div>

      {editor.draft
        ? <ProjectDetail p={editor.draft} onUpdate={editor.updateDraft} miles={miles[id]}
                         dirty={editor.dirty} onSave={isNew ? handleNewSave : editor.save}
                         onArchive={isNew ? undefined : () => setArchiveTarget(id)}
                         onCancel={isNew ? handleCancel : undefined} canEdit={canEdit} />
        : <div className="empty">選擇專案</div>}

      <ConfirmModal
        open={!!archiveTarget}
        title="封存專案"
        message={`確定要封存「${(projects.find((p) => p.id === archiveTarget) || {}).name || ""}」嗎？封存後會移到封存檔案，可日後查看。`}
        confirmLabel="封存"
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <UnsavedChangesModal
        open={blocker.state === 'blocked'}
        onDiscard={() => { editor.discard(); blocker.proceed(); }}
        onSave={async () => { await editor.save(); blocker.proceed(); }}
        onClose={() => blocker.reset?.()}
      />
    </div>
  );
}

function ProjectDetail({ p, onUpdate, miles, dirty, onSave, onArchive, onCancel, canEdit }) {
  const [exp, setExp] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const tone = getTone(p);

  // 儲存
  const handleSave = async () => {
    setSaving(true);
    setSaveErr("");
    try { await onSave(); }
    catch (e) { setSaveErr(e?.message || "儲存失敗，請稍後再試"); }
    finally { setSaving(false); }
  };

  const gr = {};
  (p.tasks || []).forEach((t) => {
    const b = BT.find((x) => x.id === t.id);
    if (!b) return;
    if (!gr[b.p]) gr[b.p] = [];
    gr[b.p].push({ ...b, enabled: t.enabled });
  });

  const tog = (id) => onUpdate({
    ...p,
    tasks: p.tasks.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t),
  });

  const totalHours = p.tasks.reduce((s, t) => {
    if (!t.enabled) return s;
    const b = BT.find((x) => x.id === t.id);
    return s + (p.template === "pm" ? (b?.pm || 0) : (b?.h || 0));
  }, 0);

  const u = (field) => (value) => onUpdate({ ...p, [field]: value });

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className={styles.header}>
          <div className={styles.dot} style={{ background: tone.bg, borderColor: tone.ink }} />
          <input
            className={styles.name}
            value={p.name}
            disabled={!canEdit}
            onChange={(e) => onUpdate({ ...p, name: e.target.value })}
          />
          <div className={`tpl-toggle ${styles.toggle}`}>
            <button disabled={!canEdit}
                    onClick={() => onUpdate({ ...p, template: "full", tasks: mkTasks("full") })}
                    className={p.template === "full" ? "active" : ""}>全自操</button>
            <button disabled={!canEdit} onClick={() => {
              const ts = mkTasks("pm").map((t) => ({ ...t, enabled: t.enabled && !(BT.find((x) => x.id === t.id) || {}).sh }));
              onUpdate({ ...p, template: "pm", tasks: ts });
            }} className={p.template === "pm" ? "active" : ""}>PM 模式</button>
          </div>
          {canEdit && dirty && (
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving} title="儲存變更到雲端">
              <i className="ti ti-device-floppy"></i>{saving ? "儲存中…" : "儲存"}
            </button>
          )}
          {onCancel && (
            <button className="iconbtn-x" onClick={onCancel} title="取消，捨棄這個新草稿">
              <i className="ti ti-x"></i>
            </button>
          )}
          {canEdit && onArchive && (
            <button className="iconbtn-x" onClick={onArchive} title="封存專案">
              <i className="ti ti-archive"></i>
            </button>
          )}
        </div>
        {saveErr && <div className={styles.saveErr}>{saveErr}</div>}

        <textarea className="text-in" rows={2} disabled={!canEdit}
                  placeholder="專案備註…例如：「電檢通過，可立刻啟動」"
                  value={p.notes || ""} onChange={(e) => onUpdate({ ...p, notes: e.target.value })} />

        <div style={{ height: 18 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div className="date-cell tone-lavender">
            <div className="lbl">專案啟動日</div>
            <DateInput value={p.startDate || ""} disabled={!canEdit} onChange={(e) => u("startDate")(e.target.value)} />
            {!p.startDate && miles?.calcStart && (
              <div className="hint" style={{ color: "var(--t-lavender-ink)" }}>建議 {fmt(miles.calcStart)} 起</div>
            )}
          </div>
          <div className="date-cell" style={{ background: "white", border: "1px solid var(--border)", borderLeft: "3px solid var(--ink)" }}>
            <div className="lbl">預估總工時</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 28, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {totalHours}<span style={{ fontSize: 14, color: "var(--ink-2)" }}>hr</span>
            </div>
            <div className="hint" style={{ color: "var(--ink-3)", fontWeight: 400 }}>≈ {Math.ceil(totalHours / 8)} 工作天</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>走期設定</div>
        <div className="date-grid" style={{ marginBottom: 10 }}>
          <div className="date-cell tone-lime">
            <div className="lbl">問卷上線日</div>
            <DateInput value={p.surveyStart || ""} disabled={!canEdit} onChange={(e) => {
              const v = e.target.value;
              const autoEnd = v ? fmtF(addD(pD(v), 30)) : "";
              onUpdate({ ...p, surveyStart: v, surveyEnd: autoEnd });
            }} />
            {!p.surveyStart && miles?.eSv && <div className="hint" style={{ color: "var(--t-lime-ink)" }}>建議 {fmt(miles.eSv)}</div>}
          </div>
          <div className="date-cell tone-lime">
            <div className="lbl">問卷結束日</div>
            <DateInput value={p.surveyEnd || ""} disabled={!canEdit} onChange={(e) => u("surveyEnd")(e.target.value)} />
            {!p.surveyEnd && p.surveyStart && <div className="hint" style={{ color: "var(--t-lime-ink)" }}>上線日 +30 天</div>}
          </div>
        </div>
        <div className="date-grid">
          <div className="date-cell tone-peach">
            <div className="lbl">募資上線日</div>
            <DateInput value={p.campaignStart || ""} disabled={!canEdit} onChange={(e) => {
              const v = e.target.value;
              const autoEnd = v ? fmtF(addD(pD(v), 60)) : "";
              onUpdate({ ...p, campaignStart: v, campaignEnd: autoEnd });
            }} />
            {!p.campaignStart && miles?.eCp && <div className="hint" style={{ color: "var(--t-peach-ink)" }}>建議 {fmt(miles.eCp)}</div>}
          </div>
          <div className="date-cell tone-peach">
            <div className="lbl">募資結束日</div>
            <DateInput value={p.campaignEnd || ""} disabled={!canEdit} onChange={(e) => u("campaignEnd")(e.target.value)} />
            {!p.campaignEnd && p.campaignStart && <div className="hint" style={{ color: "var(--t-peach-ink)" }}>上線日 +60 天</div>}
          </div>
        </div>
        {p.campaignStart && p.campaignEnd && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, textAlign: "right" }}>
            募資期 {dBt(pD(p.campaignStart), pD(p.campaignEnd)) + 1} 天
            {p.surveyStart && p.surveyEnd && ` · 問卷期 ${dBt(pD(p.surveyStart), pD(p.surveyEnd)) + 1} 天`}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <span>任務清單</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", fontWeight: 400 }}>
            {p.tasks.filter((t) => t.enabled).length} / {p.tasks.length} 啟用
          </span>
        </div>
        <p className="card-sub">勾選要納入排程的任務，工時依模板自動切換</p>

        {Object.entries(gr).map(([ph, ts]) => {
          const phMeta = PH[ph] || { n: ph, c: "#888" };
          const open = exp[ph];
          const enabled = ts.filter((x) => x.enabled).length;
          return (
            <div key={ph} className="phase-block">
              <div className={`phase-head ${open ? "open" : ""}`}
                   onClick={() => setExp((v) => ({ ...v, [ph]: !v[ph] }))}>
                <span className="swatch" style={{ background: phMeta.c }}></span>
                <span className="name">{phMeta.n}</span>
                <span className="count">{enabled} / {ts.length}</span>
                <i className="ti ti-chevron-down ti-chev"></i>
              </div>
              {open && (
                <div className="phase-body">
                  {ts.map((t) => (
                    <label key={t.id} className={`phase-row ${!t.enabled ? "disabled" : ""}`}>
                      <input type="checkbox" checked={t.enabled} disabled={!canEdit} onChange={() => tog(t.id)} />
                      <span className="pid">{t.id}</span>
                      <span className="pname">{t.n}</span>
                      <span className="pmeta">
                        {(p.template === "pm" ? t.pm : t.h) > 0 ? `${p.template === "pm" ? t.pm : t.h}h` : ""}
                        {t.w > 0 ? ` +${t.w}d` : ""}
                      </span>
                      {t.dl && (
                        <span className={`ptag ${t.dl}`}>{t.dl === "sv" ? "問卷前" : "開賣前"}</span>
                      )}
                      {t.ns && (
                        <span className="ptag ns">優先</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
