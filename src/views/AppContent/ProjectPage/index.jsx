import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useBlocker, Navigate } from 'react-router-dom';
import { dBt, fmt, fmtF, pD, addD } from '../../../lib/dateUtils.js';
import { BT, PH } from '../../../lib/tasks.js';
import { mkTasks, runScheduleV2 } from '../../../lib/schedulerV2.js';
import { hydrateSchedule, collectFrozen } from '../../../lib/scheduleStore.js';
import { TONE_PALETTE } from '../../../constants.js';
import { useWorkspace } from '../../../context/WorkspaceContext.jsx';
import { useAuthContext } from '../../../context/AuthContext.jsx';
import { useProjectEditor } from '../../../hooks/useProjectEditor.js';
import { usePermissions } from '../../../hooks/usePermissions.js';
import { useWorkspaceMembers } from '../../../hooks/useWorkspaceMembers.js';
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
    // schedule 空物件(而非 undefined):代表「新專案、還沒快速排程」,行事曆空白且不會被自動遷移;
    // undefined 才是改版前的舊資料,交給 useMigrateSchedules 遷移。
    schedule: {},
    position: projects.length, is_archive: false, version: 0,
  };
}

// isNew 時(/project/new)則是草稿。
export default function ProjectPage({ isNew = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    projects, setProjects, settings,
    saveProjectToCloud, insertProjectToCloud, archiveProjectInCloud,
  } = useWorkspace();
  const { can } = usePermissions();
  const canEdit = can('editProject'); // viewer 唯讀:停用編輯欄位、隱藏新增/封存/儲存

  // 成員清單:draftMiles(建議日期預覽)要用 per-assignee 容量算,ProjectDetail 的指派下拉也要用;
  // 在這層取一次往下傳給緊鄰的子元件,免得同頁重複打 RPC。
  const { workspaceId } = useAuthContext();
  const { members } = useWorkspaceMembers(workspaceId);

  // 專案頁的草稿/dirty/儲存
  const editor = useProjectEditor({
    projects, sel: id, setProjects, saveProjectToCloud,
    isNew, makeDraft: () => makeNewProject(projects), insertProjectToCloud,
  });
  const [archiveTarget, setArchiveTarget] = useState(null);

  // 「建議日期」提示要跟著目前草稿即時算(新專案草稿還沒進 projects、查不到全域 miles[id])。
  // 有啟動日 → 把草稿併進「所有現有專案」跑一次(等同快速排程:凍結過去任務、以今天為底),
  //   建議才反映所有專案共用工時預算後的合理結果;純計算,不寫回雲端也不動本地 state。
  // 沒啟動日 → 排程器會整張跳過,退回讀草稿已存 schedule(募資建議 eCp 仍靠問卷日算得出)。
  const draftMiles = useMemo(() => {
    const draft = editor.draft;
    if (!draft) return undefined;
    if (draft.startDate) {
      // 既有專案:用草稿覆蓋掉那一張(避免同 id 重複);新專案(還沒 id):附加到最後
      const runProjects = draft.id
        ? projects.map((p) => (p.id === draft.id ? draft : p))
        : [...projects, draft];
      const today = pD(fmtF(new Date()));
      const frozen = collectFrozen(runProjects, (entry) => entry.start && entry.start < today);
      return runScheduleV2(runProjects, settings, { frozen, startFloor: today, members }).miles[draft.id];
    }
    return hydrateSchedule([draft], settings).miles[draft.id];
  }, [editor.draft, projects, settings, members]);

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
    return (
      <>
      <div className="proj-tabs">
      {canEdit && (
        <button className={`proj-tab ${isNew ? "active" : ""}`} onClick={() => navigate('/project/new')}>
            <i className="ti ti-plus" style={{ fontSize: 14 }}></i> 新增專案
          </button>
        )}
        </div>
    <div className="empty"><i className="ti ti-folder-plus"></i>還沒有專案，按右上「新增專案」開始</div>
    </>
  );
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
            <i className="ti ti-plus" style={{ fontSize: 14 }}></i> 新增專案
          </button>
        )}
      </div>

      {editor.draft
        ? <ProjectDetail p={editor.draft} onUpdate={editor.updateDraft} miles={draftMiles}
                         members={members}
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

function ProjectDetail({ p, onUpdate, miles, members, dirty, onSave, onArchive, onCancel, canEdit }) {
  const [exp, setExp] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const tone = getTone(p);

  // 快速排程(全域):跑 schedulerV2 產生任務排程並凍結寫回。資料在用到的這層直接取 context。
  const { quickSchedule } = useWorkspace();
  // 成員清單由上層 ProjectPage 傳入(同頁 draftMiles 也要用,免得重複打 RPC)。
  // 未指派的任務預設就顯示 owner(負責人);owner 也是「未指派 = 讀作 owner」的落點。
  const ownerId = members.find((member) => member.role === 'owner')?.user_id ?? null;
  const [scheduling, setScheduling] = useState(false);
  const [confirmSchedule, setConfirmSchedule] = useState(false);

  // 使用者目前希望系統自動整理:存檔成功後自動快速排程一次。
  // 用 flag + effect 延到「projects 更新到最新版本」之後才排——若直接串在 onSave 後面,
  // quickSchedule 會拿到存檔前的舊版號/舊資料,重排剛存的那張會被樂觀鎖擋掉。
  const [pendingAutoSchedule, setPendingAutoSchedule] = useState(false);
  useEffect(() => {
    if (!pendingAutoSchedule) return;
    setPendingAutoSchedule(false);
    setScheduling(true);
    quickSchedule()
      .catch((e) => console.error("自動快速排程失敗", e))
      .finally(() => setScheduling(false));
  }, [pendingAutoSchedule, quickSchedule]);

  const enabledCount = (p.tasks || []).filter((t) => t.enabled).length;
  // 未儲存/沒啟動日/沒勾任務時不能排;dirty 時要先存(排程跑的是雲端已存的資料,不是草稿)。
  const scheduleReason = !p.id ? "請先儲存專案"
    : dirty ? "請先儲存變更再快速排程"
    : !p.startDate ? "請先設定專案啟動日"
    : enabledCount === 0 ? "請先勾選至少一個任務"
    : "";

  const handleQuickSchedule = async () => {
    setConfirmSchedule(false);
    setScheduling(true);
    try { await quickSchedule(); }
    catch (e) { console.error("快速排程失敗", e); }
    finally { setScheduling(false); }
  };

  // 儲存
  const handleSave = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      await onSave();
      // 使用者目前希望系統自動整理:存檔成功才觸發自動快速排程(交給上面的 effect 執行)。
      setPendingAutoSchedule(true);
    }
    catch (e) { setSaveErr(e?.message || "儲存失敗，請稍後再試"); }
    finally { setSaving(false); }
  };

  const gr = {};
  (p.tasks || []).forEach((t) => {
    const b = BT.find((x) => x.id === t.id);
    if (!b) return;
    if (!gr[b.p]) gr[b.p] = [];
    gr[b.p].push({ ...b, enabled: t.enabled, outsourced: !!t.outsourced, assignee: t.assignee ?? null });
  });

  const tog = (id) => onUpdate({
    ...p,
    tasks: p.tasks.map((t) => t.id === id ? { ...t, enabled: !t.enabled } : t),
  });

  // PM 模式才可標為外包:排程會把任務展開成父任務(0h)+ 審核子任務(0.5h)
  const togOutsource = (id) => onUpdate({
    ...p,
    tasks: p.tasks.map((t) => t.id === id ? { ...t, outsourced: !t.outsourced } : t),
  });

  // 指派負責人:選到 owner(或空)= 未指派(讀作 owner),清掉欄位保持任務乾淨,不存冗餘 id。
  // 其餘成員存其 user_id。M1 只落地,不觸發排程。
  const setAssignee = (id, assignee) => onUpdate({
    ...p,
    tasks: p.tasks.map((t) => {
      if (t.id !== id) return t;
      const nt = { ...t };
      if (assignee && assignee !== ownerId) nt.assignee = assignee; else delete nt.assignee;
      return nt;
    }),
  });

  const totalHours = p.tasks.reduce((s, t) => {
    if (!t.enabled) return s;
    const b = BT.find((x) => x.id === t.id);
    if (!b) return s;
    // 外包任務內部只留 0.5h 審核工時,其餘外包不計入總工時
    if (t.outsourced) return s + 0.5;
    return s + (b.h || 0);
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
          {/* {canEdit && (
            <button className={styles.saveBtn}
                    onClick={() => setConfirmSchedule(true)}
                    disabled={scheduling || !!scheduleReason}
                    title={scheduleReason || "快速排程：重新計算所有專案今天以後的任務排程"}>
              <i className="ti ti-calendar-plus"></i>{scheduling ? "排程中…" : "快速排程"}
            </button>
          )} */}
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
                    <div key={t.id}>
                      <div className={`phase-row ${!t.enabled ? "disabled" : ""}`}>
                        {/* 勾選 + 文字包在 display:contents 的 label,版面不變;指派下拉放在 label 外,
                            避免點下拉時連帶觸發 label 的勾選 */}
                        <label className={styles.taskLabel}>
                          <input type="checkbox" checked={t.enabled} disabled={!canEdit} onChange={() => tog(t.id)} />
                          {p.template === "pm" && (
                            <input
                              type="checkbox"
                              className={styles.outsourceRadio}
                              checked={t.outsourced}
                              disabled={!canEdit || !t.enabled}
                              onChange={() => togOutsource(t.id)}
                              style={{ "--rc": phMeta.c }}
                            />
                          )}
                          <span className="pid">{t.id}</span>
                          <span className="pname">{t.n}</span>
                          <span className="pmeta">
                            {t.h > 0 ? `${t.h}h` : ""}
                            {t.w > 0 ? ` +${t.w}d` : ""}
                          </span>
                          {t.dl && (
                            <span className={`ptag ${t.dl}`}>{t.dl === "sv" ? "問卷前" : "開賣前"}</span>
                          )}
                          {t.ns && (
                            <span className="ptag ns">優先</span>
                          )}
                        </label>
                        {canEdit && t.enabled && (
                          <select className={styles.assigneeSelect}
                                  value={t.assignee || ownerId || ""}
                                  onChange={(e) => setAssignee(t.id, e.target.value)}>
                            {members.map((member) => (
                              <option key={member.user_id} value={member.user_id}>
                                {member.display_name || member.email}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      {t.outsourced && t.enabled && (
                        <div className={`phase-row ${styles.reviewTask}`}>
                          {p.template === "pm" && <span className={styles.outsourceRadioSpacer} />}
                          <span className="pid">{t.id}.1</span>
                          <span className="pname">(審核){t.n}</span>
                          <span className="pmeta">0.5h{t.w > 0 ? ` +${t.w}d` : ""}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={confirmSchedule}
        title="快速排程"
        message="快速排程會依各專案設定，重新計算「所有專案」今天以後的任務排程（已過去的任務不會變動）。確定要執行嗎？"
        confirmLabel="開始排程"
        onConfirm={handleQuickSchedule}
        onCancel={() => setConfirmSchedule(false)}
      />
    </div>
  );
}
