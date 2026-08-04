import type {
  Season,
  StageKey,
  StageSubmission,
  SubmissionStatus,
  SubmittableStage,
} from '@/types';

export const STAGE_ORDER: StageKey[] = ['S1', 'REVIEW1', 'S2', 'S3', 'FINAL'];

export const stageIndex = (stage: StageKey) => STAGE_ORDER.indexOf(stage);

export const isSubmittableStage = (value: string): value is SubmittableStage =>
  value === 'S1' || value === 'S2' || value === 'S3';

export const stageLabel = (season: Season, stage: StageKey) =>
  season.stages.find((s) => s.key === stage)?.label ?? stage;

/**
 * 시즌의 현재 스테이지와 1차 심사 통과 여부로 각 제출물의 상태를 파생한다.
 * (백엔드가 붙으면 서버가 내려주는 status를 그대로 쓰면 된다)
 */
export function deriveSubmissionStatus(
  submission: StageSubmission,
  season: Season,
  passedFirstReview: boolean,
): SubmissionStatus {
  // 이미 제출한 건 그대로 유지
  if (submission.status === 'SUBMITTED' || submission.status === 'PASSED') {
    return submission.status;
  }

  const current = stageIndex(season.currentStage);
  const target = stageIndex(submission.stage);

  if (submission.stage === 'S1') {
    return current >= stageIndex('S1') ? 'NOT_SUBMITTED' : 'LOCKED';
  }
  // S2 이후는 1차 심사 통과가 전제
  if (!passedFirstReview) return 'LOCKED';
  return current >= target ? 'NOT_SUBMITTED' : 'LOCKED';
}

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  LOCKED: '🔒 잠김',
  NOT_SUBMITTED: '미제출',
  SUBMITTED: '심사 대기',
  PASSED: '통과',
  HELD: '보류',
};
