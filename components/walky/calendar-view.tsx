'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Footprints } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { WalkStatus } from '@/lib/walky/dates';
export default function CalendarView({
  status,
  busy,
  onChange,
}: {
  status: WalkStatus;
  busy: boolean;
  onChange: (date: string, remove: boolean) => Promise<unknown>;
}) {
  const [month, setMonth] = useState(status.today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [year, m] = month.split('-').map(Number),
    days = new Date(year, m, 0).getDate(),
    start = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const shift = (amount: number) => {
    const d = new Date(year, m - 1 + amount, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const count = status.dates.filter((d) => d.startsWith(month)).length;
  return (
    <section className="calendar-view">
      <div className="calendar-intro">
        <span className="date-label">LITTLE WALKS. LOVELY PATTERNS.</span>
        <h1>Your days, collected.</h1>
        <p>Every filled-in day is a little time together.</p>
      </div>
      <div className="calendar-layout">
        <div className="calendar-sheet">
          <div className="calendar-header">
            <h2>
              {new Date(year, m - 1, 1).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </h2>
            <div>
              <button
                className="icon-button"
                onClick={() => shift(-1)}
                aria-label="Previous month"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                className="icon-button"
                onClick={() => setMonth(status.today.slice(0, 7))}
                aria-label="Go to current month"
              >
                •
              </button>
              <button
                className="icon-button"
                onClick={() => shift(1)}
                disabled={month >= status.today.slice(0, 7)}
                aria-label="Next month"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
              <span className="calendar-weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={'blank' + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, '0')}`,
                walked = status.dates.includes(date);
              return (
                <button
                  key={date}
                  className={`calendar-day ${walked ? 'walked' : ''} ${date === status.today ? 'current' : ''}`}
                  onClick={() => setSelected(date)}
                  disabled={date > status.today || busy}
                  aria-label={`${date}${walked ? ', walked' : ', no walk logged'}${date === status.today ? ', today' : ''}`}
                >
                  <span>{i + 1}</span>
                  {walked ? (
                    <Check size={24} strokeWidth={2} />
                  ) : date === status.today ? (
                    <span className="today-dot" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="calendar-legend">
            <span>
              <i /> Walked together
            </span>
            <span>Tap a day to add or edit</span>
          </div>
        </div>
        <aside className="calendar-aside">
          <div className="monthly-stat">
            <Footprints size={25} />
            <strong>
              {count}
              <span>days</span>
            </strong>
            <p>outside this month</p>
          </div>
          <p className="handwritten">
            Look at all those
            <br />
            little yeses.
          </p>
          <div className="mini-stat">
            <span>Current streak</span>
            <b>{status.streak} days</b>
          </div>
          <div className="mini-stat">
            <span>Best streak</span>
            <b>{status.bestStreak} days</b>
          </div>
          <div className="mini-stat">
            <span>All our walks</span>
            <b>{status.total}</b>
          </div>
        </aside>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="walky-dialog">
          <DialogTitle>
            {selected &&
              new Date(selected + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
          </DialogTitle>
          <DialogDescription>
            {selected && status.dates.includes(selected)
              ? 'You walked together on this day.'
              : 'Did you get outside together on this day?'}
          </DialogDescription>
          <button
            className="primary-button"
            disabled={busy}
            onClick={async () => {
              if (selected) {
                const saved = await onChange(
                  selected,
                  status.dates.includes(selected),
                );
                setSelected(null);
              }
            }}
          >
            {selected && status.dates.includes(selected)
              ? 'Remove this walk'
              : 'We walked that day'}
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
