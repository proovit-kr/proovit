"use client";

import { useState, useTransition } from "react";

import { logout } from "@/app/actions/auth";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import { Field, SwitchRow } from "@/components/Field";
import { Modal } from "@/components/Modal";
import {
  SETTINGS_ACCOUNT,
  SETTINGS_CHANNELS,
  SETTINGS_QUIT,
} from "@/content/settings";

import hub from "../dashboard/hub.module.css";

import { setChannel, withdraw } from "./actions";

/* 시안 `.bd-warn`에 인라인으로 덮은 카카오 노랑 */
const KAKAO = {
  background: "rgba(254,229,0,.12)",
  color: "#FEE500",
  borderColor: "rgba(254,229,0,.4)",
} as const;

export function SettingsPanel({
  email,
  providers,
  notifyEmail,
  notifyAlimtalk,
}: {
  email: string;
  providers: ("kakao" | "google")[];
  notifyEmail: boolean;
  notifyAlimtalk: boolean;
}) {
  const [quit, setQuit] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Field label={SETTINGS_CHANNELS.label}>
        <SwitchRow
          rowProps={{ style: { marginBottom: "10px" } }}
          title={SETTINGS_CHANNELS.email.title}
          desc={SETTINGS_CHANNELS.email.desc}
          defaultChecked={notifyEmail}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            start(() => setChannel("email", on));
          }}
        />
        <SwitchRow
          title={SETTINGS_CHANNELS.alimtalk.title}
          desc={SETTINGS_CHANNELS.alimtalk.desc}
          defaultChecked={notifyAlimtalk}
          onChange={(e) => {
            const on = e.currentTarget.checked;
            start(() => setChannel("alimtalk", on));
          }}
        />
      </Field>

      <Field label={SETTINGS_ACCOUNT.label}>
        <div className={hub.keybox}>
          {email}{" "}
          {providers.map((p) =>
            p === "kakao" ? (
              <Badge key={p} tone="warn" style={KAKAO}>
                {SETTINGS_ACCOUNT.linked.kakao}
              </Badge>
            ) : (
              <Badge key={p} tone="gray">
                {SETTINGS_ACCOUNT.linked.google}
              </Badge>
            ),
          )}
        </div>
      </Field>

      <div style={{ display: "flex", gap: "12px", marginTop: "26px" }}>
        {/* 폼은 상자를 안 만든다 — 버튼이 시안처럼 이 줄의 flex 항목이다 */}
        <form action={logout} style={{ display: "contents" }}>
          <Button type="submit" variant="ghost">
            {SETTINGS_ACCOUNT.logout}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          style={{ marginLeft: "auto", color: "var(--danger)" }}
          onClick={() => setQuit(true)}
        >
          {SETTINGS_ACCOUNT.quit}
        </Button>
      </div>

      <Modal
        open={quit}
        onClose={() => setQuit(false)}
        title={SETTINGS_QUIT.title}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setQuit(false)}>
              {SETTINGS_QUIT.cancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => start(() => withdraw())}
            >
              {SETTINGS_QUIT.confirm}
            </Button>
          </>
        }
      >
        <p>
          <Clauses text={SETTINGS_QUIT.body} />
        </p>
      </Modal>
    </>
  );
}
