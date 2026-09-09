'use client';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Footprints,
  CalendarDays,
  Link2,
  Settings2,
  Check,
  Heart,
  RotateCcw,
  Sparkles,
  Flame,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { dayInZone, summarize, type WalkStatus } from '@/lib/walky/dates';
import CalendarView from '@/components/walky/calendar-view';
import Settings from '@/components/walky/settings';
import WalkButtonIcon from '@/components/walky/walk-button-icon';
import Streaker, { RewardCelebration } from '@/components/walky/streaker';
import { useStreaker } from '@/components/walky/use-streaker';
import { loadPhysics } from '@/lib/walky/physics';
const loadPaperChain = () => import('@/components/walky/paper-chain');
const PaperChain = lazy(loadPaperChain);
const STARTER_LINKS = 3;
const EMPTY = () =>
  summarize([], dayInZone('America/Chicago'), 'America/Chicago');
export default function Home() {
  const [status, setStatus] = useState<WalkStatus>(EMPTY),
    [connected, setConnected] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [settings, setSettings] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [view, setView] = useState('button'),
    [chainVisited, setChainVisited] = useState(false),
    [pulse, setPulse] = useState(0),
    [demo, setDemo] = useState(0);
  const streaker = useStreaker(connected, status, setStatus, setConnected);
  const live = useRef({ status, connected });
  live.current = { status, connected };
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/status');
      const data = await r.json();
      if (r.status === 401 || r.status === 403) {
        setConnected(false);
        return;
      }
      if (!r.ok) throw new Error(data.error);
      setStatus(data);
      setConnected(true);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Cannot reach Walky. Check your connection.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
    const saved = localStorage.getItem('walky-view');
    if (['button', 'calendar', 'chain', 'streaker'].includes(saved || '')) {
      setView(saved!);
      setChainVisited(saved === 'chain');
    }
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);
  useEffect(() => {
    // Warm the large scene modules after the first screen can paint.
    const warm = () => {
      void Promise.allSettled([loadPaperChain(), loadPhysics()]);
    };
    if ('requestIdleCallback' in window) {
      const idle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(warm, 1200);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const change = useCallback(async (date: string, remove = false) => {
    if (!live.current.connected) {
      setSettings(true);
      throw new Error('Connect your calendar first.');
    }
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/walks', {
        method: remove ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setStatus(data);
      setPulse((n) => n + 1);
      if (!remove) {
        setDemo(0);
        navigator.vibrate?.([35, 40, 35]);
      }
      setToast(
        remove ? 'Walk removed. Easy fix.' : 'One walk. Two happy humans.',
      );
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      throw e;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);
  const log = () => {
    if (!connected) {
      setSettings(true);
      return;
    }
    if (!status.walkedToday) void change(status.today).catch(() => {});
  };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: 'next_reward',
        description:
          'Read the next private team reward and progress, or null if none exists. Requires a connected browser.',
        annotations: { readOnlyHint: true },
        execute: async () => {
          const response = await fetch('/api/rewards/next', {
            cache: 'no-store',
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          return data;
        },
      },
      {
        name: 'walk_status',
        description: 'Read the shared walking status.',
        annotations: { readOnlyHint: true },
        execute: async () => {
          const r = await fetch('/api/status');
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          setStatus(data);
          return data;
        },
      },
      {
        name: 'log_walk',
        description: 'Record our walk today. Repeated calls count once.',
        annotations: { readOnlyHint: false },
        execute: async (input: unknown) => {
          if (input && Object.keys(input as object).length)
            throw new Error('This tool takes no arguments.');
          return change(live.current.status.today);
        },
      },
    ]) {
      try {
        Promise.resolve(
          context.registerTool(
            {
              ...tool,
              inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            },
            { signal: lifecycle.signal },
          ),
        ).catch(() => {});
      } catch {
        /* Unsupported experimental browser API. */
      }
    }
    return () => lifecycle.abort();
  }, [change]);
  const dateText = new Date(status.today + 'T12:00:00').toLocaleDateString(
    'en-US',
    { weekday: 'long', month: 'long', day: 'numeric' },
  );
  const chainLinks = STARTER_LINKS + status.total;
  return (
    <main className="walky-app">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Walky home">
          walky<span>✳</span>
        </a>
        <span className="household">
          <Heart size={15} /> Just the two of us
        </span>
        <button
          className="icon-button"
          aria-label="Settings and connections"
          onClick={() => setSettings(true)}
        >
          <Settings2 size={22} />
        </button>
      </header>
      <Tabs
        value={!connected && view === 'streaker' ? 'button' : view}
        onValueChange={(v) => {
          setView(String(v));
          localStorage.setItem('walky-view', String(v));
          if (v === 'chain') setChainVisited(true);
        }}
        className="home-tabs"
      >
        <div className="topline">
          <span className="eyebrow">{dateText.toUpperCase()}</span>
          <TabsList
            className={`view-switch ${connected ? 'has-streaker' : ''}`}
            aria-label="Home view"
          >
            <TabsTrigger value="button">
              <Footprints size={16} /> Button
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays size={16} /> Calendar
            </TabsTrigger>
            <TabsTrigger value="chain">
              <Link2 size={16} /> Chain
            </TabsTrigger>
            {connected && (
              <TabsTrigger value="streaker">
                <Flame size={16} /> Streaker
              </TabsTrigger>
            )}
          </TabsList>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={refresh}>Try again</button>
          </div>
        )}
        <TabsContent value="button" keepMounted>
          <section className="button-view">
            <div className="daily-heading">
              <span className="date-label">OUR DAILY DOSE OF OUTSIDE</span>
              <h1>
                {status.walkedToday ? 'Look at us go.' : 'Did we walk today?'}
              </h1>
              <p>A little fresh air. A little time together.</p>
            </div>
            <button
              className={'walk-button ' + (status.walkedToday ? 'is-done' : '')}
              onClick={log}
              disabled={busy || loading || status.walkedToday}
              aria-busy={busy}
              aria-label={
                busy
                  ? 'Saving our walk'
                  : status.walkedToday
                    ? 'Walk logged for today'
                    : 'Log our walk today'
              }
            >
              <WalkButtonIcon done={status.walkedToday} />
            </button>
            <div className="under-button">
              {status.walkedToday ? (
                <button
                  className="undo-button"
                  disabled={busy}
                  onClick={() =>
                    void change(status.today, true).catch(() => {})
                  }
                >
                  <RotateCcw size={13} /> Oops, undo that
                </button>
              ) : (
                'Around the block counts, too.'
              )}
            </div>
            <div className="week-strip">
              {status.week.map((day, i) => (
                <div key={day.date}>
                  <span>{'MTWTFSS'[i]}</span>
                  <b
                    title={day.date}
                    className={`${day.today ? 'today' : ''} ${day.walked ? 'complete' : ''}`}
                  >
                    {day.walked ? <Check size={17} /> : day.today ? '•' : ''}
                  </b>
                </div>
              ))}
            </div>
            <p className="streak-caption">
              {status.streak > 0 ? (
                <>
                  <b>
                    {status.streak} {status.streak === 1 ? 'day' : 'days'}
                  </b>{' '}
                  in a row. Keep your little thing going.
                </>
              ) : connected ? (
                'Your next little tradition starts here.'
              ) : (
                <button onClick={() => setSettings(true)}>
                  Connect your shared calendar ↗
                </button>
              )}
            </p>
          </section>
        </TabsContent>
        <TabsContent value="calendar" keepMounted>
          <CalendarView
            status={status}
            busy={busy}
            onChange={async (d, r) => {
              try {
                return await change(d, r);
              } catch {
                return undefined;
              }
            }}
          />
        </TabsContent>
        <TabsContent value="chain" keepMounted>
          <section className="chain-view">
            <div className="chain-heading">
              <div>
                <span className="date-label">ONE WALK. ONE MORE LINK.</span>
                <h1>Good days add up.</h1>
                <p>
                  {demo
                    ? 'A sample chain to play with. Your calendar stays unchanged.'
                    : status.total
                      ? 'Three to start. One more for every walk together.'
                      : 'Three links on us. The next one’s yours.'}
                </p>
              </div>
              <div className="chain-count">
                <strong>{demo || status.total}</strong>
                <span>{demo ? 'sample links' : 'walks together'}</span>
              </div>
            </div>
            <div className="chain-canvas-wrap">
              <Suspense
                fallback={
                  <div className="paper-stage canvas-fallback">
                    Folding the paper…
                  </div>
                }
              >
                {(chainVisited || view === 'chain') && (
                  <PaperChain
                    count={demo || chainLinks}
                    pulse={pulse}
                    active={view === 'chain'}
                  />
                )}
              </Suspense>
              <span className="paper-label">
                {demo
                  ? 'PLAYGROUND · SAMPLE LINKS'
                  : chainLinks > 16
                    ? 'YOUR LATEST 16 LINKS'
                    : 'THE THINGS WE DO TOGETHER'}
              </span>
            </div>
            <div className="chain-bottom">
              <p>
                No perfect streak required.
                <br />
                <strong>Every walk stays part of the chain.</strong>
              </p>
              <div className="chain-actions">
                {demo > 0 ? (
                  <>
                    <button
                      className="text-link"
                      onClick={() => {
                        setDemo((n) => Math.min(16, n + 1));
                        setPulse((n) => n + 1);
                      }}
                      disabled={demo >= 16}
                    >
                      + Fold a sample link
                    </button>
                    <button className="text-link" onClick={() => setDemo(0)}>
                      Back to our walks
                    </button>
                  </>
                ) : (
                  <button className="text-link" onClick={() => setDemo(10)}>
                    <Sparkles size={15} /> Try a sample chain
                  </button>
                )}
                <button
                  className="primary-button"
                  disabled={busy || status.walkedToday || loading}
                  onClick={log}
                >
                  {status.walkedToday ? (
                    <Check size={19} />
                  ) : (
                    <Footprints size={19} />
                  )}{' '}
                  {status.walkedToday
                    ? 'Today’s link is in'
                    : 'We walked today'}
                </button>
              </div>
            </div>
          </section>
        </TabsContent>
        {connected && (
          <TabsContent value="streaker" keepMounted>
            <Streaker
              model={streaker}
              status={status}
              onLog={log}
              logging={busy || loading}
            />
          </TabsContent>
        )}
      </Tabs>
      {connected && (
        <RewardCelebration
          challenge={streaker.celebration}
          onClose={streaker.dismissCelebration}
        />
      )}
      <footer className="bottomline">
        <span>
          <i />{' '}
          {connected
            ? 'One walk. One shared count.'
            : 'Your shared daily walk tracker.'}
        </span>
        <span>
          Small steps, together. <Heart size={14} />
        </span>
      </footer>
      <Settings
        open={settings}
        onOpenChange={setSettings}
        connected={connected}
        onConnect={async (token) => {
          const r = await fetch('/api/household', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          await refresh();
          setToast('Together at last. Your calendar is connected.');
        }}
      />
      {toast && (
        <div className="walky-toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </main>
  );
}
