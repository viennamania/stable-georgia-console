"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import {
  STORE_ROUTE_SET_STORE,
  STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
} from "@/lib/security/store-settings-admin";

type StoreManagementConsoleClientProps = {
  lang: string;
};

type FilterState = {
  searchStore: string;
  agentcode: string;
  sortBy: string;
  limit: number;
  page: number;
};

type AgentMeta = {
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
};

type StoreRow = {
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
  totalSettlementCount?: number;
  totalSettlementAmount?: number;
  totalSettlementAmountKRW?: number;
  totalFeeAmount?: number;
  totalFeeAmountKRW?: number;
  escrowAmountUSDT?: number;
  maxPaymentAmountKRW?: number;
  paymentUrl?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
  adminWalletAddress?: string;
  settlementWalletAddress?: string;
  settlementFeePercent?: number;
};

type DashboardResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  stores: StoreRow[];
  totalCount: number;
  summary: {
    visibleCount: number;
    withPaymentUrlCount: number;
    totalBuyerCount: number;
    totalUsdtAmount: number;
    totalSettlementAmountKRW: number;
  };
  storeError: string;
  agents: AgentMeta[];
  agentsError: string;
};

type AddStoreFormState = {
  storecode: string;
  storeName: string;
  agentcode: string;
  storeType: string;
  storeUrl: string;
  storeDescription: string;
  storeLogo: string;
  storeBanner: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

const EMPTY_DASHBOARD_RESULT: DashboardResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  stores: [],
  totalCount: 0,
  summary: {
    visibleCount: 0,
    withPaymentUrlCount: 0,
    totalBuyerCount: 0,
    totalUsdtAmount: 0,
    totalSettlementAmountKRW: 0,
  },
  storeError: "",
  agents: [],
  agentsError: "",
};

const EMPTY_ADD_STORE_FORM: AddStoreFormState = {
  storecode: "",
  storeName: "",
  agentcode: "",
  storeType: "p2p",
  storeUrl: "",
  storeDescription: "",
  storeLogo: "",
  storeBanner: "",
};

const STORE_LIMIT_OPTIONS = [20, 50, 100] as const;
const STORE_SORT_OPTIONS = [
  { value: "", label: "거래량 순" },
  { value: "storeNameDesc", label: "이름 순" },
] as const;

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

const formatDateOnly = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleDateString("ko-KR");
};

const formatUsdtDisplay = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

const formatKrwDisplay = (value: number | null | undefined) =>
  Math.round(Number(value || 0)).toLocaleString("ko-KR");

const formatPercentDisplay = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "-";
  }
  return `${parsed.toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
};

const createDefaultFilters = (): FilterState => ({
  searchStore: "",
  agentcode: "",
  sortBy: "",
  limit: 20,
  page: 1,
});

const fieldClassName =
  "h-11 rounded-2xl border border-white/10 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200";

const createStoreCode = () => {
  const characters = "abcdefghijklmnopqrstuvwxyz";
  let next = "";
  for (let index = 0; index < 8; index += 1) {
    next += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return next;
};

function MetricCard({
  label,
  value,
  unit,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  unit: string;
  helper?: string;
  tone?: "slate" | "sky" | "emerald" | "amber";
}) {
  const toneClassName = {
    slate: "text-slate-950",
    sky: "text-sky-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  }[tone];

  return (
    <article className="console-panel rounded-[26px] p-5">
      <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className={`console-display text-[1.9rem] font-semibold tracking-[-0.06em] ${toneClassName}`}>
          {value}
        </div>
        <div className="console-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {unit}
        </div>
      </div>
      {helper ? <div className="mt-2 text-xs text-slate-500">{helper}</div> : null}
    </article>
  );
}

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
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
}

function StoreLogoBadge({
  storecode,
  storeName,
  storeLogo,
  className,
}: {
  storecode?: string;
  storeName?: string;
  storeLogo?: string;
  className?: string;
}) {
  const resolvedLogo = normalizeString(storeLogo);
  const fallbackCode = normalizeString(storecode).slice(0, 2).toUpperCase() || "ST";

  return (
    <div
      role="img"
      aria-label={normalizeString(storeName) || normalizeString(storecode) || "store"}
      className={className}
      style={resolvedLogo
        ? {
            backgroundImage: `url(${resolvedLogo})`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }
        : undefined}
    >
      {resolvedLogo ? null : (
        <span className="text-xs font-semibold text-slate-500">
          {fallbackCode}
        </span>
      )}
    </div>
  );
}

export default function StoreManagementConsoleClient({
  lang,
}: StoreManagementConsoleClientProps) {
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters());
  const [data, setData] = useState<DashboardResult>(EMPTY_DASHBOARD_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addStoreForm, setAddStoreForm] = useState<AddStoreFormState>(EMPTY_ADD_STORE_FORM);
  const [creatingStore, setCreatingStore] = useState(false);
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const loadDashboard = useCallback(
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
        let signedStoresBody: Record<string, unknown> | null = null;
        let signErrorMessage = "";

        if (canReadSignedData && activeAccount) {
          try {
            signedStoresBody = await createCenterStoreAdminSignedBody({
              account: activeAccount,
              route: "/api/store/getAdminStoreList",
              storecode: "admin",
              body: {
                page: filters.page,
                limit: filters.limit,
                searchStore: filters.searchStore,
                agentcode: filters.agentcode,
                sortBy: filters.sortBy,
              },
            });
          } catch (signError) {
            signErrorMessage = signError instanceof Error ? signError.message : "서명 준비에 실패했습니다.";
          }
        }

        const response = await fetch("/api/bff/admin/store-management", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            page: filters.page,
            limit: filters.limit,
            searchStore: filters.searchStore,
            agentcode: filters.agentcode,
            sortBy: filters.sortBy,
            signedStoresBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load stores");
        }

        const result = payload.result || {};
        setData({
          fetchedAt: normalizeString(result.fetchedAt),
          remoteBackendBaseUrl: normalizeString(result.remoteBackendBaseUrl),
          stores: Array.isArray(result.stores) ? result.stores : [],
          totalCount: normalizeNumber(result.totalCount),
          summary: {
            visibleCount: normalizeNumber(result.summary?.visibleCount),
            withPaymentUrlCount: normalizeNumber(result.summary?.withPaymentUrlCount),
            totalBuyerCount: normalizeNumber(result.summary?.totalBuyerCount),
            totalUsdtAmount: normalizeNumber(result.summary?.totalUsdtAmount),
            totalSettlementAmountKRW: normalizeNumber(result.summary?.totalSettlementAmountKRW),
          },
          storeError: normalizeString(result.storeError),
          agents: Array.isArray(result.agents) ? result.agents : [],
          agentsError: normalizeString(result.agentsError),
        });

        if (signErrorMessage) {
          setFeedback({ tone: "info", message: signErrorMessage });
        } else if (!silent) {
          setFeedback(null);
        }
      } catch (loadError) {
        setFeedback({
          tone: "error",
          message: loadError instanceof Error ? loadError.message : "가맹점 목록을 불러오지 못했습니다.",
        });
      } finally {
        inflightLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);

        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          void loadDashboard({ silent: true });
        }
      }
    },
    [activeAccount, canReadSignedData, filters],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totalPages = Math.max(1, Math.ceil(Math.max(0, data.totalCount) / Math.max(1, filters.limit)));
  const disconnectedMessage = isWalletRecovering
    ? "지갑 연결 상태를 확인하는 중입니다."
    : "관리자 지갑을 연결하면 signed store action을 사용할 수 있습니다.";
  const accessWarningMessage = !canReadSignedData && !isWalletRecovering
    ? "신규 가맹점 생성과 상세 설정 저장은 관리자 지갑 서명이 필요합니다."
    : "";
  const heroStatusLabel = loading
    ? "Loading store ledger"
    : refreshing
      ? "Refreshing store ledger"
      : "Store console synced";
  const heroStatusBadgeClassName = loading
    ? "border-sky-400/30 bg-sky-400/12 text-sky-100"
    : refreshing
      ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
      : "border-white/12 bg-white/8 text-slate-100";
  const walletStateLabel = canReadSignedData
    ? "Admin wallet signed"
    : isWalletRecovering
      ? "Checking admin wallet connection"
      : "Signed wallet required for mutations";

  const applyFilters = () => {
    setFilters({
      searchStore: draftFilters.searchStore,
      agentcode: draftFilters.agentcode,
      sortBy: draftFilters.sortBy,
      limit: draftFilters.limit,
      page: 1,
    });
  };

  const resetFilters = () => {
    const next = createDefaultFilters();
    setDraftFilters(next);
    setFilters(next);
  };

  const handlePageChange = (direction: "prev" | "next") => {
    setFilters((current) => {
      const nextPage = direction === "prev"
        ? Math.max(1, current.page - 1)
        : Math.min(totalPages, current.page + 1);

      if (nextPage === current.page) {
        return current;
      }

      return {
        ...current,
        page: nextPage,
      };
    });
  };

  const updateAddStoreField = <Key extends keyof AddStoreFormState>(
    key: Key,
    value: AddStoreFormState[Key],
  ) => {
    setAddStoreForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submitAddStore = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!activeAccount) {
      setFeedback({
        tone: "error",
        message: "관리자 지갑 연결이 필요합니다.",
      });
      return;
    }

    const storeName = normalizeString(addStoreForm.storeName);
    const agentcode = normalizeString(addStoreForm.agentcode);
    const providedStorecode = normalizeString(addStoreForm.storecode).toLowerCase();

    if (storeName.length < 2) {
      setFeedback({
        tone: "error",
        message: "가맹점 이름은 2자 이상이어야 합니다.",
      });
      return;
    }

    if (!agentcode) {
      setFeedback({
        tone: "error",
        message: "에이전트를 선택해주세요.",
      });
      return;
    }

    setCreatingStore(true);

    try {
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route: STORE_ROUTE_SET_STORE,
        signingPrefix: STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
        requesterStorecode: "admin",
        requesterWalletAddress: activeAccount.address,
        actionFields: {
          agentcode,
          storecode: providedStorecode || createStoreCode(),
          storeName,
          storeType: normalizeString(addStoreForm.storeType) || "p2p",
          storeUrl: normalizeString(addStoreForm.storeUrl),
          storeDescription: normalizeString(addStoreForm.storeDescription),
          storeLogo: normalizeString(addStoreForm.storeLogo),
          storeBanner: normalizeString(addStoreForm.storeBanner),
        },
      });

      const response = await fetch("/api/bff/admin/signed-store-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: STORE_ROUTE_SET_STORE,
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.result) {
        throw new Error(payload?.error || "가맹점 생성에 실패했습니다.");
      }

      setFeedback({
        tone: "success",
        message: `${storeName} 가맹점이 생성되었습니다.`,
      });
      setAddStoreForm(EMPTY_ADD_STORE_FORM);
      setIsAddModalOpen(false);
      setFilters((current) => ({
        ...current,
        page: 1,
      }));
      await loadDashboard();
    } catch (submitError) {
      setFeedback({
        tone: "error",
        message: submitError instanceof Error ? submitError.message : "가맹점 생성에 실패했습니다.",
      });
    } finally {
      setCreatingStore(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-10">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                    Admin store management
                  </div>
                  <div>
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white sm:text-[3.2rem]">
                      가맹점관리
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82 sm:text-[15px]">
                      전체 가맹점 목록, 에이전트 배정, 운영 노출 상태, 상세 설정 진입을 콘솔에서 한 번에 관리합니다.
                    </p>
                  </div>
                </div>

                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${heroStatusBadgeClassName}`}>
                  <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
                  {heroStatusLabel}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Matched stores
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {loading ? "Syncing..." : `${data.totalCount.toLocaleString()} stores`}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">현재 필터 기준 가맹점 수</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Visible stores
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {loading ? "..." : `${data.summary.visibleCount.toLocaleString()} visible`}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">현재 필터에서 노출중인 가맹점</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Last sync
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {data.fetchedAt ? formatDateTime(data.fetchedAt) : "대기 중"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">{walletStateLabel}</div>
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
              disconnectedMessage={disconnectedMessage}
              errorMessage={accessWarningMessage || undefined}
              accessLabel="Admin store mutations"
              title="Admin wallet"
            />
          </div>
        </section>

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <section className="console-panel rounded-[30px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Filters
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                가맹점 검색과 생성
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                storecode, 가맹점명, 에이전트 기준으로 빠르게 필터링하고 관리자 지갑 서명으로 신규 가맹점을 생성합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setIsAddModalOpen(true);
              }}
              disabled={!canReadSignedData}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              가맹점 추가
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input
              value={draftFilters.searchStore}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  searchStore: event.target.value,
                }));
              }}
              placeholder="storecode / 가맹점명 검색"
              className={fieldClassName}
            />
            <select
              value={draftFilters.agentcode}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  agentcode: event.target.value,
                }));
              }}
              className={fieldClassName}
            >
              <option value="">전체 에이전트</option>
              {data.agents.map((agent) => (
                <option key={normalizeString(agent.agentcode)} value={normalizeString(agent.agentcode)}>
                  {normalizeString(agent.agentName) || normalizeString(agent.agentcode) || "에이전트"}
                </option>
              ))}
            </select>
            <select
              value={draftFilters.sortBy}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  sortBy: event.target.value,
                }));
              }}
              className={fieldClassName}
            >
              {STORE_SORT_OPTIONS.map((option) => (
                <option key={option.value || "default"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={String(draftFilters.limit)}
              onChange={(event) => {
                const nextLimit = Number(event.target.value) || 20;
                setDraftFilters((current) => ({
                  ...current,
                  limit: nextLimit,
                }));
              }}
              className={fieldClassName}
            >
              {STORE_LIMIT_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}개씩 보기
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                검색 적용
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                필터 초기화
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadDashboard({ silent: true });
                }}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                새로고침
              </button>
            </div>

            <div className="text-sm text-slate-500">
              페이지 {filters.page.toLocaleString()} / {totalPages.toLocaleString()}
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Matched stores"
            value={data.totalCount.toLocaleString()}
            unit="stores"
            helper="현재 필터 기준 전체 가맹점"
            tone="slate"
          />
          <MetricCard
            label="Visible rows"
            value={data.stores.length.toLocaleString()}
            unit="rows"
            helper="현재 페이지에 로드된 가맹점"
            tone="sky"
          />
          <MetricCard
            label="Buyers on scope"
            value={data.summary.totalBuyerCount.toLocaleString()}
            unit="buyers"
            helper="현재 필터 기준 누적 회원 수"
            tone="amber"
          />
          <MetricCard
            label="Trade volume"
            value={formatUsdtDisplay(data.summary.totalUsdtAmount)}
            unit="USDT"
            helper={`정산 KRW ${formatKrwDisplay(data.summary.totalSettlementAmountKRW)}`}
            tone="emerald"
          />
          <MetricCard
            label="Payment URLs"
            value={data.summary.withPaymentUrlCount.toLocaleString()}
            unit="ready"
            helper="현재 필터에서 결제 URL 설정 완료"
            tone="slate"
          />
        </section>

        {data.agentsError ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {data.agentsError}
          </section>
        ) : null}

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <div>
              <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Store ledger
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                가맹점 목록
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange("prev")}
                disabled={filters.page <= 1}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => handlePageChange("next")}
                disabled={filters.page >= totalPages}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                다음
              </button>
            </div>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-950 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                <tr>
                  <th className="px-6 py-4">등록일</th>
                  <th className="px-6 py-4">가맹점</th>
                  <th className="px-6 py-4">에이전트</th>
                  <th className="px-6 py-4">운영상태</th>
                  <th className="px-6 py-4">결제지갑</th>
                  <th className="px-6 py-4">결제수수료율</th>
                  <th className="px-6 py-4 text-right">거래/정산</th>
                  <th className="px-6 py-4">운영지표</th>
                  <th className="px-6 py-4">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.stores.length > 0 ? (
                  data.stores.map((store, index) => (
                    <tr key={store._id || `${store.storecode || "store"}-${index}`} className="align-top">
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {formatDateOnly(store.createdAt)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDateTime(store.createdAt).split(" ").slice(-2).join(" ")}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <StoreLogoBadge
                            storecode={store.storecode}
                            storeName={store.storeName}
                            storeLogo={store.storeLogo}
                            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {normalizeString(store.storeName) || "이름 미설정"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {normalizeString(store.storecode) || "-"}
                            </div>
                            <div className="line-clamp-2 text-xs leading-5 text-slate-500">
                              {normalizeString(store.storeDescription) || "가맹점 설명이 아직 없습니다."}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {normalizeString(store.agentName) || normalizeString(store.agentcode) || "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {normalizeString(store.agentcode) || "agent 미배정"}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            store.viewOnAndOff === false
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}>
                            {store.viewOnAndOff === false ? "비노출" : "노출중"}
                          </span>
                          <div className="text-xs text-slate-500">
                            admin {shortAddress(store.adminWalletAddress)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {shortAddress(store.settlementWalletAddress)}
                          </div>
                          <div className="text-xs text-slate-500">
                            settlement wallet
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">
                            {formatPercentDisplay(store.settlementFeePercent)}
                          </div>
                          <div className="text-xs text-slate-500">
                            정산 기준 수수료
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-slate-900">
                            구매 {normalizeNumber(store.totalPaymentConfirmedCount).toLocaleString()}건
                          </div>
                          <div className="text-sm font-semibold text-emerald-600">
                            {formatUsdtDisplay(normalizeNumber(store.totalUsdtAmount))} USDT
                          </div>
                          <div className="text-sm font-semibold text-amber-600">
                            {formatKrwDisplay(normalizeNumber(store.totalSettlementAmountKRW))} KRW
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="text-sm text-slate-700">
                            회원 {normalizeNumber(store.totalBuyerCount).toLocaleString()}명
                          </div>
                          <div className="text-sm text-slate-700">
                            에스크로 {formatUsdtDisplay(normalizeNumber(store.escrowAmountUSDT))} USDT
                          </div>
                          <div className="text-sm text-slate-700">
                            최대결제 {formatKrwDisplay(normalizeNumber(store.maxPaymentAmountKRW))} KRW
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              router.push(`/${lang}/admin/store-management/${normalizeString(store.storecode)}`);
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-2xl bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                          >
                            상세설정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                window.open(`/${lang}/${normalizeString(store.storecode)}/buyorder`, "_blank", "noopener,noreferrer");
                              }
                            }}
                            className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          >
                            스토어 콘솔
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-sm text-slate-500">
                      {loading ? "가맹점 목록을 불러오는 중입니다." : "표시할 가맹점이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 p-4 lg:hidden">
            {data.stores.length > 0 ? (
              data.stores.map((store, index) => (
                <article
                  key={store._id || `${store.storecode || "store-card"}-${index}`}
                  className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <StoreLogoBadge
                      storecode={store.storecode}
                      storeName={store.storeName}
                      storeLogo={store.storeLogo}
                      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-slate-950">
                        {normalizeString(store.storeName) || "이름 미설정"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {normalizeString(store.storecode) || "-"} · {formatDateTime(store.createdAt)}
                      </div>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      store.viewOnAndOff === false
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}>
                      {store.viewOnAndOff === false ? "비노출" : "노출중"}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">에이전트</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {normalizeString(store.agentName) || normalizeString(store.agentcode) || "-"}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">관리자 지갑</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {shortAddress(store.adminWalletAddress)}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">결제지갑</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {shortAddress(store.settlementWalletAddress)}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">결제수수료율</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {formatPercentDisplay(store.settlementFeePercent)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">회원 수</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">
                        {normalizeNumber(store.totalBuyerCount).toLocaleString()}명
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">거래량</div>
                      <div className="mt-1 text-sm font-semibold text-emerald-600">
                        {formatUsdtDisplay(normalizeNumber(store.totalUsdtAmount))} USDT
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                      <div className="text-xs font-medium text-slate-500">최대결제</div>
                      <div className="mt-1 text-sm font-semibold text-amber-600">
                        {formatKrwDisplay(normalizeNumber(store.maxPaymentAmountKRW))} KRW
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/${lang}/admin/store-management/${normalizeString(store.storecode)}`);
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      상세설정
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.open(`/${lang}/${normalizeString(store.storecode)}/buyorder`, "_blank", "noopener,noreferrer");
                        }
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      스토어 콘솔
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                {loading ? "가맹점 목록을 불러오는 중입니다." : "표시할 가맹점이 없습니다."}
              </div>
            )}
          </div>
        </section>
      </div>

      {isAddModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="console-panel w-full max-w-3xl rounded-[32px] bg-white p-6 shadow-[0_42px_90px_-56px_rgba(15,23,42,0.7)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Add store
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  신규 가맹점 생성
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  메인 프로젝트의 가맹점 생성 API를 사용해 새 storecode와 기본 프로필을 등록합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (creatingStore) {
                    return;
                  }
                  setIsAddModalOpen(false);
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={submitAddStore}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">가맹점 코드</div>
                  <input
                    value={addStoreForm.storecode}
                    onChange={(event) => updateAddStoreField("storecode", event.target.value.toLowerCase())}
                    placeholder="비워두면 자동 생성"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">가맹점 이름</div>
                  <input
                    value={addStoreForm.storeName}
                    onChange={(event) => updateAddStoreField("storeName", event.target.value)}
                    placeholder="가맹점 이름"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">에이전트</div>
                  <select
                    value={addStoreForm.agentcode}
                    onChange={(event) => updateAddStoreField("agentcode", event.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">에이전트 선택</option>
                    {data.agents.map((agent) => (
                      <option key={normalizeString(agent.agentcode)} value={normalizeString(agent.agentcode)}>
                        {normalizeString(agent.agentName) || normalizeString(agent.agentcode) || "에이전트"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">가맹점 타입</div>
                  <input
                    value={addStoreForm.storeType}
                    onChange={(event) => updateAddStoreField("storeType", event.target.value)}
                    placeholder="p2p"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium text-slate-700">가맹점 URL</div>
                  <input
                    value={addStoreForm.storeUrl}
                    onChange={(event) => updateAddStoreField("storeUrl", event.target.value)}
                    placeholder="https://example.com"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <div className="text-sm font-medium text-slate-700">설명</div>
                  <textarea
                    value={addStoreForm.storeDescription}
                    onChange={(event) => updateAddStoreField("storeDescription", event.target.value)}
                    placeholder="가맹점 설명"
                    className="min-h-[108px] rounded-[24px] border border-white/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">로고 URL</div>
                  <input
                    value={addStoreForm.storeLogo}
                    onChange={(event) => updateAddStoreField("storeLogo", event.target.value)}
                    placeholder="https://..."
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">배너 URL</div>
                  <input
                    value={addStoreForm.storeBanner}
                    onChange={(event) => updateAddStoreField("storeBanner", event.target.value)}
                    placeholder="https://..."
                    className={fieldClassName}
                  />
                </label>
              </div>

              <div className="rounded-[22px] border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                신규 가맹점 생성은 현재 연결된 전체 관리자 지갑 서명으로만 처리됩니다.
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (creatingStore) {
                      return;
                    }
                    setIsAddModalOpen(false);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creatingStore}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {creatingStore ? "생성 중..." : "가맹점 생성"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
