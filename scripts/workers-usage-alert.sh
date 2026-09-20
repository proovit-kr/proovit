#!/bin/bash
# Workers 무료 한도(계정당 하루 10만 요청) 감시 → ntfy 푸시.
#
# 왜 로컬에서 도는가: Aside 루틴은 앱이 떠 있어야 돌고, 클라우드플레어에는
# **무료 한도에 대한 사전 경고 알림이 없다**(넘긴 뒤 통지만 온다). 한도를
# 넘기는 순간 `*.proovit.kr` 라우트가 1027로 닫혀 참가작이 통째로 죽으므로,
# 맥이 켜져 있는 한 스스로 도는 감시가 필요하다.
#
# ⚠️ 리셋은 **UTC 자정**이다 = 한국시간 오전 9시. 하루 경계가 서울이 아니다
#    (우리 측정 파이프라인의 중복 제거는 서울 기준이라 둘이 어긋난다).
#
# 설치:
#   cp scripts/kr.proovit.workers-usage-alert.plist ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/kr.proovit.workers-usage-alert.plist
#
# 시험 발송:  scripts/workers-usage-alert.sh --test
#
# 설정은 리포 루트의 .env.workers-alert 에 있다(.gitignore 대상).

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.workers-alert"
STATE="${TMPDIR:-/tmp}/proovit-workers-alert-state"

[ -f "$ENV_FILE" ] || { echo "!! $ENV_FILE 가 없다"; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

: "${CF_API_TOKEN:?CF_API_TOKEN 없음}"
: "${CF_ACCOUNT_ID:?CF_ACCOUNT_ID 없음}"
: "${NTFY_TOPIC:?NTFY_TOPIC 없음}"
NTFY_SERVER="${NTFY_SERVER:-https://ntfy.sh}"
LIMIT="${WORKERS_DAILY_LIMIT:-100000}"
WARN_PCT="${WARN_PCT:-60}"
URGENT_PCT="${URGENT_PCT:-85}"

# ── ntfy ──────────────────────────────────────────────────────────────
# 제목·본문에 한글이 들어가므로 헤더는 RFC 2047 대신 ntfy가 받는 UTF-8을 그대로
# 쓴다(ntfy는 X-Title에 UTF-8을 허용한다).
notify() { # notify <priority> <tags> <title> <body>
  curl -s -m 15 \
    -H "X-Title: $3" \
    -H "X-Priority: $1" \
    -H "X-Tags: $2" \
    -d "$4" \
    "$NTFY_SERVER/$NTFY_TOPIC" > /dev/null
}

if [ "${1:-}" = "--test" ]; then
  notify default white_check_mark "PROOVIT 감시 시험" \
    "이 알림이 보이면 연결이 정상입니다. 실제 알림은 사용량이 ${WARN_PCT}%를 넘을 때만 옵니다."
  echo "시험 발송함 → $NTFY_SERVER/$NTFY_TOPIC"
  exit 0
fi

# ── 사용량 조회 ───────────────────────────────────────────────────────
START="$(date -u +%Y-%m-%dT00:00:00Z)"
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
UTC_DAY="$(date -u +%Y-%m-%d)"

read -r -d '' QUERY <<'GQL'
query($acc:String!,$start:Time!,$end:Time!){viewer{accounts(filter:{accountTag:$acc}){workersInvocationsAdaptive(limit:100,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests}dimensions{scriptName}}}}}
GQL

BODY=$(printf '{"query":%s,"variables":{"acc":"%s","start":"%s","end":"%s"}}' \
  "$(printf '%s' "$QUERY" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/^/"/' -e 's/$/"/' | tr -d '\n')" \
  "$CF_ACCOUNT_ID" "$START" "$END")

RESP=$(curl -s -m 20 -X POST https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$BODY")

# 조회 자체가 실패하면 **세 번 연속일 때만** 알린다. 네트워크가 잠깐 끊긴 것까지
# 울리면 알림이 무뎌지고, 그러면 진짜 경고를 흘려보내게 된다.
FAILS_FILE="$STATE.fails"
if [ -z "$RESP" ] || printf '%s' "$RESP" | grep -q '"errors":\[{'; then
  N=$(( $(cat "$FAILS_FILE" 2>/dev/null || echo 0) + 1 ))
  echo "$N" > "$FAILS_FILE"
  if [ "$N" -eq 3 ]; then
    notify default warning "PROOVIT 사용량 조회 실패" \
      "Workers 사용량을 세 번 연속 못 읽었습니다. API 토큰이 만료·삭제됐는지 확인해 주세요."
  fi
  echo "조회 실패 (연속 $N회): $(printf '%s' "$RESP" | head -c 200)"
  exit 1
fi
echo 0 > "$FAILS_FILE"

USED=$(printf '%s' "$RESP" | grep -o '"requests":[0-9]*' | cut -d: -f2 | awk '{s+=$1} END{print s+0}')
PCT=$(( USED * 100 / LIMIT ))

# 리셋(UTC 자정)까지 남은 분
NOW_MIN=$(( 10#$(date -u +%H) * 60 + 10#$(date -u +%M) ))
LEFT_MIN=$(( 1440 - NOW_MIN ))
LEFT_TXT="$(( LEFT_MIN / 60 ))시간 $(( LEFT_MIN % 60 ))분"

# 지금 속도로 갔을 때 한도에 닿는 시각(한국시간). 0으로 나누지 않게 막는다.
ETA_TXT="예측 불가"
if [ "$USED" -gt 0 ] && [ "$NOW_MIN" -gt 0 ]; then
  RATE_PER_MIN=$(( USED / NOW_MIN ))
  if [ "$RATE_PER_MIN" -gt 0 ]; then
    NEED=$(( (LIMIT - USED) / RATE_PER_MIN ))
    if [ "$NEED" -lt "$LEFT_MIN" ]; then
      ETA_TXT="$(date -v+${NEED}M +%H:%M 2>/dev/null || date -d "+${NEED} minutes" +%H:%M) 경 도달"
    else
      ETA_TXT="오늘 안에는 도달 안 함"
    fi
  fi
fi

echo "[$(date '+%F %T')] ${USED}/${LIMIT} (${PCT}%) · 리셋까지 ${LEFT_TXT} · ${ETA_TXT}"

# ── 단계 판정 ─────────────────────────────────────────────────────────
LEVEL=0
[ "$PCT" -ge "$WARN_PCT" ] && LEVEL=1
[ "$PCT" -ge "$URGENT_PCT" ] && LEVEL=2
[ "$USED" -ge "$LIMIT" ] && LEVEL=3
[ "$LEVEL" -eq 0 ] && exit 0

# 같은 UTC 날짜 안에서 같은 단계를 두 번 알리지 않는다.
PREV_DAY=$(cut -d' ' -f1 "$STATE" 2>/dev/null || echo "")
PREV_LEVEL=$(cut -d' ' -f2 "$STATE" 2>/dev/null || echo 0)
[ "$PREV_DAY" != "$UTC_DAY" ] && PREV_LEVEL=0
[ "$LEVEL" -le "$PREV_LEVEL" ] && exit 0
echo "$UTC_DAY $LEVEL" > "$STATE"

UPGRADE="https://dash.cloudflare.com/$CF_ACCOUNT_ID/billing/subscriptions"

case "$LEVEL" in
  1) notify default warning "Workers 한도 ${PCT}%" \
       "${USED}/${LIMIT} 요청. 리셋(한국시간 09:00)까지 ${LEFT_TXT}. ${ETA_TXT}." ;;
  2) notify urgent rotating_light "Workers 한도 ${PCT}% — 곧 참가작이 막힙니다" \
       "${USED}/${LIMIT} 요청. ${ETA_TXT}. 한도를 넘기면 *.proovit.kr 이 1027로 닫힙니다. 지금 Workers Paid(\$5/월)로 올리세요: ${UPGRADE}" ;;
  3) notify urgent sos "Workers 한도 초과 — 참가작 다운" \
       "${USED}/${LIMIT}. *.proovit.kr 요청이 1027로 거절되고 있습니다. 즉시 업그레이드: ${UPGRADE}" ;;
esac
