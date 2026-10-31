'use client';

import { useState } from 'react';
import { CallsDashboard } from './calls-dashboard';
import { TaskDashboard } from './task-dashboard';

export function TaskManagementPage() {
  const [tab, setTab] = useState<'tasks' | 'calls'>('tasks');
  return (
    <div className="space-y-6">
      <nav
        aria-label="Áreas de gestão"
        className="flex gap-2 rounded-xl border border-border bg-card p-2"
      >
        {(
          [
            ['tasks', 'Tarefas'],
            ['calls', 'Calls'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={`min-h-11 rounded-lg px-5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tab === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div hidden={tab !== 'tasks'}>
        <TaskDashboard />
      </div>
      {tab === 'calls' && <CallsDashboard />}
    </div>
  );
}
