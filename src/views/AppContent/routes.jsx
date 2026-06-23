import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext.jsx';
import { Dashboard } from './Dashboard.jsx';
import { Gantt } from './Gantt.jsx';
import { KOLPage } from './KOLPage.jsx';
import { SettingsPage } from './SettingsPage.jsx';

// 各頁的 route 接點

export function DashboardRoute() {
  const { projects, sch, miles } = useWorkspace();
  const navigate = useNavigate();
  return <Dashboard projects={projects} data={sch} miles={miles} onJump={() => navigate('/gantt')} />;
}

export function GanttRoute() {
  const { projects, sch, settings, updateTaskPin } = useWorkspace();
  return <Gantt projects={projects} data={sch} onPinUpdate={updateTaskPin} settings={settings} />;
}

export function KOLRoute() {
  const { projects, updateProject } = useWorkspace();
  return <KOLPage projects={projects} onUpdate={updateProject} />;
}

export function SettingsRoute() {
  const { settings, setSettings } = useWorkspace();
  return <SettingsPage settings={settings} onUpdate={setSettings} />;
}
