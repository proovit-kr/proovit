#!/usr/bin/env bash
# 인증 키 3개를 .env → Vercel Production 으로 옮긴다.
# 값을 화면·명령줄 어디에도 남기지 않는다 (stdin 으로만 전달).
# 한 번 넣고 나면 다시 돌릴 일이 없다. 키를 회전하면 `vercel env rm` 후 재실행.
set -euo pipefail
cd "$(dirname "$0")/.."

for K in AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET; do
  V=$(grep "^${K}=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
  if [ -z "$V" ]; then
    echo "!! ${K} 가 .env 에 없다 — 건너뜀"
    continue
  fi
  printf '%s' "$V" | npx vercel env add "$K" production
  echo "-- ${K} 등록됨 (${#V}자)"
done

echo
echo "== Production 현황 =="
npx vercel env ls production
