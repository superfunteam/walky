import { useState, type CSSProperties, type SubmitEvent } from 'react';
import {
  Check,
  Flame,
  Gift,
  Heart,
  ListChecks,
  Plus,
  Trophy,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Challenge } from '@/lib/walky/challenges';
import type { WalkStatus } from '@/lib/walky/dates';
import type { StreakerModel } from './use-streaker';

function CreateChallenge({
  open,
  onClose,
  model,
}: {
  open: boolean;
  onClose: () => void;
  model: StreakerModel;
}) {
  const [kind, setKind] = useState<'streak' | 'checklist'>('streak');
  const [reward, setReward] = useState(''),
    [target, setTarget] = useState(7),
    [walks, setWalks] = useState('');
  const [id, setId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    try {
      await model.action('/api/challenges', 'POST', {
        id,
        kind,
        reward,
        target,
        items: walks
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onClose();
      setReward('');
      setWalks('');
      setId(crypto.randomUUID());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the deal.');
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && !model.busy) onClose();
      }}
    >
      <DialogContent className="walky-dialog challenge-dialog">
        <DialogTitle>A little deal.</DialogTitle>
        <DialogDescription>
          Do the walks together. Make the payoff worth it.
        </DialogDescription>
        <form
          onSubmit={(e) => {
            void submit(e);
          }}
          className="challenge-form"
        >
          <label className="field-label" htmlFor="challenge-reward">
            What’s the reward?
          </label>
          <input
            id="challenge-reward"
            className="text-input"
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            maxLength={140}
            placeholder="A week off dish duty"
            autoComplete="off"
            required
          />
          <fieldset className="challenge-kind">
            <legend>How do we earn it?</legend>
            <label>
              <input
                type="radio"
                name="challenge-kind"
                checked={kind === 'streak'}
                onChange={() => setKind('streak')}
              />
              <Flame size={18} /> Daily streak
            </label>
            <label>
              <input
                type="radio"
                name="challenge-kind"
                checked={kind === 'checklist'}
                onChange={() => setKind('checklist')}
              />
              <ListChecks size={18} /> Walk checklist
            </label>
          </fieldset>
          {kind === 'streak' ? (
            <div className="challenge-target">
              <label htmlFor="challenge-days">Walk together for</label>
              <div>
                <input
                  id="challenge-days"
                  type="number"
                  min={1}
                  max={365}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  required
                />
                <span>{target === 1 ? 'day' : 'days'} in a row.</span>
              </div>
              <p>
                Starts today. Every daily check-in counts. Miss a day and the
                run starts fresh.
              </p>
            </div>
          ) : (
            <div>
              <label className="field-label" htmlFor="challenge-walks">
                The walk wish list
              </label>
              <textarea
                id="challenge-walks"
                className="text-input challenge-walks"
                rows={5}
                maxLength={2500}
                value={walks}
                onChange={(e) => setWalks(e.target.value)}
                placeholder={
                  'Mall walk\nLakeside park after dark\nAny walk\nAny walk\nAny walk'
                }
                required
              />
              <p className="field-help">
                One walk per line, up to 30. Repeat “Any walk” for a few wild
                cards. Checking off a walk also logs today.
              </p>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setWalks((value) =>
                    [value.trim(), 'Any walk', 'Any walk', 'Any walk']
                      .filter(Boolean)
                      .join('\n'),
                  )
                }
              >
                + Three any-time walks
              </button>
            </div>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={!!model.busy}>
            <Heart size={17} />
            {model.busy ? 'Making the deal…' : 'Make the deal'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChallengeCard({
  challenge: c,
  model,
  onRemove,
}: {
  challenge: Challenge;
  model: StreakerModel;
  onRemove: (challenge: Challenge) => void;
}) {
  return (
    <article
      className={`challenge-card ${c.unlocked ? 'challenge-unlocked' : ''} ${c.claimedAt ? 'challenge-claimed' : ''}`}
    >
      <div className="challenge-card-top">
        <span>
          {c.claimedAt ? (
            <Check size={16} />
          ) : c.unlocked ? (
            <Trophy size={16} />
          ) : c.kind === 'streak' ? (
            <Flame size={16} />
          ) : (
            <ListChecks size={16} />
          )}
          {c.claimedAt
            ? 'REWARD COLLECTED'
            : c.unlocked
              ? 'YOU EARNED THIS'
              : c.kind === 'streak'
                ? `${c.target}-DAY STREAK`
                : `${c.target}-WALK CHECKLIST`}
        </span>
        <button
          className="challenge-remove"
          onClick={() => onRemove(c)}
          aria-label={`Remove challenge: ${c.reward}`}
          disabled={!!model.busy}
        >
          <X size={16} />
        </button>
      </div>
      <h2>{c.reward}</h2>
      <div className="challenge-progress-line">
        <strong>
          {c.progress}
          <span> / {c.target}</span>
        </strong>
        <span>
          {c.unlocked
            ? 'Teamwork looks good on you.'
            : `${c.remaining} more ${c.kind === 'streak' ? (c.remaining === 1 ? 'day' : 'days') : c.remaining === 1 ? 'walk' : 'walks'} to the good stuff.`}
        </span>
      </div>
      <progress
        value={c.progress}
        max={c.target}
        aria-label={`Progress toward ${c.reward}`}
      />
      {c.kind === 'streak' ? (
        <>
          <div className="challenge-days" aria-label="The last seven days">
            {c.recentDays.map((day) => (
              <div key={day.date}>
                <span>
                  {new Date(`${day.date}T12:00:00Z`).toLocaleDateString(
                    'en-US',
                    { weekday: 'narrow', timeZone: 'UTC' },
                  )}
                </span>
                <b
                  className={day.walked ? 'complete' : ''}
                  title={`${day.date}: ${day.walked ? 'walked' : 'no walk logged'}`}
                >
                  {day.walked ? <Check size={17} /> : '·'}
                </b>
              </div>
            ))}
          </div>
          <p className="challenge-card-note">
            {c.unlocked
              ? 'A promise kept, one day at a time.'
              : c.currentStreak
                ? `${c.currentStreak} ${c.currentStreak === 1 ? 'day' : 'days'} running. Keep your little pact going.`
                : 'A fresh start is one walk away.'}
          </p>
        </>
      ) : (
        <ul className="challenge-checklist">
          {c.items.map((item) => (
            <li key={item.id}>
              <label>
                <input
                  type="checkbox"
                  checked={!!c.completedItems[item.id]}
                  disabled={!!model.busy || !!c.claimedAt}
                  onChange={(e) => {
                    void model
                      .action(
                        `/api/challenges/${c.id}/items/${item.id}`,
                        e.target.checked ? 'POST' : 'DELETE',
                      )
                      .catch(() => {});
                  }}
                />
                <span>{item.label}</span>
                {c.completedItems[item.id] && <Check size={16} />}
              </label>
            </li>
          ))}
        </ul>
      )}
      {c.unlocked && !c.claimedAt && (
        <button
          className="primary-button reward-claim"
          disabled={!!model.busy}
          onClick={() => {
            void model
              .action(`/api/challenges/${c.id}/claim`, 'POST')
              .catch(() => {});
          }}
        >
          <Gift size={17} /> Collect our reward
        </button>
      )}
      {c.claimedAt && (
        <p className="challenge-card-note">
          Collected{' '}
          {new Date(c.claimedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'America/Chicago',
          })}
          . A very good deal.
        </p>
      )}
    </article>
  );
}

export default function Streaker({
  model,
  status,
  onLog,
  logging,
}: {
  model: StreakerModel;
  status: WalkStatus;
  onLog: () => void;
  logging: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Challenge | null>(null);
  const challenges = model.data?.challenges ?? [];
  return (
    <section className="streaker-view">
      <div className="streaker-heading">
        <div>
          <span className="date-label">A LITTLE PACT. A LITTLE PAYOFF.</span>
          <h1>
            Streaker<span>✳</span>
          </h1>
          <p>Small walks. Big “you owe me.” Energy.</p>
        </div>
        <button
          className="text-link new-challenge"
          onClick={() => setCreating(true)}
        >
          <Plus size={16} /> A new deal
        </button>
      </div>
      <div className="streaker-team">
        <span>
          <Heart size={16} /> TEAM US
        </span>
        <span>
          <Flame size={16} />
          <b>{status.streak}</b> day streak
        </span>
        <span>Just between the two of you.</span>
      </div>
      {model.error && (
        <div className="error-banner" role="alert">
          {model.error}
          <button
            onClick={() => {
              void model.refresh();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {!model.data ? (
        <p className="streaker-loading">Checking on your little deals…</p>
      ) : challenges.length ? (
        <div className="challenge-grid">
          {challenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              model={model}
              onRemove={setRemoving}
            />
          ))}
        </div>
      ) : (
        <div className="streaker-empty">
          <Gift size={45} strokeWidth={1.4} />
          <h2>What are we walking toward?</h2>
          <p>
            Seven days for breakfast in bed. Five favorite walks for a date
            night. You two make the rules.
          </p>
          <button className="primary-button" onClick={() => setCreating(true)}>
            <Plus size={17} /> Make our first deal
          </button>
        </div>
      )}
      <div className="streaker-footer">
        <p>One team. Shared progress. An excellent excuse to get outside.</p>
        <button
          className="primary-button"
          onClick={onLog}
          disabled={logging || status.walkedToday}
        >
          {status.walkedToday ? <Check size={17} /> : <Flame size={17} />}
          {status.walkedToday ? 'Today’s walk is in' : 'We walked today'}
        </button>
      </div>
      <CreateChallenge
        open={creating}
        onClose={() => setCreating(false)}
        model={model}
      />
      <Dialog
        open={!!removing}
        onOpenChange={(value) => {
          if (!value) setRemoving(null);
        }}
      >
        <DialogContent className="walky-dialog">
          <DialogTitle>Retire this little deal?</DialogTitle>
          <DialogDescription>
            {removing?.reward}. Your logged walks stay in the calendar.
          </DialogDescription>
          <button
            className="text-link"
            disabled={!!model.busy}
            onClick={() => {
              if (removing)
                void model
                  .action(`/api/challenges/${removing.id}`, 'DELETE')
                  .then(() => setRemoving(null))
                  .catch(() => {});
            }}
          >
            Remove challenge
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function RewardCelebration({
  challenge,
  onClose,
}: {
  challenge: Challenge | null;
  onClose: () => void;
}) {
  const colors = ['#ff773d', '#215741', '#e3c953', '#ee9dba', '#9aabd0'];
  return (
    <Dialog
      open={!!challenge}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="walky-dialog reward-celebration">
        <div className="reward-confetti" aria-hidden="true">
          {Array.from({ length: 42 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  '--x': `${(i * 37) % 100}%`,
                  '--delay': `${(i % 9) * 0.08}s`,
                  '--drift': `${(i % 2 ? 1 : -1) * (20 + (i % 60))}px`,
                  '--spin': `${180 + i * 23}deg`,
                  background: colors[i % colors.length],
                } as CSSProperties
              }
            />
          ))}
        </div>
        <span className="date-label">TEAM US · CHALLENGE COMPLETE</span>
        <Trophy className="celebration-trophy" size={64} strokeWidth={1.3} />
        <DialogTitle>You two did it.</DialogTitle>
        <DialogDescription>
          {challenge?.kind === 'streak'
            ? `${challenge.target} ${challenge.target === 1 ? 'day' : 'days'} in a row. One very good team.`
            : `${challenge?.target} ${challenge?.target === 1 ? 'walk' : 'walks'}, all checked off. That’s a team effort.`}
        </DialogDescription>
        <div className="celebration-prize">
          <span>YOUR REWARD IS UNLOCKED</span>
          <strong>{challenge?.reward}</strong>
        </div>
        <button className="primary-button" onClick={onClose}>
          <Heart size={18} /> High five, us.
        </button>
      </DialogContent>
    </Dialog>
  );
}
