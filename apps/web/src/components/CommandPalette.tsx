import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Modal } from 'antd';
import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { NAV_ENTRIES, QUICK_ACTIONS, type NavEntry } from '../lib/nav';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const items = useMemo(() => [...QUICK_ACTIONS, ...NAV_ENTRIES], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      `${item.label} ${item.description} ${item.keywords} ${item.group ?? ''}`.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const el = document.getElementById(`command-item-${active}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(item: NavEntry) {
    navigate(item.path);
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[active];
      if (item) choose(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={580}
      style={{ top: 88 }}
      className="command-modal"
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      <div className="command-search">
        <Input
          variant="borderless"
          prefix={<SearchOutlined />}
          placeholder="Jump to a page or action…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          allowClear
        />
      </div>

      <div className="command-list" role="listbox" aria-label="Dashboard navigation">
        {filtered.length === 0 && <div className="command-empty">No page or action matches “{query}”.</div>}
        {filtered.map((item, index) => {
          const showGroup = index === 0 || filtered[index - 1]?.group !== item.group;
          return (
            <div key={`${item.group}-${item.path}-${item.label}`}>
              {showGroup && <div className="command-group-label">{item.group}</div>}
              <div
                id={`command-item-${index}`}
                role="option"
                aria-selected={index === active}
                className={`command-item${index === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
              >
                <span className="command-item-icon">{item.icon}</span>
                <span className="command-item-copy">
                  <span className="command-item-title">{item.label}</span>
                  <span className="command-item-hint" style={{ display: 'block' }}>
                    {item.description}
                  </span>
                </span>
                {index === active ? <RightOutlined style={{ fontSize: 11, color: '#8a97a8' }} /> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="command-footer">
        <span>
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> navigate
        </span>
        <span>
          <span className="kbd">↵</span> open
        </span>
        <span>
          <span className="kbd">esc</span> close
        </span>
      </div>
    </Modal>
  );
}
