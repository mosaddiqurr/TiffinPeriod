import { useState } from 'react';
import { useT, fmtNum } from '../platform/i18n';
import { UI } from '../platform/strings';
import { useSettings, updateSettings } from '../platform/settings';
import { CATEGORIES, GAMES, type Category } from '../platform/registry';
import { href } from '../platform/router';
import { sfx, unlockAudio } from '../platform/audio';
import { ACHIEVEMENTS, scoresStore, useAchievements, achievementsStore } from '../platform/scores';
import { useStore } from '../platform/store';
import { clearAll } from '../platform/storage';
import { DOODLES, IconGear, IconSoundOff, IconSoundOn, IconTrophy, SchoolBell, Star } from './Doodles';
import { Switch } from './ui';

export function TopBar() {
  const t = useT(UI);
  const s = useSettings();
  return (
    <header className="cover-bar">
      <div className="cover-inner">
        <a className="name-label" href={href({ name: 'home' })} aria-label={t('brand')}>
          <span>
            <span className="brand">{t('brand')}</span>
            <span className="brand-sub">{t('brandSub')}</span>
          </span>
        </a>
        <span className="cover-spacer" />
        <button
          className="cover-btn lang-toggle"
          onClick={() => { updateSettings({ lang: s.lang === 'bn' ? 'en' : 'bn' }); sfx('click'); }}
          aria-label={t('sLang')}
        >
          <span className={s.lang === 'bn' ? 'on' : ''}>বাং</span>
          <span className={s.lang === 'en' ? 'on' : ''}>EN</span>
        </button>
        <button className="cover-btn" onClick={() => { unlockAudio(); updateSettings({ sound: !s.sound }); }} aria-label={s.sound ? t('soundOn') : t('soundOff')} aria-pressed={s.sound}>
          {s.sound ? <IconSoundOn /> : <IconSoundOff />}
        </button>
        <a className="cover-btn" href={href({ name: 'records' })} aria-label={t('records')}><IconTrophy /><span className="lbl">{t('records')}</span></a>
        <a className="cover-btn" href={href({ name: 'settings' })} aria-label={t('settings')}><IconGear /><span className="lbl">{t('settings')}</span></a>
      </div>
      <div className="rickshaw-band" />
    </header>
  );
}

export function Home() {
  const t = useT(UI);
  const scores = useStore(scoresStore);
  const [ringing, setRinging] = useState(false);
  const ready = GAMES.filter((g) => g.playable);
  const soon = GAMES.filter((g) => !g.playable);
  const modeLabel = { solo: t('modeSolo'), ai: t('modeAi'), local2p: t('mode2p') };
  const cats: Category[] = ['bench', 'sports'];

  const ring = () => {
    unlockAudio();
    sfx('bell');
    setRinging(true);
    setTimeout(() => setRinging(false), 1000);
  };

  return (
    <main className="page ruled" style={{ position: 'relative' }}>
      <section className="hero">
        <h1>{t('heroTitleA')} <span className="red">{t('heroTitleB')}</span></h1>
        <button className={`bell-btn ${ringing ? 'ringing' : ''}`} onClick={ring} aria-label={t('ringBell')} title={t('ringBell')}>
          <SchoolBell size={96} />
        </button>
        <p>{t('heroText')}</p>
      </section>

      {cats.map((c) => (
        <section key={c}>
          <div className="section-head">
            <h2>{t.bi(CATEGORIES[c])}</h2>
            <span className="en">{t('playNow')}</span>
          </div>
          <div className="cards">
            {ready.filter((g) => g.category === c).map((g) => {
              const Doodle = DOODLES[g.id];
              const best = scores[g.id]?.best;
              return (
                <a key={g.id} className="card" href={href({ name: 'play', id: g.id })} style={{ ['--accent' as string]: g.accent }} data-testid={`card-${g.id}`} onClick={() => unlockAudio()}>
                  <div className="card-art">
                    <span className="card-no">{fmtNum(g.no, t.lang)}.</span>
                    {Doodle && <Doodle accent={g.accent} />}
                  </div>
                  <div className="card-body">
                    <h3 className="card-title">{t.bi(g.title)}</h3>
                    <div className="card-sub">{t.lang === 'bn' ? g.title.en : g.title.bn}</div>
                    <p className="card-blurb">{t.bi(g.blurb)}</p>
                    <div className="card-foot">
                      {g.modes.map((m) => <span key={m} className="chip">{modeLabel[m]}</span>)}
                      <span className="play-stamp">{t('play')} →</span>
                    </div>
                    {best != null && <div className="card-best">★ {t('best', { v: best })}</div>}
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ))}

      <section>
        <div className="section-head">
          <h2>{t('comingSoon')}</h2>
          <span className="en">{t('comingSoonEn')}</span>
        </div>
        <div className="soon-grid">
          {soon.map((g) => (
            <div key={g.id} className="soon" aria-label={`${t.bi(g.title)} — ${t('mPlanned')}`}>
              <b><span className="no">{fmtNum(g.no, t.lang)}.</span>{t.bi(g.title)}</b>
              <small>{t.bi(g.blurb)}</small>
              <span className="stamp">{t('soonStamp')}</span>
            </div>
          ))}
        </div>
        <div className="link-row"><a className="ink-link" href={href({ name: 'roadmap' })}>{t('fullRoadmap')} →</a></div>
      </section>

      <footer className="footer">
        <p style={{ margin: 0 }}>{t('footer')}</p>
      </footer>
    </main>
  );
}

export function Roadmap() {
  const t = useT(UI);
  return (
    <main className="page ruled">
      <div className="doc">
        <h1>{t('mTitle')}</h1>
        <p>{t('mLede')}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="roadmap-table">
            <thead><tr><th>{t('mNo')}</th><th>{t('mGame')}</th><th>{t('mPlace')}</th><th>{t('mPhase')}</th><th>{t('mStatus')}</th></tr></thead>
            <tbody>
              {GAMES.map((g) => (
                <tr key={g.id}>
                  <td>{fmtNum(g.no, t.lang)}</td>
                  <td>
                    {g.playable ? <a className="ink-link" href={href({ name: 'play', id: g.id })}>{t.bi(g.title)}</a> : <b>{t.bi(g.title)}</b>}
                    <br /><small style={{ color: 'var(--ink-soft)' }}>{t.bi(g.blurb)}</small>
                  </td>
                  <td>{t.bi(CATEGORIES[g.category])}</td>
                  <td>{fmtNum(g.phase, t.lang)}</td>
                  <td className={g.playable ? 'status-ok' : 'status-soon'}>{g.playable ? t('mReady') : t('mPlanned')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

export function SettingsPage() {
  const t = useT(UI);
  const s = useSettings();
  const [msg, setMsg] = useState('');
  const setName = (i: 0 | 1, name: string) => {
    const players = [...s.players] as typeof s.players;
    players[i] = { ...players[i], name: name.slice(0, 16) };
    updateSettings({ players });
  };
  return (
    <main className="page ruled">
      <div className="doc">
        <h1>{t('settings')}</h1>
        <div className="field">
          <span className="lab">{t('sLang')}</span>
          <div className="seg">
            <button aria-pressed={s.lang === 'bn'} onClick={() => updateSettings({ lang: 'bn' })}>বাংলা</button>
            <button aria-pressed={s.lang === 'en'} onClick={() => updateSettings({ lang: 'en' })}>English</button>
          </div>
        </div>
        <div className="field"><span className="lab">{t('sSound')}</span><Switch on={s.sound} onChange={(v) => { unlockAudio(); updateSettings({ sound: v }); }} label={t('sSound')} /></div>
        <div className="field">
          <label htmlFor="vol">{t('sVolume')}</label>
          <input id="vol" type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => updateSettings({ volume: Number(e.target.value) })} onPointerUp={() => sfx('pop')} style={{ width: 200 }} />
        </div>
        <div className="field"><span className="lab">{t('sVoice')}<small>{t('sVoiceHelp')}</small></span><Switch on={s.voice} onChange={(v) => updateSettings({ voice: v })} label={t('sVoice')} /></div>
        <div className="field"><span className="lab">{t('sHaptics')}</span><Switch on={s.haptics} onChange={(v) => updateSettings({ haptics: v })} label={t('sHaptics')} /></div>
        <div className="field"><span className="lab">{t('sMotion')}</span><Switch on={s.reducedMotion} onChange={(v) => updateSettings({ reducedMotion: v })} label={t('sMotion')} /></div>
        <div className="field"><span className="lab">{t('sAssist')}<small>{t('sAssistHelp')}</small></span><Switch on={s.inputAssist} onChange={(v) => updateSettings({ inputAssist: v })} label={t('sAssist')} /></div>
        <h2>{t('sPlayers')}</h2>
        <div className="field"><label htmlFor="p1">{t('sP1')}</label><input id="p1" className="text-in" value={s.players[0].name} placeholder={t('player1')} onChange={(e) => setName(0, e.target.value)} /></div>
        <div className="field"><label htmlFor="p2">{t('sP2')}</label><input id="p2" className="text-in" value={s.players[1].name} placeholder={t('player2')} onChange={(e) => setName(1, e.target.value)} /></div>
        <h2>{t('sReset')}</h2>
        <p>{t('sResetHelp')}</p>
        <button className="btn red" onClick={() => {
          if (!confirm(t('sResetConfirm'))) return;
          clearAll();
          scoresStore.set({});
          achievementsStore.set({});
          setMsg(t('sResetDone'));
        }}>{t('sReset')}</button>
        {msg && <p role="status" style={{ color: 'var(--green)', fontWeight: 600 }}>{msg}</p>}
      </div>
    </main>
  );
}

export function RecordsPage() {
  const t = useT(UI);
  const scores = useStore(scoresStore);
  const ach = useAchievements();
  return (
    <main className="page ruled">
      <div className="doc">
        <h1>{t('rTitle')}</h1>
        <p>{t('rLede')}</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="roadmap-table">
            <thead><tr><th>{t('mGame')}</th><th>{t('rPlays')}</th><th>{t('rWins')}</th><th>{t('rBest')}</th><th>{t('rStreak')}</th></tr></thead>
            <tbody>
              {GAMES.filter((g) => g.playable).map((g) => {
                const st = scores[g.id];
                return (
                  <tr key={g.id}>
                    <td><a className="ink-link" href={href({ name: 'play', id: g.id })}>{t.bi(g.title)}</a></td>
                    {st ? (
                      <>
                        <td>{t.n(st.plays)}</td><td>{t.n(st.wins)}</td><td>{st.best == null ? '—' : t.n(st.best)}</td><td>{t.n(st.bestStreak)}</td>
                      </>
                    ) : <td colSpan={4} style={{ color: 'var(--ink-soft)' }}>{t('rNone')}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h2>{t('rAch')} ({t.n(Object.keys(ach).length)}/{t.n(ACHIEVEMENTS.length)})</h2>
        <div className="ach-list">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.id} className={`ach ${ach[a.id] ? '' : 'locked'}`}>
              <Star />
              <div><b>{t.bi(a.title)}</b><small>{t.bi(a.desc)}</small></div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
