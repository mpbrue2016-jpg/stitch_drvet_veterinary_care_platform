'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';

export function Tabs({
  tabs,
  label,
}: {
  tabs: Array<{ id: string; label: string; content: ReactNode }>;
  label: string;
}) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');
  const activePanel = tabs.find((tab) => tab.id === activeTab);

  if (tabs.length === 0) return null;

  return (
    <div>
      <div aria-label={label} className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`${tab.id}-panel`}
            aria-selected={tab.id === activeTab}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab.id === activeTab ? 'border-brand-green text-brand-navy' : 'border-transparent text-brand-muted hover:text-brand-ink'}`}
            id={`${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activePanel && (
        <div aria-labelledby={`${activePanel.id}-tab`} className="py-4" id={`${activePanel.id}-panel`} role="tabpanel">
          {activePanel.content}
        </div>
      )}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      aria-labelledby="modal-title"
      className="w-[min(100%-2rem,32rem)] rounded-2xl p-0 text-brand-ink shadow-2xl backdrop:bg-slate-950/40"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current.close();
      }}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold" id="modal-title">{title}</h2>
        <Button aria-label="Fechar" className="min-h-8 px-2" onClick={() => dialogRef.current?.close()} type="button" variant="ghost">
          <span aria-hidden="true">×</span>
        </Button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
