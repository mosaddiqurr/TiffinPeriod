import type { GameProps } from '../../platform/registry';
import { useT } from '../../platform/i18n';
import { createRng } from '../../engine/rng';
import { GameShell, type PadDef, type ShellConfig } from '../../components/GameShell';
import { useOnlineEntry } from '../../components/online/OnlineButton';
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
      <GameShell
        gameId="paper-boat" onExit={onExit} onOnline={onOnline} title={t('title')} lede={t('lede')}
        rules={[t('r1'), t('r2'), <b key="r3">{t('r3')}</b>, t('r4')]}
        modes={['ai', 'local2p']} difficulty={() => true}
        createScene={(cfg) => new BoatScene(cfg, t, createRng())}
        pads={pads}
      />
  );
}

