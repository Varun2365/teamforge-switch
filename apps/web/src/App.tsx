import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import OverviewPage from './pages/Overview';
import PeoplePage from './pages/People';
import GraphPage from './pages/Graph';
import ProjectsPage from './pages/Projects';
import TasksPage from './pages/Tasks';
import MemoryPage from './pages/Memory';
import ApprovalsPage from './pages/Approvals';
import AgentsPage from './pages/Agents';
import SettingsPage from './pages/Settings';
import ScheduledPage from './pages/Scheduled';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/people/:id" element={<PeoplePage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/scheduled" element={<ScheduledPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
