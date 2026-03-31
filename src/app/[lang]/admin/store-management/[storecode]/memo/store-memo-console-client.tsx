"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import {
  STORE_MEMO_READ_SIGNING_PREFIX,
  STORE_ROUTE_GET_ONE_STORE_ADMIN_SIGNED,
  STORE_ROUTE_GET_STORE_MEMO_SIGNED,
  STORE_ROUTE_SET_STORE_MEMO,
  STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
  STORE_SETTINGS_READ_SIGNING_PREFIX,
} from "@/lib/security/store-settings-admin";

type StoreMemoConsoleClientProps = {
  lang: string;
  storecode: string;
};

type StoreDetail = {
  storecode?: string;
  storeName?: string;
  storeLogo?: string;
  companyName?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
};

type MemoContextResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  store: StoreDetail | null;
  storeError: string;
  storeMemo: string;
  storeMemoUpdatedAt: string | null;
  hasPrivilegedMemoRead: boolean;
  memoReadMessage: string;
  memoError: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

const MAX_MEMO_LENGTH = 5000;

const EMPTY_CONTEXT_RESULT: MemoContextResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  store: null,
  storeError: "",
  storeMemo: "",
  storeMemoUpdatedAt: null,
  hasPrivilegedMemoRead: false,
  memoReadMessage: "",
  memoError: "",
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const formatDateTime = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "기록 없음";
  }

  const nextDate = new Date(normalized);
  if (Number.isNaN(nextDate.getTime())) {
    return "기록 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(nextDate);
};

const getStoreDisplayName = (store: StoreDetail | null) =>
  normalizeString(store?.storeName)
  || normalizeString(store?.companyName)
  || normalizeString(store?.storecode)
  || "가맹점";

const getStoreLogoSrc = (store: StoreDetail | null) =>
  normalizeString(store?.storeLogo) || "/logo.png";

export default function StoreMemoConsoleClient({
  lang,
  storecode,
}: StoreMemoConsoleClientProps) {
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();

  const [data, setData] = useState<MemoContextResult>(EMPTY_CONTEXT_RESULT);
  const [storeMemo, setStoreMemo] = useState("");
  const [savedMemo, setSavedMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const store = data.store;
  const walletStateLabel = useMemo(() => {
    switch (walletConnectionStatus) {
      case "connected":
        return "관리자 지갑 연결됨";
      case "connecting":
        return "지갑 연결 중";
      case "disconnected":
        return "지갑 연결 필요";
      default:
        return "지갑 상태 확인 중";
    }
  }, [walletConnectionStatus]);

  const memoLength = storeMemo.length;
  const hasUnsavedChanges = storeMemo !== savedMemo;
  const memoUsageRatio = Math.min(100, Math.round((memoLength / MAX_MEMO_LENGTH) * 100));

  const loadContext = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setFeedback(null);
      }

      try {
        let signedStoreBody: Record<string, unknown> | null = null;
        let signedMemoBody: Record<string, unknown> | null = null;

        if (activeAccount) {
          signedStoreBody = await createAdminSignedBody({
            account: activeAccount,
            route: STORE_ROUTE_GET_ONE_STORE_ADMIN_SIGNED,
            signingPrefix: STORE_SETTINGS_READ_SIGNING_PREFIX,
            requesterStorecode: "admin",
            requesterWalletAddress: activeAccount.address,
            actionFields: { storecode },
          });

          signedMemoBody = await createAdminSignedBody({
            account: activeAccount,
            route: STORE_ROUTE_GET_STORE_MEMO_SIGNED,
            signingPrefix: STORE_MEMO_READ_SIGNING_PREFIX,
            requesterStorecode: "admin",
            requesterWalletAddress: activeAccount.address,
            actionFields: { storecode },
          });
        }

        const response = await fetch("/api/bff/admin/store-management/memo-context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storecode,
            signedStoreBody,
            signedMemoBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "가맹점 메모 정보를 불러오지 못했습니다.");
        }

        const result = payload?.result || {};
        const nextMemo = normalizeString(result.storeMemo);
        const nextData: MemoContextResult = {
          fetchedAt: normalizeString(result.fetchedAt),
          remoteBackendBaseUrl: normalizeString(result.remoteBackendBaseUrl),
          store: result.store || null,
          storeError: normalizeString(result.storeError),
          storeMemo: nextMemo,
          storeMemoUpdatedAt: result.storeMemoUpdatedAt || null,
          hasPrivilegedMemoRead: result.hasPrivilegedMemoRead === true,
          memoReadMessage: normalizeString(result.memoReadMessage),
          memoError: normalizeString(result.memoError),
        };

        setData(nextData);
        setStoreMemo(nextMemo);
        setSavedMemo(nextMemo);

        if (nextData.memoReadMessage) {
          setFeedback({
            tone: "info",
            message: nextData.memoReadMessage,
          });
        }
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "가맹점 메모 정보를 불러오지 못했습니다.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeAccount, storecode],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const saveStoreMemo = useCallback(async () => {
    if (!activeAccount) {
      setFeedback({
        tone: "error",
        message: "관리자 지갑 연결이 필요합니다.",
      });
      return;
    }

    if (memoLength > MAX_MEMO_LENGTH) {
      setFeedback({
        tone: "error",
        message: `메모는 ${MAX_MEMO_LENGTH.toLocaleString()}자 이하로 입력하세요.`,
      });
      return;
    }

    if (!hasUnsavedChanges) {
      setFeedback({
        tone: "info",
        message: "저장할 변경사항이 없습니다.",
      });
      return;
    }

    setSavingMemo(true);

    try {
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route: STORE_ROUTE_SET_STORE_MEMO,
        signingPrefix: STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
        requesterStorecode: "admin",
        requesterWalletAddress: activeAccount.address,
        actionFields: {
          storecode,
          walletAddress: activeAccount.address,
          storeMemo,
        },
      });

      const response = await fetch("/api/bff/admin/signed-store-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: STORE_ROUTE_SET_STORE_MEMO,
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "가맹점 메모 저장에 실패했습니다.");
      }

      setSavedMemo(storeMemo);
      setFeedback({
        tone: "success",
        message: "가맹점 메모를 저장했습니다.",
      });
      await loadContext({ silent: true });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "가맹점 메모 저장에 실패했습니다.",
      });
    } finally {
      setSavingMemo(false);
    }
  }, [activeAccount, hasUnsavedChanges, loadContext, memoLength, storeMemo, storecode]);

  const feedbackClassName = feedback?.tone === "error"
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : feedback?.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-sky-200 bg-sky-50 text-sky-700";

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 pb-10">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => router.push(`/${lang}/admin/store-management/${storecode}`)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/12"
                    >
                      <span aria-hidden="true">←</span>
                      Back to settings
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <div
                      className="h-16 w-16 rounded-[22px] border border-white/12 bg-white/10 bg-cover bg-center shadow-[0_18px_42px_rgba(15,23,42,0.3)]"
                      style={{ backgroundImage: `url(${getStoreLogoSrc(store)})` }}
                      aria-hidden="true"
                    />
                    <div>
                      <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white sm:text-[3rem]">
                        {getStoreDisplayName(store)}
                      </h1>
                      <p className="mt-2 text-sm leading-6 text-slate-200/80">
                        {storecode} 메모
                      </p>
                    </div>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                  <span
                    className={`h-2 w-2 rounded-full ${store?.liveOnAndOff === false ? "bg-amber-300" : "bg-emerald-300"}`}
                    aria-hidden="true"
                  />
                  {store?.liveOnAndOff === false ? "중지됨" : "운영중"}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Storecode
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {storecode}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">{walletStateLabel}</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Exposure
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {store?.viewOnAndOff === false ? "비노출" : "노출중"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    마지막 동기화 {data.fetchedAt ? formatDateTime(data.fetchedAt) : "대기 중"}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Updated
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {formatDateTime(data.storeMemoUpdatedAt)}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    {memoLength.toLocaleString()} / {MAX_MEMO_LENGTH.toLocaleString()}
                  </div>
                </div>
              </div>

              {data.storeError ? (
                <div className="rounded-[24px] border border-amber-300/24 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {data.storeError}
                </div>
              ) : null}
            </div>

            <AdminWalletCard
              address={activeAccount?.address}
              disconnectedMessage="관리자 지갑 연결 후 메모를 조회하고 저장할 수 있습니다."
              errorMessage={data.memoError || ""}
              accessLabel="Admin store memo"
              title="Admin wallet"
            />
          </div>
        </section>

        {feedback ? (
          <div className={`rounded-[24px] border px-4 py-3 text-sm ${feedbackClassName}`}>
            {feedback.message}
          </div>
        ) : null}

        <section className="console-panel rounded-[32px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(248,252,255,0.98),rgba(255,255,255,0.98))] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="console-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sky-700">
                Store memo
              </div>
              <h2 className="console-display mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                가맹점 메모
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void loadContext({ silent: true })}
                disabled={loading || refreshing}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "새로고침 중..." : "메모 새로고침"}
              </button>
              <button
                type="button"
                onClick={() => void saveStoreMemo()}
                disabled={savingMemo || !data.hasPrivilegedMemoRead}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingMemo ? "메모 저장 중..." : "메모 저장하기"}
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_20px_48px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="text-sm font-semibold text-slate-900">운영 메모</div>
              <div className="text-xs font-medium text-slate-500">
                길이 사용량 {memoUsageRatio}%
              </div>
            </div>
            <div className="px-5 py-5">
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#0f172a_0%,#2563eb_60%,#14b8a6_100%)] transition-[width]"
                  style={{ width: `${memoUsageRatio}%` }}
                />
              </div>
              <textarea
                value={storeMemo}
                onChange={(event) => setStoreMemo(event.target.value.slice(0, MAX_MEMO_LENGTH))}
                disabled={!data.hasPrivilegedMemoRead || loading}
                placeholder="가맹점 운영 메모를 입력하세요. 예: 정산 주의사항, 운영 메모, 특이 고객 응대 이력"
                className="min-h-[320px] w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                <div>
                  {hasUnsavedChanges
                    ? "저장되지 않은 변경사항이 있습니다."
                    : "현재 메모가 서버와 동기화되어 있습니다."}
                </div>
                <div>
                  마지막 반영 시각: {formatDateTime(data.storeMemoUpdatedAt)}
                </div>
              </div>
            </div>
          </div>

          {!data.hasPrivilegedMemoRead ? (
            <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {data.memoReadMessage || "관리자 지갑 연결 후 메모를 조회하고 저장할 수 있습니다."}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
