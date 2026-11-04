import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { fetchWorkspace } from "../lib/contract";
import { CONFIG } from "../lib/config";
import { decodeError } from "../lib/format";
import type { Schedule, Workspace } from "../lib/types";

type WorkspaceContextValue = {
  workspace: Workspace | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  lastSyncedAt: Date | null;
  refresh: () => Promise<void>;
  scheduleById: (id: string) => Schedule | undefined;
  tokenByAddress: (address: string) => Workspace["tokens"][number] | undefined;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const next = await fetchWorkspace();
      setWorkspace(next);
      setError("");
      setLastSyncedAt(new Date());
    } catch (cause) {
      setError(decodeError(cause));
    } finally {
      busy.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, CONFIG.refreshMs);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      loading,
      refreshing,
      error,
      lastSyncedAt,
      refresh,
      scheduleById: (id: string) =>
        workspace?.schedules.find((schedule) => schedule.id.toString() === id),
      tokenByAddress: (address: string) =>
        workspace?.tokens.find(
          (token) => token.address.toLowerCase() === address.toLowerCase(),
        ),
    }),
    [workspace, loading, refreshing, error, lastSyncedAt, refresh],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
