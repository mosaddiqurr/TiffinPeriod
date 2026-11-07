import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameProps } from '../../platform/registry';
import { useT } from '../../platform/i18n';
import { createRng } from '../../engine/rng';
import { GameShell, type PadDef, type ShellConfig } from '../../components/GameShell';
import { OnlineButton, useOnlineEntry } from '../../components/online/OnlineButton';
import { BoatScene, S } from './scene';
import { OnlinePaperBoat } from './online';

export default function PaperBoat({ onExit }: GameProps) {
  const online = useOnlineEntry();
  if (online.open) return <div className="sport-root ruled"><OnlinePaperBoat onBack={online.close} code={online.code} /></div>;
  return <PaperBoatLocal onExit={onExit} onOnline={online.show} />;
}

function PaperBoatLocal({ onExit, onOnline }: GameProps & { onOnline: () => void }) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const two = cfg.mode === 'local2p';
    const list: PadDef[] = [
      { player: 0, action: 'left', label: t('left'), sub: two ? cfg.names[0] : undefined, area: 'bl', size: two ? 'm' : 'l', color: 'rgba(192,57,43,0.85)', keys: two ? ['KeyA'] : ['KeyA', 'ArrowLeft'], keyHint: two ? 'A' : '← A' },
      { player: 0, action: 'right', label: t('right'), sub: two ? cfg.names[0] : undefined, area: two ? 'bl' : 'br', size: two ? 'm' : 'l', color: 'rgba(192,57,43,0.85)', keys: two ? ['KeyD'] : ['KeyD', 'ArrowRight'], keyHint: two ? 'D' : '→ D' },
    ];
    if (two) list.push(
      { player: 1, action: 'left', label: t('left'), sub: cfg.names[1], area: 'br', size: 'm', color: 'rgba(31,78,156,0.85)', keys: ['ArrowLeft'], keyHint: '←' },
      { player: 1, action: 'right', label: t('right'), sub: cfg.names[1], area: 'br', size: 'm', color: 'rgba(31,78,156,0.85)', keys: ['ArrowRight'], keyHint: '→' },
    );
    return list;
  };
  return (
    <SetupSlot button={<OnlineButton onClick={onOnline} />}>
      <GameShell
        gameId="paper-boat" onExit={onExit} title={t('title')} lede={t('lede')}
        rules={[t('r1'), t('r2'), <b key="r3">{t('r3')}</b>, t('r4')]}
        modes={['ai', 'local2p']} difficulty={() => true}
        createScene={(cfg) => new BoatScene(cfg, t, createRng())}
        pads={pads}
      />
    </SetupSlot>
  );
}

/**
 * GameShell (shared) has no place for an extra setup button, so this puts `button` into its
 * setup sheet, just above the mode choice, whenever that sheet is on screen.
 */
function SetupSlot({ button, children }: { button: React.ReactNode; children: React.ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = wrap.current!;
    let el: HTMLElement | null = null;
    const check = () => {
      const sheet = root.querySelector<HTMLElement>('[data-testid="setup"]');
      if (!sheet) { if (el) { el = null; setSlot(null); } return; }
      if (el && sheet.contains(el)) return;
      el = document.createElement('div');
      el.className = 'pb-setup-online';
      const rules = sheet.querySelector(':scope > ol');
      if (rules) rules.after(el); else sheet.prepend(el);
      setSlot(el);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); el?.remove(); };
  }, []);
  return <div ref={wrap} style={{ display: 'contents' }}>{children}{slot && createPortal(button, slot)}</div>;
}
