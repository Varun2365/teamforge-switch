import { useState } from 'react';
import { Check, X, MessageSquareWarning } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useApprovalsPending, useApprovalsAll } from '../lib/hooks';
import { Panel, Chip, Button, Input, Spinner, ErrorBox, Empty, formatDateTime } from '../components/ui';

export default function ApprovalsPage() {
  const pending = useApprovalsPending();
  const all = useApprovalsAll();
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const resolve = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/api/approvals/${id}/${approve ? 'approve' : 'reject'}`, { method: 'POST', body: JSON.stringify({ note: note || undefined }) }),
    onSuccess: () => { qc.invalidateQueries(); setNote(''); },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight">Approvals</h1>
        <p className="text-[12px] text-[var(--color-ink-2)]">Consequential actions wait here for a human — agents never treat their own recommendation as approval.</p>
      </header>

      <Panel title="Waiting on you" action={pending.data?.length ? <Chip tone="warn">{pending.data.length} pending</Chip> : undefined}>
        {pending.isLoading ? <Spinner /> : pending.isError ? <ErrorBox error={pending.error} onRetry={() => pending.refetch()} /> : (
          <ul className="space-y-3">
            {(pending.data ?? []).map((a) => (
              <li key={a._id} className="rounded-xl border border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="warn">{a.action.replace(/_/g, ' ')}</Chip>
                  <span className="text-[10px] text-[var(--color-ink-3)]">from {a.requesterName} · {formatDateTime(a.requestedAt)}</span>
                </div>
                <p className="mt-2 text-[13px] font-semibold leading-snug">{a.reason}</p>
                {a.impact && <p className="mt-1 flex items-start gap-1.5 text-[11px] text-[var(--color-ink-2)]"><MessageSquareWarning size={11} className="mt-0.5 shrink-0" />{a.impact}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <Input className="max-w-xs" placeholder="Optional note for the audit log…" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button onClick={() => resolve.mutate({ id: a._id, approve: true })}><Check size={13} /> Approve</Button>
                  <Button variant="ghost" onClick={() => resolve.mutate({ id: a._id, approve: false })}><X size={13} /> Reject</Button>
                </div>
              </li>
            ))}
            {(pending.data?.length ?? 0) === 0 && <Empty title="Nothing waiting." hint="When TEAMFORGE needs a decision — an assignment, a deadline move, an external send — it lands here." />}
          </ul>
        )}
      </Panel>

      <Panel title="Recent history">
        {all.isLoading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr><th className="th">Action</th><th className="th">Requester</th><th className="th">Status</th><th className="th">When</th></tr></thead>
              <tbody>
                {(all.data ?? []).slice(0, 30).map((a) => (
                  <tr key={a._id} className="row-hover">
                    <td className="td font-medium">{a.action.replace(/_/g, ' ')}</td>
                    <td className="td text-[var(--color-ink-2)]">{a.requesterName}</td>
                    <td className="td">{a.status === 'approved' ? <Chip tone="ok">approved</Chip> : a.status === 'rejected' ? <Chip tone="danger">rejected</Chip> : <Chip tone="warn">{a.status}</Chip>}</td>
                    <td className="td font-mono text-[10px] text-[var(--color-ink-3)]">{formatDateTime(a.requestedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(all.data?.length ?? 0) === 0 && <Empty title="No approvals yet." />}
          </div>
        )}
      </Panel>
    </div>
  );
}
