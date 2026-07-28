"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody, Button } from '@/design-system';
import { IndexedDBEngine } from '@/lib/database/local/IndexedDBEngine';
import { ConnectivityMonitor } from '@/lib/database/sync/ConnectivityMonitor';
import { SyncEngine, SyncQueueItem } from '@/lib/database/sync/SyncEngine';
import { STORES } from '@/lib/database/local/schema';
import { DB_VERSION } from '@/lib/database/local/migrations';

export const OfflineDebugPanel: React.FC = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [storeCounts, setStoreCounts] = useState<Record<string, number>>({});
  const [storageUsage, setStorageUsage] = useState<string>('Unknown');
  const [lastSync, setLastSync] = useState<string>('Never');
  const [activeSync, setActiveSync] = useState<string>('Idle');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStats = async () => {
    setIsRefreshing(true);
    try {
      const engine = IndexedDBEngine.getInstance();
      
      // Get counts for each store
      const counts: Record<string, number> = {};
      for (const store of STORES) {
        try {
          const records = await engine.getAll(store.name);
          counts[store.name] = records.length;
        } catch {
          counts[store.name] = 0;
        }
      }
      setStoreCounts(counts);

      // Get sync queue details
      try {
        const queue = await engine.getAll<SyncQueueItem>('sync_queue');
        setQueueCount(queue.length);
        const processing = queue.find(q => q.syncStatus === 'PROCESSING');
        setActiveSync(processing ? `Processing: ${processing.operationType} on ${processing.module}` : 'Idle');
        
        const lastAttemptItem = [...queue]
          .filter(q => q.lastAttempt)
          .sort((a, b) => b.lastAttempt!.localeCompare(a.lastAttempt!))[0];
        
        if (lastAttemptItem?.lastAttempt) {
          setLastSync(new Date(lastAttemptItem.lastAttempt).toLocaleTimeString());
        }
      } catch {
        setQueueCount(0);
      }

      // Storage Estimate
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined && estimate.quota !== undefined) {
          const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
          const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(0);
          setStorageUsage(`${usageMB} MB / ${quotaMB} MB`);
        }
      }
    } catch (err) {
      console.error('Failed to load debug statistics:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const monitor = ConnectivityMonitor.getInstance();
    const unsubscribe = monitor.subscribe((online) => {
      setIsOnline(online);
      refreshStats();
    });

    const interval = setInterval(refreshStats, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const triggerForceSync = () => {
    SyncEngine.getInstance().triggerSync();
    refreshStats();
  };

  return (
    <Card className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-lg p-4 space-y-4">
      <CardHeader className="flex items-center justify-between border-b border-[var(--color-border)]/50 pb-2">
        <span className="text-xs uppercase tracking-widest font-extrabold text-[var(--color-text-muted)] flex items-center gap-2">
          🛠️ Offline & Database Debugger
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refreshStats} isLoading={isRefreshing}>
            Refresh
          </Button>
          <Button size="sm" variant="primary" onClick={triggerForceSync}>
            Force Sync
          </Button>
        </div>
      </CardHeader>

      <CardBody className="space-y-3.5 text-xs">
        {/* Status Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] p-2 rounded-lg text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Network</div>
            <div className={`text-xs font-bold mt-1 ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
              {isOnline ? '🟢 Online' : '🔴 Offline'}
            </div>
          </div>
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] p-2 rounded-lg text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">DB Version</div>
            <div className="text-xs font-mono font-bold mt-1 text-[var(--color-text-main)]">
              v{DB_VERSION}
            </div>
          </div>
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] p-2 rounded-lg text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Sync Queue</div>
            <div className={`text-xs font-bold mt-1 ${queueCount > 0 ? 'text-amber-500 font-mono' : 'text-[var(--color-text-muted)]'}`}>
              {queueCount} Pending
            </div>
          </div>
          <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] p-2 rounded-lg text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">Storage usage</div>
            <div className="text-[10px] font-semibold mt-1 truncate text-[var(--color-text-main)]" title={storageUsage}>
              {storageUsage}
            </div>
          </div>
        </div>

        {/* Sync Detail Log */}
        <div className="bg-[var(--color-bg-base)] border border-[var(--color-border)] p-2.5 rounded-lg space-y-1">
          <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
            <span>Last Attempt</span>
            <span>Active Worker</span>
          </div>
          <div className="flex justify-between font-mono text-[11px] text-[var(--color-text-main)]">
            <span>{lastSync}</span>
            <span>{activeSync}</span>
          </div>
        </div>

        {/* Store Record Counts */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-[var(--color-border)]/20">
            Local Object Stores
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--color-text-main)]">
            {STORES.map(store => (
              <div key={store.name} className="flex justify-between py-0.5 border-b border-[var(--color-border)]/10 last:border-b-0">
                <span className="text-[var(--color-text-muted)]">{store.name}</span>
                <span className="font-bold">{storeCounts[store.name] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
export default OfflineDebugPanel;
