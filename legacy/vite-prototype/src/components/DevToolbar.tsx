import { useState } from 'react';
import { Link } from 'react-router-dom';
import { devRoleOf, useAppStore, type DevRole } from '@/store/useAppStore';
import type { SeasonStatus, StageKey } from '@/types';
import styles from './DevToolbar.module.css';

const ROLES: { key: DevRole; label: string }[] = [
  { key: 'GUEST', label: '비로그인' },
  { key: 'PARTICIPANT_NO_ENTRY', label: '참가자(팀 없음)' },
  { key: 'PARTICIPANT', label: '참가자(팀 있음)' },
  { key: 'ADMIN', label: '운영자' },
];

const STATUSES: { key: SeasonStatus; label: string }[] = [
  { key: 'UPCOMING', label: '모집 전' },
  { key: 'RECRUITING', label: '모집 중' },
  { key: 'IN_PROGRESS', label: '진행 중' },
];

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'S1', label: 'S1 수요 검증' },
  { key: 'REVIEW1', label: '1차 심사' },
  { key: 'S2', label: 'S2 AI 빌드' },
  { key: 'S3', label: 'S3 유저 확보' },
  { key: 'FINAL', label: '최종 심사' },
];

const QUICK_LINKS = [
  { to: '/', label: '/' },
  { to: '/leaderboard', label: '/leaderboard' },
  { to: '/projects/entry-1', label: '/projects/:id' },
  { to: '/seasons', label: '/seasons' },
  { to: '/apply', label: '/apply' },
  { to: '/dashboard', label: '/dashboard' },
  { to: '/dashboard/submissions/S1', label: '/submissions/S1' },
  { to: '/admin/judging', label: '/admin/judging' },
  { to: '/admin/metrics', label: '/admin/metrics' },
  { to: '/admin/seasons', label: '/admin/seasons' },
];

/**
 * 백엔드 없이 모든 화면·상태를 시연하기 위한 개발용 플로팅 툴바.
 * (실서비스에서는 import.meta.env.DEV 가드로 감싸 두면 된다)
 */
export function DevToolbar() {
  const [open, setOpen] = useState(false);
  const {
    user,
    season,
    passedFirstReview,
    setDevRole,
    setSeasonStatus,
    setCurrentStage,
    setPassedFirstReview,
  } = useAppStore();

  const role = devRoleOf(user);

  if (!open) {
    return (
      <button className={styles.fab} onClick={() => setOpen(true)}>
        DEV ✓ {ROLES.find((r) => r.key === role)?.label}
      </button>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.title}>DEV TOOLBAR</div>
        <button className={styles.close} onClick={() => setOpen(false)} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>역할</div>
        <div className={styles.options}>
          {ROLES.map((item) => (
            <button
              key={item.key}
              className={[styles.option, role === item.key ? styles.optionOn : ''].join(' ')}
              onClick={() => setDevRole(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>시즌 상태</div>
        <div className={styles.options}>
          {STATUSES.map((item) => (
            <button
              key={item.key}
              className={[
                styles.option,
                season.status === item.key ? styles.optionOn : '',
              ].join(' ')}
              onClick={() => setSeasonStatus(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>스테이지</div>
        <div className={styles.options}>
          {STAGES.map((item) => (
            <button
              key={item.key}
              className={[
                styles.option,
                season.currentStage === item.key ? styles.optionOn : '',
              ].join(' ')}
              onClick={() => setCurrentStage(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.switchRow}>
          <span>1차 심사 통과</span>
          <div className={styles.options}>
            <button
              className={[styles.option, passedFirstReview ? styles.optionOn : ''].join(' ')}
              onClick={() => setPassedFirstReview(true)}
            >
              통과
            </button>
            <button
              className={[styles.option, !passedFirstReview ? styles.optionOn : ''].join(' ')}
              onClick={() => setPassedFirstReview(false)}
            >
              미통과
            </button>
          </div>
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupLabel}>바로가기</div>
        <div className={styles.links}>
          {QUICK_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <p className={styles.note}>
        역할·시즌 상태·스테이지·1차 심사 통과 여부를 바꾸면 모든 화면의 가드와 CTA가 즉시
        반영돼요.
      </p>
    </div>
  );
}
