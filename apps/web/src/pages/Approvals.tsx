import { useState } from 'react';
import { App, Button, Input, Popconfirm, Skeleton, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Approval } from '../lib/api';
import { useApprovalsAll, useApprovalsPending } from '../lib/hooks';
import {
  Chip,
  Empty,
  ErrorBox,
  PageHeader,
  Panel,
  formatDateTime,
  statusChip,
} from '../components/ui';

export default function ApprovalsPage() {
  const pending = useApprovalsPending();
  const all = useApprovalsAll();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const resolve = useMutation({
    mutationFn: ({ id, approve, note }: { id: string; approve: boolean; note?: string }) =>
      api(`/api/approvals/${id}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: JSON.stringify({ note: note || undefined }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries();
      message.success(variables.approve ? 'Request approved.' : 'Request rejected.');
      setNotes((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
    },
    onError: (error: Error) => message.error(error.message),
  });

  const pendingCount = pending.data?.length ?? 0;

  const historyColumns: ColumnsType<Approval> = [
    {
      title: 'Action',
      dataIndex: 'action',
      render: (action: string) => <span className="cell-primary" style={{ fontWeight: 500 }}>{action.replace(/_/g, ' ')}</span>,
    },
    { title: 'Requester', dataIndex: 'requesterName', render: (name: string) => <span style={{ color: '#475569' }}>{name}</span> },
    { title: 'Status', dataIndex: 'status', width: 120, render: (status: string) => statusChip(status) },
    {
      title: 'Requested',
      dataIndex: 'requestedAt',
      width: 160,
      render: (value: string) => <span className="cell-secondary" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(value)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Consequential actions wait here for a human. Agents never treat their own recommendation as approval."
        extra={
          <Chip tone={pendingCount > 0 ? 'warn' : 'ok'}>
            {pendingCount > 0 ? `${pendingCount} pending` : 'Nothing pending'}
          </Chip>
        }
      />

      <div className="section-stack">
        <Panel
          title="Waiting on you"
          action={pendingCount > 0 ? <Chip tone="warn">{pendingCount} pending</Chip> : undefined}
        >
          {pending.isLoading ? (
            <Skeleton active paragraph={{ rows: 7 }} />
          ) : pending.isError ? (
            <ErrorBox error={pending.error} onRetry={() => pending.refetch()} />
          ) : pendingCount === 0 ? (
            <Empty
              title="Nothing waiting."
              hint="When TEAMFORGE needs a decision — an assignment, a deadline move, an external send — it lands here with its reason and impact."
            />
          ) : (
            (pending.data ?? []).map((approval) => {
              const approving = resolve.isPending && resolve.variables?.id === approval._id && resolve.variables?.approve;
              const rejecting = resolve.isPending && resolve.variables?.id === approval._id && !resolve.variables?.approve;

              return (
                <div className="approval-item" key={approval._id}>
                  <div className="approval-top">
                    <Space size={8} wrap>
                      <Chip tone="warn">{approval.action.replace(/_/g, ' ')}</Chip>
                      <span className="cell-secondary">
                        from {approval.requesterName} · {formatDateTime(approval.requestedAt)}
                      </span>
                    </Space>
                  </div>

                  <div className="approval-reason">{approval.reason}</div>

                  {approval.impact && (
                    <div className="approval-impact">
                      <WarningOutlined />
                      <span>{approval.impact}</span>
                    </div>
                  )}

                  <div className="approval-actions">
                    <Input
                      placeholder="Optional note for the audit log…"
                      value={notes[approval._id] ?? ''}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [approval._id]: event.target.value }))
                      }
                      style={{ maxWidth: 320 }}
                    />
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={approving}
                      onClick={() =>
                        resolve.mutate({
                          id: approval._id,
                          approve: true,
                          note: notes[approval._id],
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Popconfirm
                      title="Reject this request?"
                      description="The requester will see the rejection in the audit log."
                      okText="Reject"
                      okButtonProps={{ danger: true }}
                      onConfirm={() =>
                        resolve.mutate({
                          id: approval._id,
                          approve: false,
                          note: notes[approval._id],
                        })
                      }
                    >
                      <Button danger icon={<CloseOutlined />} loading={rejecting}>
                        Reject
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              );
            })
          )}
        </Panel>

        <Panel title="Recent history" action={<span className="panel-caption">Last 30 requests</span>}>
          {all.isLoading ? (
            <Skeleton active paragraph={{ rows: 7 }} />
          ) : all.isError ? (
            <ErrorBox error={all.error} onRetry={() => all.refetch()} />
          ) : (
            <Table
              rowKey="_id"
              columns={historyColumns}
              dataSource={(all.data ?? []).slice(0, 30)}
              pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
              scroll={{ x: 600 }}
              locale={{ emptyText: 'No approvals yet.' }}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
