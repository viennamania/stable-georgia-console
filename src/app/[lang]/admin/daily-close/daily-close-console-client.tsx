"use client";

import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";

type DailyCloseConsoleClientProps = {
  lang: string;
  forcedStorecode: string;
};

type FilterState = {
  fromDate: string;
  toDate: string;
  searchBuyer: string;
  searchDepositName: string;
  searchStoreBankAccountNumber: string;
};

type DailyCloseRow = {
  date: string;
  totalCount: number;
  totalUsdtAmount: number;
  totalKrwAmount: number;
  totalSettlementCount: number;
  totalSettlementAmount: number;
  totalSettlementAmountKRW: number;
  totalAgentFeeAmount: number;
  totalAgentFeeAmountKRW: number;
  totalFeeAmount: number;
  totalFeeAmountKRW: number;
  totalEscrowCount: number;
  totalEscrowWithdrawAmount: number;
  totalEscrowDepositAmount: number;
  totalClearanceCount: number;
  totalClearanceUsdtAmount: number;
  totalClearanceKrwAmount: number;
};

type PaymentRequestedOrder = {
  _id?: string;
  tradeId?: string | number;
  createdAt?: string;
  buyer?: {
    depositName?: string;
  };
};

type StoreMeta = {
  storecode?: string;
  storeName?: string;
  serviceName?: string;
  companyName?: string;
  adminWalletAddress?: string;
};

type DashboardResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  selectedStore: StoreMeta | null;
  storeError: string;
  orders: DailyCloseRow[];
  summary: {
    totalCount: number;
  };
  dailyError: string;
  escrow: {
    escrowBalance: number;
    todayMinusedEscrowAmount: number;
  };
  escrowError: string;
  paymentRequested: {
    totalCount: number;
    orders: PaymentRequestedOrder[];
  };
  paymentRequestedError: string;
};

const EMPTY_RESULT: DashboardResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  selectedStore: null,
  storeError: "",
  orders: [],
  summary: {
    totalCount: 0,
  },
  dailyError: "",
  escrow: {
    escrowBalance: 0,
    todayMinusedEscrowAmount: 0,
  },
  escrowError: "",
  paymentRequested: {
    totalCount: 0,
    orders: [],
  },
  paymentRequestedError: "",
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

const formatUsdtDisplay = (value: number | null | undefined) =>
  Number(value || 0).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const formatKrwDisplay = (value: number | null | undefined) =>
  Math.round(Number(value || 0)).toLocaleString("ko-KR");

const formatDateInputValue = (date: Date) => {
  const target = new Date(date);
  target.setHours(target.getHours() + 9);
  return target.toISOString().split("T")[0];
};

const createDefaultFilters = (): FilterState => {
  const endDate = new Date();
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  return {
    fromDate: formatDateInputValue(startDate),
    toDate: formatDateInputValue(endDate),
    searchBuyer: "",
    searchDepositName: "",
    searchStoreBankAccountNumber: "",
  };
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

const formatDailyCloseDate = (value?: string | null) => {
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

const formatDailyCloseWeekday = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleDateString("ko-KR", { weekday: "short" });
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

const getStoreDisplayName = (store: StoreMeta | null | undefined, fallbackStorecode: string) => {
  return normalizeString(store?.storeName)
    || normalizeString(store?.serviceName)
    || normalizeString(store?.companyName)
    || normalizeString(store?.storecode)
    || normalizeString(fallbackStorecode)
    || "가맹점";
};

const fieldClassName =
  "h-11 rounded-2xl border border-white/10 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200";

const summaryCardToneClassName = {
  slate: "text-slate-950",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
} as const;

function MetricCard({
  label,
  value,
  unit,
  tone = "slate",
  helper,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: keyof typeof summaryCardToneClassName;
  helper?: string;
}) {
  return (
    <div className="console-panel rounded-[26px] p-5">
      <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className={`console-display ml-auto text-right text-[2rem] font-semibold tracking-[-0.06em] ${summaryCardToneClassName[tone]}`}>
          {value}
        </div>
        <div className="console-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {unit}
        </div>
      </div>
      {helper ? (
        <div className="mt-2 text-right text-xs text-slate-500">{helper}</div>
      ) : null}
    </div>
  );
}

function AmountCell({
  usdtValue,
  krwValue,
}: {
  usdtValue: number;
  krwValue: number;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="console-display break-all text-[13px] font-semibold leading-tight tracking-[-0.04em] text-emerald-600 sm:text-sm">
        {formatUsdtDisplay(usdtValue)}
      </span>
      <span className="console-display break-all text-[13px] font-semibold leading-tight tracking-[-0.04em] text-amber-600 sm:text-sm">
        {formatKrwDisplay(krwValue)}
      </span>
    </div>
  );
}

export default function DailyCloseConsoleClient({
  lang,
  forcedStorecode,
}: DailyCloseConsoleClientProps) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const normalizedForcedStorecode = normalizeString(forcedStorecode);
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters());
  const [data, setData] = useState<DashboardResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);

      if (!normalizedForcedStorecode) {
        setLoading(false);
        setRefreshing(false);
        setError("storecode is required");
        return;
      }

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
        let signedDailyBody: Record<string, unknown> | null = null;
        let signedEscrowBody: Record<string, unknown> | null = null;
        let signedPaymentRequestedBody: Record<string, unknown> | null = null;
        let signErrorMessage = "";

        if (canReadSignedData && activeAccount) {
          try {
            [signedDailyBody, signedEscrowBody, signedPaymentRequestedBody] = await Promise.all([
              createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/order/getAllBuyOrdersByStorecodeDaily",
                storecode: normalizedForcedStorecode,
                body: {
                  storecode: normalizedForcedStorecode,
                  fromDate: filters.fromDate,
                  toDate: filters.toDate,
                  searchBuyer: filters.searchBuyer,
                  searchDepositName: filters.searchDepositName,
                  searchStoreBankAccountNumber: filters.searchStoreBankAccountNumber,
                },
              }),
              createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/store/getEscrowBalance",
                storecode: normalizedForcedStorecode,
                body: {
                  storecode: normalizedForcedStorecode,
                },
              }),
              createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/order/getCountOfPaymentRequested",
                storecode: normalizedForcedStorecode,
                body: {
                  storecode: normalizedForcedStorecode,
                  ordersLimit: 8,
                },
              }),
            ]);
          } catch (signError) {
            signErrorMessage = signError instanceof Error
              ? signError.message
              : "서명 준비에 실패했습니다.";
          }
        }

        const response = await fetch("/api/bff/admin/daily-close-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            selectedStorecode: normalizedForcedStorecode,
            signedDailyBody,
            signedEscrowBody,
            signedPaymentRequestedBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load daily close dashboard");
        }

        const result = payload.result || {};
        setData({
          fetchedAt: normalizeString(result.fetchedAt),
          remoteBackendBaseUrl: normalizeString(result.remoteBackendBaseUrl),
          selectedStore: result.selectedStore || null,
          storeError: normalizeString(result.storeError),
          orders: Array.isArray(result.orders) ? result.orders : [],
          summary: {
            totalCount: normalizeNumber(result.summary?.totalCount),
          },
          dailyError: normalizeString(result.dailyError),
          escrow: {
            escrowBalance: normalizeNumber(result.escrow?.escrowBalance),
            todayMinusedEscrowAmount: normalizeNumber(result.escrow?.todayMinusedEscrowAmount),
          },
          escrowError: normalizeString(result.escrowError),
          paymentRequested: {
            totalCount: normalizeNumber(result.paymentRequested?.totalCount),
            orders: Array.isArray(result.paymentRequested?.orders)
              ? result.paymentRequested.orders
              : [],
          },
          paymentRequestedError: normalizeString(result.paymentRequestedError),
        });

        if (signErrorMessage) {
          setError(signErrorMessage);
        } else if (!canReadSignedData && !isWalletRecovering) {
          setError("");
        } else {
          setError("");
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load daily close dashboard");
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
    [activeAccount, canReadSignedData, filters, isWalletRecovering, normalizedForcedStorecode],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!normalizedForcedStorecode) {
      return undefined;
    }

    const interval = setInterval(() => {
      void loadDashboard({ silent: true });
    }, 20000);

    return () => clearInterval(interval);
  }, [loadDashboard, normalizedForcedStorecode]);

  const summary = useMemo(() => {
    return data.orders.reduce(
      (acc, row) => {
        acc.totalDays += 1;
        acc.totalCount += normalizeNumber(row.totalCount);
        acc.totalUsdtAmount += normalizeNumber(row.totalUsdtAmount);
        acc.totalKrwAmount += normalizeNumber(row.totalKrwAmount);
        acc.totalSettlementAmount += normalizeNumber(row.totalSettlementAmount);
        acc.totalSettlementAmountKRW += normalizeNumber(row.totalSettlementAmountKRW);
        acc.totalFeeAmount += normalizeNumber(row.totalAgentFeeAmount) + normalizeNumber(row.totalFeeAmount);
        acc.totalFeeAmountKRW += normalizeNumber(row.totalAgentFeeAmountKRW) + normalizeNumber(row.totalFeeAmountKRW);
        acc.totalEscrowWithdrawAmount += normalizeNumber(row.totalEscrowWithdrawAmount);
        acc.totalClearanceCount += normalizeNumber(row.totalClearanceCount);
        acc.totalClearanceUsdtAmount += normalizeNumber(row.totalClearanceUsdtAmount);
        acc.totalClearanceKrwAmount += normalizeNumber(row.totalClearanceKrwAmount);
        return acc;
      },
      {
        totalDays: 0,
        totalCount: 0,
        totalUsdtAmount: 0,
        totalKrwAmount: 0,
        totalSettlementAmount: 0,
        totalSettlementAmountKRW: 0,
        totalFeeAmount: 0,
        totalFeeAmountKRW: 0,
        totalEscrowWithdrawAmount: 0,
        totalClearanceCount: 0,
        totalClearanceUsdtAmount: 0,
        totalClearanceKrwAmount: 0,
      },
    );
  }, [data.orders]);

  const storeDisplayName = getStoreDisplayName(data.selectedStore, normalizedForcedStorecode);
  const disconnectedMessage = isWalletRecovering
    ? "지갑 연결 상태를 확인하는 중입니다."
    : "지갑을 연결하고 서명하면 해당 가맹점 일별 마감이 열립니다.";
  const accessWarningMessage = !canReadSignedData && !isWalletRecovering
    ? "가맹점 관리자 지갑 서명이 있어야 일별 마감 데이터를 읽을 수 있습니다."
    : "";
  const paymentRequestedPreview = data.paymentRequested.orders.slice(0, 4);
  const heroStatusLabel = loading
    ? "Initial sync"
    : refreshing
      ? "Refreshing snapshot"
      : "Daily close synced";
  const heroStatusBadgeClassName = loading
    ? "border-sky-400/30 bg-sky-400/12 text-sky-100"
    : refreshing
      ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
      : "border-white/12 bg-white/8 text-slate-100";
  const walletStateLabel = canReadSignedData
    ? "Store wallet signed"
    : isWalletRecovering
      ? "Checking store wallet connection"
      : "Signed wallet required for scoped data";
  const activeDateRangeLabel = `${filters.fromDate || "-"} ~ ${filters.toDate || "-"}`;
  const loadedRowsLabel = loading && data.orders.length === 0
    ? "Syncing..."
    : `${data.orders.length.toLocaleString()} rows`;

  const applyQuickRange = (days: number) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - Math.max(0, days - 1));

    setDraftFilters((current) => ({
      ...current,
      fromDate: formatDateInputValue(startDate),
      toDate: formatDateInputValue(endDate),
    }));
  };

  const resetFilters = () => {
    const next = createDefaultFilters();
    setDraftFilters(next);
    setFilters(next);
  };

  return (
    <div className="console-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.8fr)_380px] lg:px-8 lg:py-8">
            <div className="space-y-6">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  Store daily close
                </span>
                <span className={`rounded-full border px-3 py-1 ${heroStatusBadgeClassName}`}>
                  {heroStatusLabel}
                </span>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
                <div className="space-y-5">
                  <div className="max-w-4xl space-y-3">
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                      {storeDisplayName}
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300">
                      해당 가맹점의 거래, 결제, 수수료, 출금, 청산 흐름을 일자 단위로 확인합니다.
                    </p>
                  </div>

                  <div className="max-w-xl">
                    <div className="console-dark-card rounded-[24px] p-4">
                      <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        Last sync
                      </div>
                      <div className="mt-3 text-sm font-medium text-white">
                        {data.fetchedAt ? formatDateTime(data.fetchedAt) : "Waiting for first sync"}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{walletStateLabel}</div>
                    </div>
                  </div>
                </div>

                <div className="console-dark-card rounded-[28px] p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                    Scope deck
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                      <div className="console-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                        Storecode
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-white">
                        {normalizedForcedStorecode || "-"}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                      <div className="console-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                        Range
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-white">
                        {activeDateRangeLabel}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                      <div className="console-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                        Loaded rows
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-white">
                        {loadedRowsLabel}
                      </div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3">
                      <div className="console-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                        Payment requested
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-white">
                        {data.paymentRequested.totalCount.toLocaleString()}건
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {accessWarningMessage ? (
                <div className="rounded-[24px] border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {accessWarningMessage}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-[24px] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}
            </div>

            <AdminWalletCard
              address={activeAccount?.address}
              accessLabel="Store signed access"
              title="Store wallet"
              disconnectedMessage={disconnectedMessage}
              errorMessage={error}
            />
          </div>
        </section>

        <section className="console-panel rounded-[30px] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                Filters
              </div>
              <h2 className="console-display mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                Daily close query
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyQuickRange(1)}
                className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => applyQuickRange(7)}
                className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                7일
              </button>
              <button
                type="button"
                onClick={() => applyQuickRange(30)}
                className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                30일
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
            <div className="mb-3 text-xs text-slate-400">현재 범위: {storeDisplayName}</div>
            <div className="grid gap-3 xl:grid-cols-12">
              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">From</span>
                <input
                  type="date"
                  value={draftFilters.fromDate}
                  onChange={(event) => {
                    setDraftFilters((current) => ({
                      ...current,
                      fromDate: event.target.value,
                    }));
                  }}
                  className={fieldClassName}
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">To</span>
                <input
                  type="date"
                  value={draftFilters.toDate}
                  onChange={(event) => {
                    setDraftFilters((current) => ({
                      ...current,
                      toDate: event.target.value,
                    }));
                  }}
                  className={fieldClassName}
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-3">
                <span className="font-medium text-slate-200">Buyer</span>
                <input
                  value={draftFilters.searchBuyer}
                  onChange={(event) => {
                    setDraftFilters((current) => ({
                      ...current,
                      searchBuyer: event.target.value,
                    }));
                  }}
                  placeholder="구매자 검색"
                  className={fieldClassName}
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">Deposit name</span>
                <input
                  value={draftFilters.searchDepositName}
                  onChange={(event) => {
                    setDraftFilters((current) => ({
                      ...current,
                      searchDepositName: event.target.value,
                    }));
                  }}
                  placeholder="입금자명 검색"
                  className={fieldClassName}
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-3">
                <span className="font-medium text-slate-200">Bank account</span>
                <input
                  value={draftFilters.searchStoreBankAccountNumber}
                  onChange={(event) => {
                    setDraftFilters((current) => ({
                      ...current,
                      searchStoreBankAccountNumber: event.target.value,
                    }));
                  }}
                  placeholder="통장번호 검색"
                  className={fieldClassName}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                자동 새로고침 20초. 조회 조건 변경 후 적용을 눌러 반영합니다.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-2xl border border-white/10 bg-white/6 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => setFilters(draftFilters)}
                  className="rounded-2xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  적용
                </button>
                <button
                  type="button"
                  onClick={() => void loadDashboard({ silent: true })}
                  className="rounded-2xl border border-sky-300/35 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20"
                >
                  {refreshing ? "새로고침 중" : "새로고침"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="집계 일수"
            value={summary.totalDays.toLocaleString()}
            unit="DAY"
            helper={`${filters.fromDate || "-"} ~ ${filters.toDate || "-"}`}
          />
          <MetricCard
            label="총 거래수"
            value={summary.totalCount.toLocaleString()}
            unit="건"
            helper={`API total ${data.summary.totalCount.toLocaleString()}`}
          />
          <MetricCard
            label="총 거래량"
            value={formatUsdtDisplay(summary.totalUsdtAmount)}
            unit="USDT"
            tone="emerald"
          />
          <MetricCard
            label="총 거래금액"
            value={formatKrwDisplay(summary.totalKrwAmount)}
            unit="KRW"
            tone="amber"
          />
          <MetricCard
            label="총 결제금액"
            value={formatKrwDisplay(summary.totalSettlementAmountKRW)}
            unit="KRW"
            tone="amber"
          />
          <MetricCard
            label="총 청산금액"
            value={formatKrwDisplay(summary.totalClearanceKrwAmount)}
            unit="KRW"
            tone="amber"
          />
        </section>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.75fr)_360px]">
          <section className="console-panel overflow-hidden rounded-[30px]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  Daily table
                </div>
                <h2 className="console-display mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  일별 마감 내역
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {data.orders.length.toLocaleString()} rows
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {storeDisplayName}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {data.fetchedAt ? formatDateTime(data.fetchedAt) : "Waiting for first sync"}
                </span>
              </div>
            </div>

            {data.dailyError ? (
              <div className="border-b border-rose-200 bg-rose-50 px-6 py-4 text-sm text-rose-600">
                {data.dailyError}
              </div>
            ) : null}

            {loading && data.orders.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                일별 마감 데이터를 불러오는 중입니다.
              </div>
            ) : data.orders.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                조회된 일별 마감 데이터가 없습니다.
              </div>
            ) : (
              <div className="w-full">
                <table className="w-full table-fixed border-collapse">
                  <colgroup>
                    <col className="w-[13%]" />
                    <col className="w-[8%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[15%]" />
                    <col className="w-[12%]" />
                    <col className="w-[8%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        날짜
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        거래수
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        거래량 / 금액
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        결제량 / 금액
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        수수료량 / 금액
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        출금
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        청산수
                      </th>
                      <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300 sm:px-4">
                        청산량 / 금액
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((row, index) => (
                      <tr
                        key={`${row.date}-${index}`}
                        className="border-b border-slate-200 bg-white transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-4 align-top sm:px-4">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-semibold text-slate-950 sm:text-base">
                              {formatDailyCloseDate(row.date)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {formatDailyCloseWeekday(row.date)}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-right align-top sm:px-4">
                          <div className="text-base font-semibold text-slate-950 sm:text-lg">
                            {normalizeNumber(row.totalCount).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-4 align-top sm:px-4">
                          <AmountCell
                            usdtValue={normalizeNumber(row.totalUsdtAmount)}
                            krwValue={normalizeNumber(row.totalKrwAmount)}
                          />
                        </td>
                        <td className="px-3 py-4 align-top sm:px-4">
                          <AmountCell
                            usdtValue={normalizeNumber(row.totalSettlementAmount)}
                            krwValue={normalizeNumber(row.totalSettlementAmountKRW)}
                          />
                        </td>
                        <td className="px-3 py-4 align-top sm:px-4">
                          <AmountCell
                            usdtValue={normalizeNumber(row.totalAgentFeeAmount) + normalizeNumber(row.totalFeeAmount)}
                            krwValue={normalizeNumber(row.totalAgentFeeAmountKRW) + normalizeNumber(row.totalFeeAmountKRW)}
                          />
                        </td>
                        <td className="px-3 py-4 text-right align-top sm:px-4">
                          {normalizeNumber(row.totalEscrowCount) > 0 ? (
                            <div className="flex flex-col items-end gap-1">
                              <span className="console-display break-all text-[13px] font-semibold tracking-[-0.04em] text-emerald-600 sm:text-sm">
                                {formatUsdtDisplay(normalizeNumber(row.totalEscrowWithdrawAmount))}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 sm:text-[10px]">
                                출금완료
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-600 sm:px-2.5 sm:py-1 sm:text-[11px]">
                              출금대기
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right align-top sm:px-4">
                          <div className="text-base font-semibold text-slate-950 sm:text-lg">
                            {normalizeNumber(row.totalClearanceCount).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-3 py-4 align-top sm:px-4">
                          <AmountCell
                            usdtValue={normalizeNumber(row.totalClearanceUsdtAmount)}
                            krwValue={normalizeNumber(row.totalClearanceKrwAmount)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="space-y-5">
            <div className="console-dark-card rounded-[30px] p-5 text-white">
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Escrow snapshot
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                  <div className="text-xs text-slate-400">현재 보유량</div>
                  <div className="console-display mt-2 text-3xl font-semibold tracking-[-0.06em] text-emerald-300">
                    {formatUsdtDisplay(data.escrow.escrowBalance)}
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4">
                  <div className="text-xs text-slate-400">오늘 수수료 차감량</div>
                  <div className="console-display mt-2 text-3xl font-semibold tracking-[-0.06em] text-rose-300">
                    {formatUsdtDisplay(data.escrow.todayMinusedEscrowAmount)}
                  </div>
                </div>
                {data.escrowError ? (
                  <div className="rounded-[22px] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    {data.escrowError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="console-panel rounded-[30px] p-5">
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                Payment request
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="console-display text-4xl font-semibold tracking-[-0.06em] text-slate-950">
                  {data.paymentRequested.totalCount.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">입금요청 대기</div>
              </div>
              {paymentRequestedPreview.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {paymentRequestedPreview.map((item, index) => (
                    <div
                      key={`${item._id || item.tradeId || index}`}
                      className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="console-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          Trade {item.tradeId || "-"}
                        </div>
                        <div className="text-[11px] text-slate-500">{formatDateTime(item.createdAt)}</div>
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {normalizeString(item.buyer?.depositName) || "입금자명 미기재"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                  현재 입금요청 대기 주문이 없습니다.
                </div>
              )}
              {data.paymentRequestedError ? (
                <div className="mt-3 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-600">
                  {data.paymentRequestedError}
                </div>
              ) : null}
            </div>

            <div className="console-panel rounded-[30px] p-5">
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                System
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Console route
                  </div>
                  <div className="mt-1 break-all font-medium text-slate-900">
                    /{lang}/{normalizedForcedStorecode}/daily-close
                  </div>
                </div>
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Store wallet
                  </div>
                  <div className="mt-1 font-medium text-slate-900">
                    {shortAddress(data.selectedStore?.adminWalletAddress)}
                  </div>
                </div>
                <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Backend
                  </div>
                  <div className="mt-1 break-all font-medium text-slate-900">
                    {data.remoteBackendBaseUrl || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
