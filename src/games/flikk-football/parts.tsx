import { sfx } from '../../platform/audio';
import { Seg } from '../../components/ui';
import { useTx } from '../../components/sport/SportKit';
import { FORMATIONS, FORMATION_IDS, type FormationId, type Mentality, type TeamSetup } from './match';
import { FLICKS_PER_TURN, type Style } from './fixed';

// Pieces shared by the offline screens and the online match.

export function FormationPreview({ id, kit }: { id: FormationId; kit: string }) {
  return (
    <svg viewBox="0 0 100 70" className="ff-form-svg" aria-hidden="true">
      <rect x="1" y="1" width="98" height="68" rx="3" fill="#2f8a4a" stroke="#fff" strokeWidth="1.2" />
      <path d="M1 1 H99" stroke="#fff" strokeWidth="1" /><rect x="30" y="58" width="40" height="11" fill="none" stroke="#fff" strokeWidth="1" />
      <circle cx="50" cy="65" r="3.4" fill="#f3b61f" stroke="#222" strokeWidth="0.6" />
      {FORMATIONS[id].map(([x, y], i) => <circle key={i} cx={6 + x * 88} cy={64 - y * 58} r="3.6" fill={kit} stroke="#fff" strokeWidth="0.9" />)}
    </svg>
  );
}

export function Tactics({ value, onChange, kit, label }: { value: TeamSetup; onChange: (v: TeamSetup) => void; kit: string; label?: string }) {
  const { t } = useTx();
  return (
    <div className="ff-tactics">
      <div className="opt-label">{label ?? t('Formation', 'ফরমেশন')}</div>
      <div className="ff-forms" role="group" aria-label={t('Formation', 'ফরমেশন')}>
        {FORMATION_IDS.map((f) => (
          <button key={f} type="button" className="ff-form" aria-pressed={value.formation === f} onClick={() => { sfx('click'); onChange({ ...value, formation: f }); }} data-testid={`form-${f}`}>
            <FormationPreview id={f} kit={kit} /><b>{f}</b>
          </button>
        ))}
      </div>
      <div className="opt-label">{t('Mentality', 'মানসিকতা')}</div>
      <Seg label={t('Mentality', 'মানসিকতা')} value={value.mentality} onChange={(m: Mentality) => onChange({ ...value, mentality: m })}
        options={[{ v: 'defend', label: t('Defend deep', 'রক্ষণাত্মক') }, { v: 'balanced', label: t('Balanced', 'ভারসাম্য') }, { v: 'attack', label: t('Push up', 'আক্রমণাত্মক') }]} />
    </div>
  );
}

export function rulesList(t: (en: string, bn: string) => string, style: Style = 'free') {
  if (style === 'fixed') return [
    t('Fixed players: everyone stays on their spot, like table football. Only the ball moves. The player with the ball glows.', 'স্থির খেলোয়াড়: টেবিল ফুটবলের মতো সবাই নিজের জায়গায় থাকে। শুধু বল চলে। যার কাছে বল, সে জ্বলজ্বল করে।'),
    t('Press anywhere, pull back and let go: the ball flies the other way. Pull further for more power; hook the pull to curl it.', 'যেকোনো জায়গায় চেপে পেছনে টানো, ছেড়ে দাও: বল উল্টো দিকে যাবে। বেশি টানলে বেশি জোর; বাঁকা করে টানলে বল বাঁক খাবে।'),
    t('The first player the ball touches collects it. Your team-mate: a pass. Theirs: their ball. The keeper: a save.', 'বল প্রথম যে খেলোয়াড়ের গায়ে লাগে, সে বল ধরে ফেলে। নিজের দলের কেউ: পাস। ওদের কেউ: ওদের বল। গোলকিপার: সেভ।'),
    t('Over a side line: throw-in to the other team. Over the end line: goal kick. Stops in open space: the nearest player gets it.', 'পাশের দাগ পার হলে: অন্য দলের থ্রো-ইন। শেষ দাগ পার হলে: গোল কিক। ফাঁকা জায়গায় থামলে: সবচেয়ে কাছের খেলোয়াড় পায়।'),
    t(`Up to ${FLICKS_PER_TURN} flicks a turn: pass, pass, shoot. Still on the ball after the last one and their nearest player tackles you.`, `এক পালায় সর্বোচ্চ ${FLICKS_PER_TURN}টা টোকা: পাস, পাস, শট। শেষ টোকার পরও বল তোমার কাছে থাকলে ওদের কাছের খেলোয়াড় ট্যাকল করে নেবে।`),
    t('The guide shows the path. Green ring: yours will get it. Red ring: theirs will. Red cross: it goes out.', 'দাগ দেখায় বল কোথায় যাবে। সবুজ বৃত্ত: তোমার দলের কেউ পাবে। লাল বৃত্ত: ওরা পাবে। লাল ক্রস: বাইরে যাবে।'),
    t('Keepers slide along their lines by themselves. Every flick moves the clock on.', 'গোলকিপার নিজে নিজে গোললাইনে সরে। প্রতিটা টোকায় ঘড়ি এগোয়।'),
    t('Keys: arrows aim and set power, Space flicks.', 'কী-বোর্ড: তীর দিয়ে দিক আর জোর, স্পেসে টোকা।'),
  ];
  return [
    t('Teams take turns. Press on one of your pieces, pull back and let go to flick it into the ball.', 'পালা করে খেলা। নিজের একটা গুটি চেপে পেছনে টানো, ছেড়ে দিলেই টোকা লেগে বলে যাবে।'),
    t('The dotted guide shows where your piece meets the ball and where the ball will go. Pull further for more power.', 'ডটেড দাগ দেখায় গুটি কোথায় বলে লাগবে আর বল কোন দিকে যাবে। বেশি টানলে বেশি জোর।'),
    t('Hook your drag (a curved pull) to curl the shot.', 'বাঁকা করে টানলে শট বাঁক খাবে।'),
    t('Pass: if your flick moves the ball and it stops nearest to one of your pieces, you flick again (up to 3 flicks a turn).', 'পাস: তোমার টোকায় বল নড়ে যদি তোমার কোনো গুটির কাছে থামে, তুমি আবার টোকা দেবে (এক পালায় সর্বোচ্চ ৩ বার)।'),
    t('Keepers slide along their lines by themselves. Once a half you can Regroup: put your team back into its formation instead of flicking.', 'গোলকিপার নিজে নিজে গোললাইনে সরে। প্রতি অর্ধে একবার "সাজাও" চেপে টোকার বদলে দলকে ফরমেশনে ফিরিয়ে নিতে পারো।'),
    t('Keys: Tab picks a piece, arrows aim and set power, Space flicks, R regroups.', 'কী-বোর্ড: Tab গুটি বাছে, তীর দিয়ে দিক আর জোর, স্পেসে টোকা, R দিয়ে সাজাও।'),
  ];
}

