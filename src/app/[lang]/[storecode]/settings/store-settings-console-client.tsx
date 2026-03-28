"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";

type StoreSettingsConsoleClientProps = {
  lang: string;
  storecode: string;
};

type BankInfo = {
  bankName?: string;
  bankCode?: string;
  accountHolder?: string;
  accountNumber?: string;
};

type PayactionKey = {
  payactionApiKey?: string;
  payactionWebhookKey?: string;
  payactionShopId?: string;
};

type AgentMeta = {
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
};

type StoreDetail = {
  _id?: string;
  createdAt?: string;
  storecode?: string;
  storeName?: string;
  storeLogo?: string;
  storeDescription?: string;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  totalBuyerCount?: number;
  totalPaymentConfirmedCount?: number;
  totalUsdtAmount?: number;
  totalSettlementAmountKRW?: number;
  escrowAmountUSDT?: number;
  maxPaymentAmountKRW?: number;
  paymentUrl?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
  adminWalletAddress?: string;
  settlementWalletAddress?: string;
  privateSaleWalletAddress?: string;
  sellerWalletAddress?: string;
  backgroundColor?: string;
  accessToken?: string;
  payactionKey?: PayactionKey | null;
  withdrawalBankInfo?: BankInfo | null;
  withdrawalBankInfoAAA?: BankInfo | null;
  withdrawalBankInfoBBB?: BankInfo | null;
};

type ContextResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  store: StoreDetail | null;
  storeError: string;
  agents: AgentMeta[];
  agentsError: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

const EMPTY_CONTEXT_RESULT: ContextResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  store: null,
  storeError: "",
  agents: [],
  agentsError: "",
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const shortAddress = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= 14) {
    return normalized;
  }
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const formatDateTime = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatUsdtDisplay = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

const formatKrwDisplay = (value: number | null | undefined) =>
  Math.round(Number(value || 0)).toLocaleString("ko-KR");

const normalizeHexColor = (value: unknown) => {
  const normalized = normalizeString(value);
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "#0f172a";
};

const maskSecret = (value?: string | null, visibleTail = 4) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "미설정";
  }
  if (normalized.length <= visibleTail * 2) {
    return "*".repeat(normalized.length);
  }
  return `${normalized.slice(0, visibleTail)}${"*".repeat(Math.max(4, normalized.length - (visibleTail * 2)))}${normalized.slice(-visibleTail)}`;
};

const CurrentValue = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-semibold text-slate-900">{value || "-"}</div>
    </div>
  );
};

const SettingsCard = ({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) => {
  return (
    <section className="console-panel rounded-[30px] p-6">
      <div className="border-b border-slate-200 pb-5">
        <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
          {eyebrow}
        </div>
        <h2 className="console-display mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="pt-6">{children}</div>
    </section>
  );
};

const FeedbackBanner = ({ feedback }: { feedback: FeedbackState }) => {
  const toneClass =
    feedback.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : feedback.tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <section className={`rounded-[24px] border px-4 py-3 text-sm font-medium ${toneClass}`}>
      {feedback.message}
    </section>
  );
};

const MetricCard = ({
  label,
  value,
  unit,
  helper,
}: {
  label: string;
  value: string;
  unit: string;
  helper: string;
}) => {
  return (
    <article className="console-panel rounded-[26px] p-5">
      <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="console-display text-[1.85rem] font-semibold tracking-[-0.06em] text-slate-950">
          {value}
        </div>
        <div className="console-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {unit}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">{helper}</div>
    </article>
  );
};

export default function StoreSettingsConsoleClient({
  lang,
  storecode,
}: StoreSettingsConsoleClientProps) {
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [data, setData] = useState<ContextResult>(EMPTY_CONTEXT_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const loadContext = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);

      if (inflightLoadRef.current) {
        if (silent) {
          queuedSilentRefreshRef.current = true;
        }
        return;
      }

      inflightLoadRef.current = true;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        let signedStoreBody: Record<string, unknown> | null = null;
        let signWarning = "";

        if (canReadSignedData && activeAccount) {
          try {
            signedStoreBody = await createCenterStoreAdminSignedBody({
              account: activeAccount,
              route: "/api/store/getOneStore",
              storecode,
              body: {
                storecode,
              },
            });
          } catch (error) {
            signWarning = error instanceof Error ? error.message : "가맹점 설정 서명 준비에 실패했습니다.";
          }
        }

        const response = await fetch("/api/bff/store/settings-context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            storecode,
            signedStoreBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "가맹점 설정 정보를 불러오지 못했습니다.");
        }

        const result = payload.result || {};
        setData({
          fetchedAt: normalizeString(result.fetchedAt),
          remoteBackendBaseUrl: normalizeString(result.remoteBackendBaseUrl),
          store: result.store && typeof result.store === "object"
            ? (result.store as StoreDetail)
            : null,
          storeError: normalizeString(result.storeError),
          agents: Array.isArray(result.agents) ? result.agents : [],
          agentsError: normalizeString(result.agentsError),
        });

        if (signWarning) {
          setFeedback({
            tone: "info",
            message: signWarning,
          });
        } else if (!silent) {
          setFeedback(null);
        }
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "가맹점 설정 정보를 불러오지 못했습니다.",
        });
      } finally {
        inflightLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);

        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          void loadContext({ silent: true });
        }
      }
    },
    [activeAccount, canReadSignedData, storecode],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const store = data.store;
  const agent = useMemo(() => {
    const currentAgentcode = normalizeString(store?.agentcode);
    return data.agents.find((item) => normalizeString(item.agentcode) === currentAgentcode) || null;
  }, [data.agents, store?.agentcode]);

  const storeConsoleUrl = `/${lang}/${storecode}/buyorder`;
  const publicStoreConsoleUrl = data.remoteBackendBaseUrl
    ? `${data.remoteBackendBaseUrl}/${lang}/${storecode}/buyorder`
    : "";

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 pb-10">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/${lang}/${storecode}/buyorder`)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/12"
                  >
                    <span aria-hidden="true">←</span>
                    Back to store console
                  </button>
                  <div>
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white sm:text-[3.1rem]">
                      {normalizeString(store?.storeName) || storecode}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82 sm:text-[15px]">
                      현재 가맹점의 브랜드 정보, 지갑 구성, 출금 계좌, 결제 설정 상태를 한 화면에서 확인합니다.
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                  {loading ? "Loading settings" : refreshing ? "Refreshing settings" : "Settings synced"}
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
                  <div className="mt-1 text-xs text-slate-300/75">
                    {store?.viewOnAndOff === false ? "비노출" : "노출중"}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Admin wallet
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {shortAddress(store?.adminWalletAddress)}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">가맹점 관리자 지갑</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Last sync
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {data.fetchedAt ? formatDateTime(data.fetchedAt) : "대기 중"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    {canReadSignedData ? "Store admin signed" : "Signed store admin recommended"}
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
              address={activeAccount?.address || null}
              disconnectedMessage={
                isWalletRecovering
                  ? "지갑 연결 상태를 확인하는 중입니다."
                  : "가맹점 관리자 지갑 연결 후 보호된 설정 정보를 읽을 수 있습니다."
              }
              errorMessage={
                !canReadSignedData && !isWalletRecovering
                  ? "서명 없이도 일부 공개 정보는 보이지만, 보호된 지갑/키 정보는 제한될 수 있습니다."
                  : undefined
              }
              accessLabel="Store settings read"
              title="Store admin wallet"
            />
          </div>
        </section>

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Confirmed orders"
            value={normalizeNumber(store?.totalPaymentConfirmedCount).toLocaleString()}
            unit="orders"
            helper="확정된 구매 주문 수"
          />
          <MetricCard
            label="Trade volume"
            value={formatUsdtDisplay(normalizeNumber(store?.totalUsdtAmount))}
            unit="USDT"
            helper="누적 USDT 거래량"
          />
          <MetricCard
            label="Members"
            value={normalizeNumber(store?.totalBuyerCount).toLocaleString()}
            unit="buyers"
            helper="가맹점 회원 수"
          />
          <MetricCard
            label="Settlement"
            value={formatKrwDisplay(normalizeNumber(store?.totalSettlementAmountKRW))}
            unit="KRW"
            helper={`에스크로 ${formatUsdtDisplay(normalizeNumber(store?.escrowAmountUSDT))} USDT`}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
          <div className="space-y-6">
            <SettingsCard
              eyebrow="Store identity"
              title="기본 가맹점 정보"
              description="현재 가맹점 브랜딩과 운영 메타 정보를 읽기 전용으로 확인합니다."
            >
              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                      {normalizeString(store?.storeLogo) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={normalizeString(store?.storeLogo)}
                          alt={normalizeString(store?.storeName) || storecode}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="console-display text-xl font-semibold text-slate-500">
                          {(normalizeString(store?.storeName) || storecode).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold text-slate-950">
                        {normalizeString(store?.storeName) || "이름 미설정"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{storecode}</div>
                      <div className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">
                        {normalizeString(store?.storeDescription) || "가맹점 소개가 아직 없습니다."}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <CurrentValue label="생성일" value={formatDateTime(store?.createdAt)} />
                    <CurrentValue
                      label="Agent"
                      value={normalizeString(store?.agentName) || normalizeString(agent?.agentName) || normalizeString(store?.agentcode) || "-"}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.open(storeConsoleUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      스토어 콘솔 열기
                    </button>
                    {publicStoreConsoleUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined") {
                            navigator.clipboard.writeText(publicStoreConsoleUrl).catch(() => {});
                          }
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        콘솔 링크 복사
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <CurrentValue
                    label="노출 상태"
                    value={store?.viewOnAndOff === false ? "비노출" : "노출중"}
                  />
                  <CurrentValue
                    label="배경색"
                    value={normalizeHexColor(store?.backgroundColor)}
                  />
                  <CurrentValue
                    label="결제 URL"
                    value={normalizeString(store?.paymentUrl) || "미설정"}
                  />
                  <CurrentValue
                    label="최대 결제 금액"
                    value={`${formatKrwDisplay(store?.maxPaymentAmountKRW)} KRW`}
                  />
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 sm:col-span-2">
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                      배경 미리보기
                    </div>
                    <div
                      className="mt-3 h-20 rounded-[18px] border border-slate-200"
                      style={{ backgroundColor: normalizeHexColor(store?.backgroundColor) }}
                    />
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Wallet topology"
              title="지갑 구성 정보"
              description="현재 가맹점 운영에 연결된 주요 지갑 주소입니다."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <CurrentValue label="관리자 지갑" value={normalizeString(store?.adminWalletAddress) || "-"} />
                <CurrentValue label="정산 지갑" value={normalizeString(store?.settlementWalletAddress) || "-"} />
                <CurrentValue label="판매 지갑" value={normalizeString(store?.sellerWalletAddress) || "-"} />
                <CurrentValue label="Private sale 지갑" value={normalizeString(store?.privateSaleWalletAddress) || "-"} />
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Withdrawal presets"
              title="출금 계좌 프리셋"
              description="일반, 1등급, 2등급 출금 계좌 설정 현황입니다."
            >
              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  {
                    title: "기본 출금 계좌",
                    info: store?.withdrawalBankInfo,
                  },
                  {
                    title: "1등급 출금 계좌",
                    info: store?.withdrawalBankInfoAAA,
                  },
                  {
                    title: "2등급 출금 계좌",
                    info: store?.withdrawalBankInfoBBB,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4"
                  >
                    <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-4 grid gap-3">
                      <CurrentValue label="은행명" value={normalizeString(item.info?.bankName) || "-"} />
                      <CurrentValue label="계좌번호" value={normalizeString(item.info?.accountNumber) || "-"} />
                      <CurrentValue label="예금주명" value={normalizeString(item.info?.accountHolder) || "-"} />
                    </div>
                  </div>
                ))}
              </div>
            </SettingsCard>
          </div>

          <div className="space-y-6">
            <SettingsCard
              eyebrow="Payment infrastructure"
              title="결제 설정 상태"
              description="민감 정보는 마스킹하고, 설정 여부와 핵심 식별자만 표시합니다."
            >
              <div className="grid gap-3">
                <CurrentValue
                  label="PAYACTION API KEY"
                  value={maskSecret(store?.payactionKey?.payactionApiKey)}
                />
                <CurrentValue
                  label="PAYACTION WEBHOOK KEY"
                  value={maskSecret(store?.payactionKey?.payactionWebhookKey)}
                />
                <CurrentValue
                  label="PAYACTION SHOP ID"
                  value={normalizeString(store?.payactionKey?.payactionShopId) || "미설정"}
                />
                <CurrentValue
                  label="Access Token"
                  value={maskSecret(store?.accessToken)}
                />
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Operations"
              title="운영 참고 값"
              description="현재 주문/정산 운영에 직접 쓰이는 핵심 수치입니다."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <CurrentValue
                  label="에스크로 수량"
                  value={`${formatUsdtDisplay(store?.escrowAmountUSDT)} USDT`}
                />
                <CurrentValue
                  label="누적 거래량"
                  value={`${formatUsdtDisplay(store?.totalUsdtAmount)} USDT`}
                />
                <CurrentValue
                  label="정산 KRW"
                  value={`${formatKrwDisplay(store?.totalSettlementAmountKRW)} KRW`}
                />
                <CurrentValue
                  label="회원 수"
                  value={`${normalizeNumber(store?.totalBuyerCount).toLocaleString()}명`}
                />
              </div>
            </SettingsCard>

            {data.agentsError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {data.agentsError}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
