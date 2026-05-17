import { useState, useMemo, useCallback } from 'react';
import { runSchedule } from './lib/scheduler.js';
import { mkTasks } from './lib/scheduler.js';
import { D_PROJECTS, D_SETTINGS, TONE_PALETTE, ACCENT_PALETTES, TWEAK_DEFAULTS } from './constants.js';
import { usePersistence } from './hooks/usePersistence.js';
import { useTheme } from './hooks/useTheme.js';
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle } from './tweaks-panel.jsx';
import { Rail } from './components/Rail.jsx';
import { Topbar } from './components/Topbar.jsx';
import { ConfirmModal } from './components/ConfirmModal.jsx';
import { Dashboard } from './views/Dashboard.jsx';
import { Gantt } from './views/Gantt.jsx';
import { ProjectPage } from './views/ProjectPage.jsx';
import { KOLPage } from './views/KOLPage.jsx';
import { SettingsPage } from './views/SettingsPage.jsx';

export default function App() {
  const [view, setView] = useState("dashboard");
  const [sel, setSel] = useState("saba");
  const [t, setT] = useTweaks(TWEAK_DEFAULTS);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { projects, setProjects, settings, setSettings, loaded } =
    usePersistence(D_PROJECTS, D_SETTINGS);

  useTheme(t);

  const { sch, miles } = useMemo(() => {
    try { return runSchedule(projects, settings); }
    catch (e) { console.error("schedule error", e); return { sch: {}, miles: {} }; }
  }, [projects, settings]);

  const updateProject = (updated) =>
    setProjects((v) => v.map((p) => p.id === updated.id ? updated : p));

  const updateTaskPin = useCallback((pid, taskId, pinnedStart) => {
    setProjects((v) => v.map((p) => {
      if (p.id !== pid) return p;
      return {
        ...p,
        tasks: p.tasks.map((t) =>
          t.id === taskId
            ? { ...t, pinnedStart: pinnedStart || undefined }
            : t
        ),
      };
    }));
  }, []);

  const addProject = () => {
    const id = `p${Date.now()}`;
    const tone = TONE_PALETTE[projects.length % TONE_PALETTE.length];
    setProjects((v) => [...v, {
      id, name: "新專案", template: "full", mode: "forward",
      startDate: "", surveyStart: "", surveyEnd: "",
      campaignStart: "", campaignEnd: "",
      tone, tasks: mkTasks("full"), kols: [], notes: "",
    }]);
    setSel(id);
    setView("project");
  };

  const deleteProject = useCallback((id) => {
    setDeleteTarget(id);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    setProjects((v) => v.filter((p) => p.id !== deleteTarget));
    if (sel === deleteTarget && projects.length > 1) setSel(projects[0].id);
    setDeleteTarget(null);
  }, [deleteTarget, sel, projects]);

  if (!loaded) {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>載入中…</div>;
  }

  return (
    <div className="app" data-screen-label={"00 " + view}>
      <Rail view={view} onNavigate={setView} />

      <main className="main">
        <Topbar projectCount={projects.length} showAvatar={t.showAvatar} />

        {view === "dashboard" && (
          <Dashboard
            projects={projects} data={sch} miles={miles}
            onAddProject={addProject} onJump={() => setView("gantt")}
          />
        )}
        {view === "gantt" && <Gantt projects={projects} data={sch} onPinUpdate={updateTaskPin} />}
        {view === "project" && (
          <ProjectPage
            projects={projects} sel={sel} setSel={setSel}
            onUpdate={updateProject} miles={miles}
            onAdd={addProject} onDelete={deleteProject}
          />
        )}
        {view === "kol" && <KOLPage projects={projects} onUpdate={updateProject} />}
        {view === "settings" && <SettingsPage settings={settings} onUpdate={setSettings} />}
      </main>

      <TweaksPanel title="Tweaks" defaultOpen={false}>
        <TweakSection title="外觀">
          <TweakColor label="主色調" value={t.accent}
            onChange={(v) => setT("accent", v)} options={ACCENT_PALETTES} />
          <TweakRadio label="密度" value={t.density}
            onChange={(v) => setT("density", v)}
            options={[{ label: "舒適", value: "comfortable" }, { label: "緊湊", value: "compact" }]} />
          <TweakToggle label="背景漸層光暈" value={t.ambient} onChange={(v) => setT("ambient", v)} />
          <TweakToggle label="顯示頭像" value={t.showAvatar} onChange={(v) => setT("showAvatar", v)} />
        </TweakSection>
      </TweaksPanel>

      <ConfirmModal
        open={!!deleteTarget}
        title="刪除專案"
        message={`確定要刪除「${(projects.find((p) => p.id === deleteTarget) || {}).name || ""}」嗎？此操作無法復原。`}
        confirmLabel="確定刪除"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
