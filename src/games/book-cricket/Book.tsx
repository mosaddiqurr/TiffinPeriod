import { memo } from 'react';
import { toBnDigits } from '../../platform/i18n';
import { createRng } from '../../engine/rng';

// A believable Bangladeshi school maths book, drawn with HTML and CSS.
// The book content is in Bangla in every interface language, because it is
// a prop from a Bangla-medium classroom. The page numbers follow the UI language.

const CHAPTERS = ['স্বাভাবিক সংখ্যা', 'ভগ্নাংশ', 'দশমিক ভগ্নাংশ', 'শতকরা', 'ঐকিক নিয়ম', 'অনুপাত ও সমানুপাত', 'জ্যামিতি', 'পরিমাপ', 'সময়', 'তথ্য ও উপাত্ত'];

export type BookState = 'closed' | 'riffle' | 'open';

const PageBody = memo(function PageBody({ n, side, numText, highlight }: { n: number; side: 'l' | 'r'; numText: string; highlight: boolean }) {
  const r = createRng(n * 7919);
  const ch = Math.min(CHAPTERS.length - 1, Math.floor(n / 20));
  const lines = Array.from({ length: 9 }, () => 55 + r.int(0, 40));
  const exercise = r.chance(0.5);
  const a = r.int(12, 98), b = r.int(3, 49);
  return (
    <div className={`bc-page ${side}`}>
      {n % 20 < 2 ? <div className="bc-ch">অধ্যায় {toBnDigits(ch + 1)}: {CHAPTERS[ch]}</div> : <div className="bc-head">{CHAPTERS[ch]}</div>}
      {lines.slice(0, exercise ? 5 : 9).map((w, i) => <div key={i} className="bc-line" style={{ width: `${w}%` }} />)}
      {exercise && (
        <div className="bc-ex">
          <b>অনুশীলনী {toBnDigits(ch + 1)}.{toBnDigits(r.int(1, 4))}</b>
          <div>{toBnDigits(1)}. {toBnDigits(a)} + {toBnDigits(b)} = ?</div>
          <div>{toBnDigits(2)}. {toBnDigits(a)} × {toBnDigits(r.int(2, 9))} = ?</div>
        </div>
      )}
      <div className={`bc-pno ${highlight ? 'hl' : ''}`}>
        {numText.slice(0, -1)}<span className="last">{numText.slice(-1)}</span>
      </div>
    </div>
  );
});

export function Book({ state, page, owner, numFmt, highlight }: { state: BookState; page: number; owner: string; numFmt: (n: number) => string; highlight: boolean }) {
  return (
    <div className={`bc-book ${state}`} aria-hidden="true">
      <div className="bc-cover-back" />
      {state === 'closed' ? (
        <div className="bc-cover-front">
          <div className="bc-cover-label">
            <div className="subj">গণিত</div>
            <div className="row">নাম: <span className="hand">{owner}</span></div>
            <div className="row">শ্রেণি: <span className="hand">পঞ্চম</span></div>
            <div className="row">রোল: <span className="hand">{toBnDigits(7)}</span></div>
          </div>
        </div>
      ) : (
        <>
          <PageBody n={page} side="l" numText={numFmt(page)} highlight={highlight} />
          <PageBody n={page + 1} side="r" numText={numFmt(page + 1)} highlight={false} />
          <div className="bc-spine" />
          {state === 'riffle' && [0, 1, 2, 3, 4].map((i) => <div key={i} className="bc-leaf" style={{ animationDelay: `${i * 0.055}s` }} />)}
        </>
      )}
    </div>
  );
}
