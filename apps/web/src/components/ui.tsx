import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { clsx } from '../lib/clsx';

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const v = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost';
  return <button className={clsx('btn', v, className)} {...props} />;
}

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => <input className={clsx('input', className)} {...props} />;
export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={clsx('input', className)} {...props} />;

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('panel panel-pad', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {typeof title === 'string' ? <h2 className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">{title}</h2> : title}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Chip({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent'; children: ReactNode }) {
  return <span className={clsx('chip', `chip-${tone}`)}>{children}</span>;
}

export function healthChip(health: string) {
  if (health === 'on_track') return <Chip tone="ok">On track</Chip>;
  if (health === 'at_risk') return <Chip tone="warn">At risk</Chip>;
  return <Chip tone="danger">Off track</Chip>;
}

export function statusChip(status: string) {
  const map: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'> = { done: 'ok', in_progress: 'info', todo: 'neutral', blocked: 'danger', cancelled: 'neutral', active: 'info', completed: 'ok', planning: 'neutral', pending: 'warn', approved: 'ok', rejected: 'danger', superseded: 'neutral', disputed: 'danger' };
  return <Chip tone={map[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Chip>;
}

export function priorityChip(p: string) {
  const map: Record<string, 'ok' | 'warn' | 'danger' | 'neutral' | 'info'> = { low: 'neutral', medium: 'info', high: 'warn', urgent: 'danger' };
  return <Chip tone={map[p] ?? 'neutral'}>{p}</Chip>;
}

export function Drawer({ title, onClose, children, width = 460 }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full flex-col bg-[var(--color-panel)] shadow-2xl border-l border-[var(--color-line)]" style={{ width }}>
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
          <div className="text-sm font-semibold">{title}</div>
          <button className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-line)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--color-ink-2)]">{title}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-4 py-3 text-xs text-[var(--color-danger)]">
      <p className="font-semibold">Couldn't load this.</p>
      <p className="mt-1 opacity-90">{msg}</p>
      {onRetry && <button className="btn btn-ghost mt-2" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-[var(--color-accent)]" />
    </div>
  );
}

export function formatDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
export function formatDateTime(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function timeAgo(d?: string | Date | null) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
