import { useState } from 'react';
import { sfx } from '../../platform/audio';
import { hashQuery } from '../../platform/router';
import { useTx } from '../sport/SportKit';
import './online.css';

// The way into online play from any game's setup screen, and the invite-link check.

/** Online screen open/closed; an invite link (…?room=CODE) opens it straight away. */
export function useOnlineEntry(): { open: boolean; code?: string; show: () => void; close: () => void } {
  const [code] = useState(() => hashQuery().get('room') ?? undefined);
  const [open, setOpen] = useState(!!code);
  return { open, code, show: () => setOpen(true), close: () => setOpen(false) };
}

/** A big "Play online · 1v1" button for a setup screen. */
export function OnlineButton({ onClick }: { onClick: () => void }) {
  const { t } = useTx();
  return (
    <button type="button" className="ol-entry" onClick={() => { sfx('click'); onClick(); }} data-testid="mode-online">
      <span className="ol-ico" aria-hidden="true">🌐</span>
      <span><b>{t('Play online · 1v1', 'অনলাইনে খেলো · ১ বনাম ১')}</b><small>{t('Quick match, or a room with a code or link for a friend.', 'কুইক ম্যাচ, অথবা বন্ধুর জন্য কোড বা লিংকসহ রুম।')}</small></span>
      <i aria-hidden="true">→</i>
    </button>
  );
}
