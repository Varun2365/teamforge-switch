import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutList, Columns3, Plus, Check, ChevronRight } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useTasks, usePeople, keys } from '../lib/hooks';
import { Panel, Chip, Input, Select, Button, Drawer, Spinner, ErrorBox, Empty, statusChip, priorityChip, formatDate } from '../components/ui';

const KANBAN: Array<{ key: string; label: string; tone: string }> = [
  { key: 'todo', label: 'To do', tone: 'border-t-[#8a8780]' },
  { key: 'in_progress', label: 'In progress', tone: 'border-t-[#1d4ed8]' },
  { key: 'blocked', label: 'Blocked', tone: 'border-t-[#b91c1c]' },
  { key: 'done', label: 'Done', tone: 'border-t-[#15803d]' },
];

export default function TasksPage() {
  const [params] = useSearchParams();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [overdueOnly, setOverdueOnly] = useState(params.get('overdue') === 'true');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();

  const { data: tasks, isLoading, isError, error, refetch } = useTasks(overdueOnly ? { overdue: true } : {});
  const people = usePeople();

  const [form, setForm] = useState({ title: '', priority: 'medium', assigneeUserId: '', dueDate: '' });
  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.tasks() }); setCreating(false); setForm({ title: '', priority: 'medium', assigneeUserId: '', dueDate: '' }); },
  });
  const completeTask = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}/complete`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof tasks>>();
    for (const col of KANBAN) map.set(col.key, []);
    for (const t of tasks ?? []) (map.get(t.status) ?? map.set('todo', []).get('todo'))!.push(t);
    return map;
  }, [tasks]);

  const selectedTask = (tasks ?? []).find((t) => t.id === selected);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">Tasks</h1>
          <p className="text-[12px] text-[var(--color-ink-2)]">{overdueOnly ? 'Showing only overdue work' : 'Everything TEAMFORGE is tracking'}{' '}
            <button className="font-semibold text-[var(--color-accent)]" onClick={() => setOverdueOnly((v) => !v)}>{overdueOnly ? '· show all' : '· overdue only'}</button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-0.5">
            <button title="List view" className={`rounded-md p-1.5 ${view === 'list' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'text-[var(--color-ink-3)]'}`} onClick={() => setView('list')}><LayoutList size={15} /></button>
            <button title="Board view" className={`rounded-md p-1.5 ${view === 'board' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : 'text-[var(--color-ink-3)]'}`} onClick={() => setView('board')}><Columns3 size={15} /></button>
          </div>
          <Button onClick={() => setCreating((v) => !v)}><Plus size={13} /> New task</Button>
        </div>
      </header>

      {creating && (
        <form className="panel panel-pad grid gap-2 sm:grid-cols-12" onSubmit={(e) => { e.preventDefault(); if (form.title.trim().length >= 3) createTask.mutate({ title: form.title.trim(), priority: form.priority, assigneeUserId: form.assigneeUserId || undefined, dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined }); }}>
          <Input className="sm:col-span-4" placeholder="Task title…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus required />
          <Select className="sm:col-span-2" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
          <Select className="sm:col-span-3" value={form.assigneeUserId} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}>
            <option value="">Assign to…</option>
            {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input className="sm:col-span-2" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <Button type="submit" className="sm:col-span-1">Add</Button>
        </form>
      )}

      {isLoading ? <Spinner /> : isError ? <ErrorBox error={error} onRetry={() => refetch()} /> : view === 'list' ? (
        <Panel>
          <table className="w-full border-collapse">
            <thead><tr><th className="th">Task</th><th className="th">Owner</th><th className="th">Status</th><th className="th">Priority</th><th className="th">Due</th><th className="th"></th></tr></thead>
            <tbody>
              {(tasks ?? []).map((t) => (
                <tr key={t.id} className="row-hover">
                  <td className="td max-w-[420px]"><button className="text-left font-medium leading-snug hover:text-[var(--color-accent)]" onClick={() => setSelected(t.id)}>{t.title}</button></td>
                  <td className="td text-[var(--color-ink-2)]">{t.assignees?.map((a) => a.name.split(' ')[0]).join(', ') || 'unassigned'}</td>
                  <td className="td">{statusChip(t.status)}</td>
                  <td className="td">{priorityChip(t.priority)}</td>
                  <td className="td font-mono text-[11px] text-[var(--color-ink-3)]">{formatDate(t.dueDate)}</td>
                  <td className="td text-right">{t.status !== 'done' && <button title="Mark done" className="rounded-md p-1.5 text-[var(--color-ink-3)] hover:bg-[var(--color-ok-soft)] hover:text-[var(--color-ok)]" onClick={() => completeTask.mutate(t.id)}><Check size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(tasks ?? []).length === 0 && <Empty title="Nothing here." hint="Either everything's done, or say it in a room and TEAMFORGE will track it." />}
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {KANBAN.map((col) => (
            <div key={col.key} className={`rounded-xl border border-[var(--color-line)] border-t-4 bg-[var(--color-panel)] ${col.tone}`}>
              <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
                <span className="stat-label">{col.label}</span>
                <span className="font-mono text-[10px] text-[var(--color-ink-3)]">{grouped.get(col.key)?.length ?? 0}</span>
              </div>
              <ul className="scroll-thin max-h-[65vh] space-y-2 overflow-y-auto p-2">
                {(grouped.get(col.key) ?? []).map((t) => (
                  <li key={t.id}>
                    <button className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-2.5 text-left hover:border-[var(--color-accent)]" onClick={() => setSelected(t.id)}>
                      <div className="flex items-center justify-between gap-2">{priorityChip(t.priority)}<span className="font-mono text-[9px] text-[var(--color-ink-3)]">{formatDate(t.dueDate)}</span></div>
                      <p className="mt-1.5 text-[11px] font-medium leading-snug">{t.title}</p>
                      <p className="mt-1 text-[9px] text-[var(--color-ink-3)]">{t.assignees?.map((a) => a.name.split(' ')[0]).join(', ') || 'unassigned'}</p>
                    </button>
                  </li>
                ))}
                {(grouped.get(col.key)?.length ?? 0) === 0 && <li className="px-2 py-3 text-center text-[10px] text-[var(--color-ink-3)]">empty</li>}
              </ul>
            </div>
          ))}
        </div>
      )}

      {selectedTask && (
        <Drawer title={<span className="flex items-center gap-2">Task <ChevronRight size={12} /></span>} onClose={() => setSelected(null)} width={440}>
          <div className="space-y-4">
            <div>
              {statusChip(selectedTask.status)}
              <h2 className="mt-2 text-[15px] font-bold leading-snug">{selectedTask.title}</h2>
              {selectedTask.description && <p className="mt-1 text-[12px] text-[var(--color-ink-2)]">{selectedTask.description}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--color-ink-3)]">
                <span>Priority {selectedTask.priority}</span><span>·</span><span>Due {formatDate(selectedTask.dueDate)}</span>
                {selectedTask.assignees?.length ? <><span>·</span><span>Assigned to {selectedTask.assignees.map((a) => a.name).join(', ')}</span></> : <><span>·</span><span>Unassigned</span></>}
              </div>
            </div>
            <Button variant="ghost" onClick={() => { completeTask.mutate(selectedTask.id); setSelected(null); }}><Check size={13} /> Mark done</Button>
          </div>
        </Drawer>
      )}
    </div>
  );
}
