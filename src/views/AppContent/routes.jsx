import { useWorkspace } from '../../context/WorkspaceContext.jsx';
import { Dashboard } from './Dashboard/index.jsx';
import { Gantt } from './Gantt.jsx';
import { KOLPage } from './KOLPage/index.jsx';
import { SettingsPage } from './SettingsPage/index.jsx';

// 各頁的 route 接點

export function DashboardRoute() {
  // Dashboard 自行從 context 取 projects/排程/里程碑與雲端儲存(比照 KOLPage / SettingsPage)。
  return <Dashboard />;
}

export function GanttRoute() {
  const { projects, sch, settings, updateTaskPin } = useWorkspace();
  return <Gantt projects={projects} data={sch} onPinUpdate={updateTaskPin} settings={settings} />;
}

export function KOLRoute() {
  // KOLPage 自行從 context 取 projects 與雲端儲存(比照 ProjectPage / SettingsPage)。
  return <KOLPage />;
}

export function SettingsRoute() {
  // SettingsPage 自行從 context 取設定/偏好與雲端儲存(比照 ProjectPage)。
  return <SettingsPage />;
}
