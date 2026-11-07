import { useState, type ReactNode } from 'react';
import { cleanCode, isCode, CODE_LEN } from '../../platform/net/rooms';
import { Flag, TeamGrid, setFavTeam, useTx } from '../sport/SportKit';
import { getTeam } from '../../shared/teams';
import { Who } from './OnlineLobby';

// The online start screen, shared by every game. One centred column:
//   the player's card (name, and country in the cricket and football games),
//   one big Quick match button,
//   "Play with a friend": Create a room / Join a room as two tabs.

export interface LobbyHomeProps {
  /** "1 vs 1" or "4 players". */
  kind: string;
  onBack: () => void;
  name: string;
  setName: (v: string) => void;
  /** Cricket and football: the player's country (flag). */
  sport?: 'cricket' | 'football';
  team?: string;
  setTeam?: (id: string) => void;
  err?: string;
  onQuick: () => void;
  quickSub: string;
  /** e.g. "2 overs · 2 wickets" for quick match. */
  quickMeta?: string;
  createSub: string;
  /** The room's settings, if the game has any. */
  options?: ReactNode;
  onCreate: () => void;
  joinCode: string;
  setJoinCode: (v: string) => void;
  onJoin: () => void;
}

export function LobbyHome(p: LobbyHomeProps) {
  const x = useTx();
  const { t } = x;
  const [tab, setTab] = useState<'create' | 'join'>(p.joinCode ? 'join' : 'create');
  const [pickTeam, setPickTeam] = useState(false);
  const flags = !!p.sport && !!p.team;
  return (
    <div className="olh" data-testid="online-home">
      <div className="olh-head">
        <button className="olh-back" onClick={p.onBack} aria-label={t('Back', 'ফিরে যাও')}>←</button>
        <div className="olh-title">
          <h2>{t('Play online', 'অনলাইনে খেলো')}</h2>
          <span className="olh-kind"><i className="ol-dot" aria-hidden="true" />{p.kind}</span>
        </div>
      </div>

      <div className="olh-card olh-me">
        <div className="olh-avatar">{flags ? <Flag id={p.team!} size={58} /> : <Who team="" name={p.name || '?'} size={58} />}</div>
        <label className="olh-name">
          <span>{t('Your name', 'তোমার নাম')}</span>
          <span className="olh-input">
            <input value={p.name} maxLength={16} onChange={(e) => p.setName(e.target.value)} placeholder={t('Type your name', 'তোমার নাম লেখো')} data-testid="online-name" autoComplete="nickname" enterKeyHint="done" />
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </label>
        {flags && (
          <button className="olh-team" onClick={() => setPickTeam(!pickTeam)} aria-expanded={pickTeam} data-testid="online-team">
            <span>{t('Playing for', 'খেলছ')}</span>
            <b>{x.bi(getTeam(p.team!).name)}</b>
            <small>{pickTeam ? t('close', 'বন্ধ') : t('change', 'বদলাও')}</small>
          </button>
        )}
        {flags && pickTeam && p.setTeam && (
          <div className="olh-teams">
            <TeamGrid sport={p.sport!} value={p.team!} onChange={(id) => { p.setTeam!(id); setFavTeam(p.sport!, id); setPickTeam(false); }} label={t('Your country', 'তোমার দেশ')} />
          </div>
        )}
      </div>

      {p.err && <p className="ol-err" role="alert" data-testid="online-error">{p.err}</p>}

      <button className="olh-quick" onClick={p.onQuick} data-testid="quick-match">
        <span className="olh-bolt" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" /></svg>
        </span>
        <span className="olh-quick-text">
          <b>{t('Quick match', 'কুইক ম্যাচ')}</b>
          <small>{p.quickSub}</small>
          {p.quickMeta && <em>{p.quickMeta}</em>}
        </span>
        <span className="olh-go" aria-hidden="true">→</span>
      </button>

      <div className="olh-or"><span>{t('or play with a friend', 'অথবা বন্ধুর সাথে খেলো')}</span></div>

      <div className="olh-card olh-friend">
        <div className="olh-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'create'} onClick={() => setTab('create')} data-testid="friend-create">{t('Create a room', 'রুম খোলো')}</button>
          <button role="tab" aria-selected={tab === 'join'} onClick={() => setTab('join')} data-testid="friend-join">{t('Join a room', 'রুমে ঢোকো')}</button>
        </div>
        {tab === 'create' ? (
          <div className="olh-pane" role="tabpanel">
            <p className="olh-sub">{p.createSub}</p>
            {p.options && <div className="olh-opts">{p.options}</div>}
            <button className="btn big olh-wide" onClick={p.onCreate} data-testid="create-room">{t('Create room', 'রুম খোলো')}</button>
          </div>
        ) : (
          <form className="olh-pane" role="tabpanel" onSubmit={(e) => { e.preventDefault(); p.onJoin(); }}>
            <p className="olh-sub">{t('Type the code your friend sent.', 'বন্ধুর পাঠানো কোডটা লেখো।')}</p>
            <input className="olh-code" value={p.joinCode} onChange={(e) => p.setJoinCode(cleanCode(e.target.value))} placeholder={'•'.repeat(CODE_LEN)} maxLength={CODE_LEN + 4}
              inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label={t('Room code', 'রুম কোড')} data-testid="join-code" />
            <button className="btn big olh-wide" type="submit" disabled={!isCode(p.joinCode)} data-testid="join-room">{t('Join', 'ঢোকো')}</button>
          </form>
        )}
      </div>
    </div>
  );
}

/** A room's code as big tiles, with Share and Copy. */
export function RoomCodeCard({ code, onShare, onCopy, copied, many }: { code: string; onShare: () => void; onCopy: () => void; copied: string; many?: boolean }) {
  const { t } = useTx();
  return (
    <div className="olh-card olh-room">
      <span className="olh-label">{t('Room code', 'রুম কোড')}</span>
      <div className="ol-code" data-testid="room-code" aria-label={code}>{code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
      <div className="olh-share">
        <button className="btn big" onClick={onShare} data-testid="share-link">🔗 {t('Share link', 'লিংক পাঠাও')}</button>
        <button className="btn secondary" onClick={onCopy}>{t('Copy code', 'কোড কপি')}</button>
      </div>
      {copied && <p className="ol-note">{copied === 'fail' ? (many ? t('Could not copy here: tell your friends the code.', 'এখানে কপি হলো না: বন্ধুদের কোডটা বলে দাও।') : t('Could not copy here: tell your friend the code.', 'এখানে কপি হলো না: বন্ধুকে কোডটা বলে দাও।'))
        : copied === 'code' ? t('Code copied.', 'কোড কপি হয়েছে।')
        : many ? t('Link copied. Paste it in a message to your friends.', 'লিংক কপি হয়েছে। বন্ধুদের মেসেজে পাঠাও।') : t('Link copied. Paste it in a message to your friend.', 'লিংক কপি হয়েছে। বন্ধুকে মেসেজে পাঠাও।')}</p>}
    </div>
  );
}
