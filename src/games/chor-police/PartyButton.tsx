import { sfx } from '../../platform/audio';
import { useTx } from '../../components/sport/SportKit';
import '../../components/online/online.css';

// The way into online play from the setup screen. Like the shared OnlineButton, but that
// one says "1v1"; Chor Police is for four.
export function PartyButton({ onClick }: { onClick: () => void }) {
  const { t } = useTx();
  return (
    <button type="button" className="ol-entry" onClick={() => { sfx('click'); onClick(); }} data-testid="mode-online">
      <span className="ol-ico" aria-hidden="true">🌐</span>
      <span><b>{t('Play online · 4 players', 'অনলাইনে খেলো · ৪ জন')}</b><small>{t('Quick match, or a room with a code or link for three friends.', 'কুইক ম্যাচ, অথবা তিন বন্ধুর জন্য কোড বা লিংকসহ রুম।')}</small></span>
      <i aria-hidden="true">→</i>
    </button>
  );
}
