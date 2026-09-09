import { useCallback, useEffect, useRef, useState } from 'react';
import type { Challenge, ChallengeFeed } from '@/lib/walky/challenges';
import type { WalkStatus } from '@/lib/walky/dates';

const SEEN_KEY = 'walky-celebrated-rewards';
export function useStreaker(
  connected: boolean,
  status: WalkStatus,
  onWalkStatus: (status: WalkStatus) => void,
  setConnected: (value: boolean) => void,
) {
  const [data, setData] = useState<ChallengeFeed | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [celebration, setCelebration] = useState<Challenge | null>(null);
  const seen = useRef(new Set<string>());
  const generation = useRef(0),
    readNumber = useRef(0),
    mutating = useRef(false);
  useEffect(() => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      if (Array.isArray(ids))
        seen.current = new Set(
          ids.filter((id): id is string => typeof id === 'string'),
        );
    } catch {
      /* A blocked storage setting should not block a celebration. */
    }
  }, []);
  const apply = useCallback((feed: ChallengeFeed) => {
    setData(feed);
    setError('');
    setCelebration((current) => {
      const ready = feed.challenges.filter(
        (c) => c.unlocked && !c.claimedAt && !seen.current.has(c.id),
      );
      return ready.find((c) => c.id === current?.id) ?? ready[0] ?? null;
    });
  }, []);
  const refresh = useCallback(async () => {
    if (!connected || mutating.current) return;
    const version = generation.current,
      read = ++readNumber.current;
    try {
      const response = await fetch('/api/challenges', { cache: 'no-store' });
      const feed = await response.json();
      if (version !== generation.current || read !== readNumber.current) return;
      if (response.status === 401 || response.status === 403) {
        setConnected(false);
        return;
      }
      if (!response.ok)
        throw new Error(feed.error || 'Could not load your challenges.');
      apply(feed);
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error ? e.message : 'Could not load your challenges.',
        );
    }
  }, [connected, setConnected, apply]);
  const walkDates = status.dates.join(',');
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    if (!connected) return;
    const onFocus = () => {
      void refresh();
    };
    const initial = setTimeout(onFocus, 0);
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    window.addEventListener('focus', onFocus);
    return () => {
      invalidate();
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [connected, refresh, walkDates, status.today, invalidate]);
  const action = async (
    path: string,
    method: 'POST' | 'DELETE',
    body?: unknown,
  ) => {
    if (!connected || mutating.current)
      throw new Error('Wait for the current change to finish.');
    mutating.current = true;
    const version = ++generation.current;
    setBusy(path);
    setError('');
    try {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const feed = await response.json();
      if (response.status === 401 || response.status === 403)
        setConnected(false);
      if (!response.ok)
        throw new Error(feed.error || 'Could not save that change.');
      if (version === generation.current) {
        apply(feed);
        if (feed.walkStatus) onWalkStatus(feed.walkStatus);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that change.');
      throw e;
    } finally {
      mutating.current = false;
      setBusy('');
    }
  };
  const dismissCelebration = () => {
    if (celebration) {
      seen.current.add(celebration.id);
      try {
        localStorage.setItem(
          SEEN_KEY,
          JSON.stringify([...seen.current].slice(-200)),
        );
      } catch {
        /* Optional preference. */
      }
    }
    setCelebration(null);
  };
  return {
    data: connected ? data : null,
    celebration: connected ? celebration : null,
    error,
    busy,
    action,
    refresh,
    dismissCelebration,
  };
}

export type StreakerModel = ReturnType<typeof useStreaker>;
