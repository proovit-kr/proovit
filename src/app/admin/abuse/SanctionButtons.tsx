"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/Button";
import { Select } from "@/components/Field";
import { ABUSE_KIND_LABEL } from "@/content/abuse";

import { ReasonModal } from "../ReasonModal";
import { sanctionFlag, type AbuseState } from "./actions";

/*
  판정 카드의 세 버튼 — 시안 「경고」(outline) · 「지표 무효화」(outline, 경고색) ·
  「실격」(danger). 누르면 사유 모달(`#mdl-reason`).

  제재의 근거(제15조 유형)를 모달에서 고른다 — 플래그에 유형이 있으면 그것이
  미리 골라져 있다. 시안 모달에는 이 칸이 없다(내가 정함, 수연 확인 대기).
*/

const INITIAL: AbuseState = {};

type Step = "warning" | "week_invalidated" | "disqualified";

export function SanctionButtons({ flagId, kind }: { flagId: string; kind: string | null }) {
  const [state, action, pending] = useActionState(sanctionFlag, INITIAL);
  const [step, setStep] = useState<Step | null>(null);
  const [reasonKind, setReasonKind] = useState(kind ?? "bot_traffic");

  const [seen, setSeen] = useState(state.done);
  if (seen !== state.done) {
    setSeen(state.done);
    setStep(null);
  }

  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
      <Button type="button" variant="outline" onClick={() => setStep("warning")}>
        경고
      </Button>
      <Button
        type="button"
        variant="outline"
        style={{ borderColor: "rgba(255,183,77,.55)", color: "var(--warn)" }}
        onClick={() => setStep("week_invalidated")}
      >
        지표 무효화
      </Button>
      <Button type="button" variant="danger" onClick={() => setStep("disqualified")}>
        실격
      </Button>
      <ReasonModal
        open={step !== null}
        onClose={() => setStep(null)}
        action={action}
        pending={pending}
        message={state.message}
        fields={{ flagId, step: step ?? "", kind: reasonKind }}
        extra={
          <Select
            aria-label="제재 근거(제15조)"
            style={{ marginTop: "12px" }}
            value={reasonKind}
            onChange={(e) => setReasonKind(e.target.value)}
          >
            {Object.entries(ABUSE_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        }
      />
    </div>
  );
}
