import { useReducedMotion } from '@/hooks/useReducedMotion';

interface Props {
  /** 시안과 동일한 y값 배열 (작을수록 높은 값, 기준 높이 18) */
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  delaySec?: number;
}

const BASE_H = 18;

/** 리더보드·참가작에서 반복되는 스파크라인. 마운트 시 선이 그려진다. */
export function Sparkline({
  values,
  width = 52,
  height = 18,
  color = 'var(--c-lime)',
  delaySec = 0,
}: Props) {
  const reduced = useReducedMotion();
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((v, i) => `${Math.round(i * step)},${((v / BASE_H) * height).toFixed(1)}`)
    .join(' ');
  const dash = Math.round(width * 1.4);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        opacity={0.8}
        style={
          reduced
            ? undefined
            : {
                strokeDasharray: dash,
                strokeDashoffset: dash,
                animation: `drawLine 1.1s ease-out ${delaySec}s forwards`,
              }
        }
      />
    </svg>
  );
}
