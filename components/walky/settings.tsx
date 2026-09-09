'use client';
import { useEffect, useState } from 'react';
import { Copy, Check, Smartphone, Radio, Link2, Heart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export type SettingsData = {
  timezone: string;
  connectionCode: string;
  read: string;
  log: string;
  reminders: { hour: number; timezone: string; configured: boolean };
};
export default function Settings({
  open,
  onOpenChange,
  connected,
  onConnect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  connected: boolean;
  onConnect: (token: string) => Promise<void>;
}) {
  const [data, setData] = useState<SettingsData | null>(null),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState('');
  useEffect(() => {
    if (open && connected)
      fetch('/api/settings')
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          setData(d);
        })
        .catch((e) => setError(e.message));
  }, [open, connected]);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError(
        'Copy is unavailable in this browser. Select the text to copy it.',
      );
    }
  };
  const row = (label: string, value: string) => (
    <div className="copy-row">
      <label>{label}</label>
      <div>
        <input value={value} readOnly aria-label={label} />
        <button
          className="icon-button"
          onClick={() => copy(label, value)}
          aria-label={'Copy ' + label}
        >
          {copied === label ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="walky-dialog settings-dialog">
        <DialogTitle>
          <Heart size={20} /> Just the two of us
        </DialogTitle>
        <DialogDescription>One calendar on both your phones.</DialogDescription>
        {connected && data ? (
          <>
            <div className="settings-section">
              <h3>
                <Link2 size={17} /> Connect your partner
              </h3>
              <p>
                Enter this same code on the other phone. Keep it between you
                two.
              </p>
              {row('Connection code', data.connectionCode)}
            </div>
            <div className="settings-section">
              <h3>
                <Smartphone size={17} /> One tap from your home screen
              </h3>
              <p>
                Install the Android APK, enter this service address and your
                connection code, then add the Walky widget.
              </p>
              {row('Service address', window.location.origin)}
              <a
                className="text-link"
                href="https://github.com/superfunteam/walky/releases"
                target="_blank"
                rel="noreferrer"
              >
                Get the Android app ↗
              </a>
            </div>
            <div className="settings-section">
              <h3>
                <Radio size={17} /> Shortcuts & displays
              </h3>
              {row(
                'Log today’s walk',
                `${window.location.origin}/api/log?key=${data.log}`,
              )}
              {row(
                'TRMNL status feed',
                `${window.location.origin}/api/status?key=${data.read}`,
              )}
              <p>
                The log link records a walk when opened. The status link only
                reads your calendar.
              </p>
              {row('MCP endpoint', `${window.location.origin}/mcp`)}
              <p>MCP uses your connection code as a Bearer token.</p>
            </div>
            <div className="settings-section reminder-note">
              <strong>4 p.m. reality check</strong>
              <p>
                {data.reminders.configured
                  ? 'No walk logged? Clark and Angie both get a lovingly rude text.'
                  : 'Add CLARK, ANGIE and TEXBELT in Netlify to turn on your daily roast texts.'}{' '}
                Central time, every day.
              </p>
              <span>Calendar time zone: {data.timezone}</span>
            </div>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await onConnect(code.trim());
                setCode('');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not connect.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field-label" htmlFor="connection-code">
              Your shared connection code
            </label>
            <input
              id="connection-code"
              className="text-input"
              type="password"
              autoComplete="current-password"
              placeholder="Paste your code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <p className="field-help">
              Use the WALKY_TOKEN from your Netlify settings, or the code from
              your partner’s Walky app.
            </p>
            <button className="primary-button" disabled={busy}>
              {busy ? 'Connecting…' : 'Connect our calendar'}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
