import {
  Footer,
  LeaderboardTable,
  LeaderboardTop3,
  NavBar,
  SeasonBanner,
  Ticker,
} from '@/components';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useAppStore } from '@/store/useAppStore';
import styles from './LeaderboardPage.module.css';

export default function LeaderboardPage() {
  const { season, entries, ticker } = useAppStore();
  const { scores, rollIndex } = useLiveScores(entries.map((e) => e.validUsers));

  return (
    <div className="page">
      <NavBar />
      <SeasonBanner season={season} note={season.refreshNotice} />

      <main className={styles.main}>
        <div className={styles.head}>
          <h1 className={styles.title}>
            {season.title} 리더보드
          </h1>
          <a href="#valid-users">유효 이용자 기준 보기 →</a>
        </div>

        <div className={styles.top3}>
          <LeaderboardTop3 entries={entries} scores={scores} rollIndex={rollIndex} />
        </div>

        <LeaderboardTable entries={entries} scores={scores} rollIndex={rollIndex} />

        <div className={styles.ticker}>
          <Ticker items={ticker} />
        </div>

        <p className={styles.note}>
          지표는 참가팀이 제출한 애널리틱스 원본을 운영진이 검증한 뒤 반영됨 · 1일 1회 갱신
        </p>
      </main>

      <Footer />
    </div>
  );
}
