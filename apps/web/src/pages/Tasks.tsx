import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreOutlined,
  BarsOutlined,
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { api, type Task } from '../lib/api';
import { keys, usePeople, useTasks } from '../lib/hooks';
import {
  Drawer,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  formatDate,
  initials,
  priorityChip,
  statusChip,
} from '../components/ui';

const KANBAN = [
  { key: 'todo', label: 'To do', color: '#94a3b8' },
  { key: 'in_progress', label: 'In progress', color: '#1677ff' },
  { key: 'blocked', label: 'Blocked', color: '#dc2626' },
  { key: 'done', label: 'Done', color: '#16a34a' },
];

interface TaskFormValues {
  title: string;
  priority: string;
  assigneeUserId?: string;
  dueDate?: Dayjs;
}

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [selected, setSelected] = useState<string | null>(null);
  const [form] = Form.useForm<TaskFormValues>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const overdueOnly = params.get('overdue') === 'true';
  const creating = params.get('new') === 'true';

  function setParam(key: string, on: boolean) {
    const next = new URLSearchParams(params);
    if (on) next.set(key, 'true');
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const tasks = useTasks(overdueOnly ? { overdue: true } : {});
  const people = usePeople();

  const createTask = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.tasks() });
      message.success('Task created.');
      setParam('new', false);
      form.resetFields();
    },
    onError: (error: Error) => message.error(error.message),
  });

  const completeTask = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}/complete`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      message.success('Task marked done.');
    },
    onError: (error: Error) => message.error(error.message),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const column of KANBAN) map.set(column.key, []);
    for (const task of tasks.data ?? []) {
      const list = map.get(task.status) ?? map.get('todo');
      list?.push(task);
    }
    return map;
  }, [tasks.data]);

  const selectedTask = (tasks.data ?? []).find((task) => task.id === selected);

  function submit(values: TaskFormValues) {
    if (!values.title?.trim() || values.title.trim().length < 3) return;
    createTask.mutate({
      title: values.title.trim(),
      priority: values.priority,
      assigneeUserId: values.assigneeUserId || undefined,
      dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
    });
  }

  const columns: ColumnsType<Task> = [
    {
      title: 'Task',
      dataIndex: 'title',
      render: (title: string, task) => (
        <div>
          <div className="cell-primary" style={{ fontWeight: 500 }}>
            {title}
          </div>
          {task.description && (
            <div className="cell-secondary" style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Owner',
      dataIndex: 'assignees',
      width: 180,
      render: (assignees: Task['assignees']) =>
        assignees && assignees.length > 0 ? (
          <Space size={6}>
            {assignees.slice(0, 2).map((assignee) => (
              <Avatar
                key={assignee.userId}
                size={22}
                style={{ background: '#eef5ff', color: '#1677ff', fontSize: 9, fontWeight: 600 }}
              >
                {initials(assignee.name)}
              </Avatar>
            ))}
            <span style={{ fontSize: 12, color: '#475569' }}>
              {assignees.map((assignee) => assignee.name.split(' ')[0]).join(', ')}
            </span>
          </Space>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            Unassigned
          </span>
        ),
    },
    { title: 'Status', dataIndex: 'status', width: 124, render: (status: string) => statusChip(status) },
    { title: 'Priority', dataIndex: 'priority', width: 104, render: (priority: string) => priorityChip(priority) },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      width: 100,
      render: (dueDate: string | null, task) => {
        const overdue = dueDate && task.status !== 'done' && new Date(dueDate).getTime() < Date.now();
        return (
          <span className="cell-secondary" style={overdue ? { color: '#dc2626', fontWeight: 600 } : { whiteSpace: 'nowrap' }}>
            {formatDate(dueDate)}
          </span>
        );
      },
    },
    {
      title: '',
      width: 56,
      render: (_value, task) =>
        task.status !== 'done' ? (
          <Tooltip title="Mark done">
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              loading={completeTask.isPending && completeTask.variables === task.id}
              onClick={(event) => {
                event.stopPropagation();
                completeTask.mutate(task.id);
              }}
              aria-label={`Mark ${task.title} done`}
            />
          </Tooltip>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything TEAMFORGE is tracking, with owners, status and due dates. Switch between a scannable list and a board."
        extra={
          <Space size={8} wrap>
            <Segmented
              value={overdueOnly ? 'overdue' : 'all'}
              onChange={(value) => setParam('overdue', value === 'overdue')}
              options={[
                { label: 'All work', value: 'all' },
                { label: 'Overdue', value: 'overdue' },
              ]}
            />
            <Segmented
              value={view}
              onChange={(value) => setView(value as 'list' | 'board')}
              options={[
                { value: 'list', label: <span><BarsOutlined style={{ marginInlineEnd: 5 }} />List</span> },
                { value: 'board', label: <span><AppstoreOutlined style={{ marginInlineEnd: 5 }} />Board</span> },
              ]}
            />
            <Button
              type={creating ? 'default' : 'primary'}
              icon={creating ? <CloseOutlined /> : <PlusOutlined />}
              onClick={() => setParam('new', !creating)}
            >
              {creating ? 'Close' : 'New task'}
            </Button>
          </Space>
        }
      />

      <div className="section-stack">
        {creating && (
          <Card
            className="tf-card"
            title="New task"
            extra={
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => setParam('new', false)} aria-label="Close new task form" />
            }
          >
            <Form form={form} layout="vertical" onFinish={submit} initialValues={{ priority: 'medium' }} requiredMark={false}>
              <Row gutter={12}>
                <Col xs={24} lg={9}>
                  <Form.Item
                    name="title"
                    label="Task title"
                    rules={[{ required: true, min: 3, message: 'Give the task a title of at least 3 characters.' }]}
                  >
                    <Input placeholder="What needs to happen?" autoFocus />
                  </Form.Item>
                </Col>
                <Col xs={12} lg={3}>
                  <Form.Item name="priority" label="Priority">
                    <Select
                      options={['low', 'medium', 'high', 'urgent'].map((priority) => ({
                        value: priority,
                        label: priority[0]!.toUpperCase() + priority.slice(1),
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} lg={5}>
                  <Form.Item name="assigneeUserId" label="Assignee">
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Unassigned"
                      options={(people.data ?? []).map((person) => ({ value: person.id, label: person.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} lg={4}>
                  <Form.Item name="dueDate" label="Due date">
                    <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" suffixIcon={<CalendarOutlined />} />
                  </Form.Item>
                </Col>
                <Col xs={12} lg={3} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                  <Button type="primary" htmlType="submit" block loading={createTask.isPending}>
                    Create
                  </Button>
                </Col>
              </Row>
            </Form>
          </Card>
        )}

        {tasks.isError ? (
          <ErrorBox error={tasks.error} onRetry={() => tasks.refetch()} />
        ) : view === 'list' ? (
          <Panel flush>
            <Table
              rowKey="id"
              columns={columns}
              dataSource={tasks.data ?? []}
              loading={tasks.isLoading}
              pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
              scroll={{ x: 860 }}
              onRow={(task) => ({
                onClick: () => setSelected(task.id),
                onKeyDown: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(task.id);
                  }
                },
                className: 'clickable-row',
                tabIndex: 0,
              })}
              locale={{
                emptyText: (
                  <Empty
                    title="Nothing here."
                    hint="Either everything is done, or say it in a room and TEAMFORGE will track it here."
                  />
                ),
              }}
            />
          </Panel>
        ) : (
          <div className="board">
            {KANBAN.map((column) => {
              const items = grouped.get(column.key) ?? [];
              return (
                <div className="board-column" key={column.key}>
                  <div className="board-head">
                    <span className="board-head-title">
                      <span className="board-dot" style={{ background: column.color }} />
                      {column.label}
                    </span>
                    <span className="board-count">{items.length}</span>
                  </div>
                  <div className="board-body">
                    {items.length === 0 && <div className="board-empty">No tasks</div>}
                    {items.map((task) => (
                      <div
                        key={task.id}
                        className="task-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(task.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') setSelected(task.id);
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          {priorityChip(task.priority)}
                          <span className="cell-secondary">{formatDate(task.dueDate)}</span>
                        </div>
                        <p className="task-card-title">{task.title}</p>
                        <div className="task-card-foot">
                          <span>
                            {task.assignees?.map((assignee) => assignee.name.split(' ')[0]).join(', ') || 'Unassigned'}
                          </span>
                          {statusChip(task.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTask && (
        <Drawer title="Task detail" onClose={() => setSelected(null)} width={480}>
          <div className="section-stack" style={{ gap: 18 }}>
            <div>
              <Space size={6} wrap>
                {statusChip(selectedTask.status)}
                {priorityChip(selectedTask.priority)}
              </Space>
              <h2 className="detail-title" style={{ marginTop: 10 }}>
                {selectedTask.title}
              </h2>
              {selectedTask.description && (
                <p className="detail-subtitle" style={{ marginTop: 6 }}>
                  {selectedTask.description}
                </p>
              )}
              <div className="detail-meta">
                <span>
                  <CalendarOutlined />
                  Due {formatDate(selectedTask.dueDate)}
                </span>
                <span>
                  {selectedTask.assignees?.length
                    ? `Assigned to ${selectedTask.assignees.map((assignee) => assignee.name).join(', ')}`
                    : 'Unassigned'}
                </span>
              </div>
              {selectedTask.category && (
                <Tag variant="filled" style={{ marginTop: 10, marginInlineEnd: 0 }}>
                  {selectedTask.category}
                </Tag>
              )}
            </div>

            <div className="soft-divider" style={{ margin: 0 }} />

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={selectedTask.status === 'done'}
                loading={completeTask.isPending && completeTask.variables === selectedTask.id}
                onClick={() => {
                  completeTask.mutate(selectedTask.id, {
                    onSuccess: () => setSelected(null),
                  });
                }}
              >
                {selectedTask.status === 'done' ? 'Completed' : 'Mark done'}
              </Button>
              <Button onClick={() => setSelected(null)}>Close</Button>
            </div>

            <div className="cell-secondary">
              Created tasks are recorded in organizational memory and stay traceable to this workspace.
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}
