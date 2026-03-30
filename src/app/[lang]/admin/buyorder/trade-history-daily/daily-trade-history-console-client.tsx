"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminStoreStrip, { type AdminStoreStripItem } from "@/components/admin/admin-store-strip";
import BuyorderSubnav from "@/components/admin/buyorder-subnav";
import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";

type DailyHistoryRow = {
  date?: string;
  totalCount?: number;
  totalUsdtAmount?: number;
  totalKrwAmount?: number;
  totalSettlementCount?: number;
  totalSettlementAmount?: number;
  totalSettlementAmountKRW?: number;
  totalAgentFeeAmount?: number;
  totalAgentFeeAmountKRW?: number;
  totalFeeAmount?: number;
  totalFeeAmountKRW?: number;
  totalClearanceCount?: number;
  totalClearanceUsdtAmount?: number;
  totalClearanceKrwAmount?: number;
};

type DailyTradeHistoryResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  statsAccessLevel: string;
  statsError: string;
  rows: DailyHistoryRow[];
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
  totalTradeCount: number;
  totalTradeUsdtAmount: number;
  totalTradeKrwAmount: number;
  totalSettlementCount: number;
  totalSettlementAmount: number;
  totalSettlementAmountKRW: number;
  totalAgentFeeAmount: number;
  totalAgentFeeAmountKRW: number;
  totalFeeAmount: number;
  totalFeeAmountKRW: number;
  totalClearanceCount: number;
  totalClearanceUsdtAmount: number;
  totalClearanceKrwAmount: number;
  fromDate: string;
  toDate: string;
};

type StoreDirectoryResult = {
  fetchedAt: string;
  stores: AdminStoreStripItem[];
  totalCount: number;
};

type FilterState = {
  storecode: string;
  limit: number;
  page: number;
  fromDate: string;
  toDate: string;
};

const EMPTY_RESULT: DailyTradeHistoryResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  statsAccessLevel: "public",
  statsError: "",
  rows: [],
  totalCount: 0,
  totalPages: 1,
  page: 1,
  limit: 30,
  totalTradeCount: 0,
  totalTradeUsdtAmount: 0,
  totalTradeKrwAmount: 0,
  totalSettlementCount: 0,
  totalSettlementAmount: 0,
  totalSettlementAmountKRW: 0,
  totalAgentFeeAmount: 0,
  totalAgentFeeAmountKRW: 0,
  totalFeeAmount: 0,
  totalFeeAmountKRW: 0,
  totalClearanceCount: 0,
  totalClearanceUsdtAmount: 0,
  totalClearanceKrwAmount: 0,
  fromDate: "",
  toDate: "",
};

const EMPTY_STORE_DIRECTORY_RESULT: StoreDirectoryResult = {
  fetchedAt: "",
  stores: [],
  totalCount: 0,
};

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const USDT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const createInputDate = (daysOffset = 0) => {
  const kstDate = new Date(Date.now() + KST_OFFSET_MS);
  kstDate.setUTCDate(kstDate.getUTCDate() + daysOffset);
  return kstDate.toISOString().slice(0, 10);
};

const createDefaultFilters = (storecode = ""): FilterState => ({
  storecode,
  limit: 30,
  page: 1,
  fromDate: createInputDate(-29),
  toDate: createInputDate(0),
});

const buildPaginationItems = (currentPage: number, totalPages: number) => {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const adjustedStart = Math.max(1, end - 4);

  return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
};

const shortAddress = (value?: string | null) => {
  const safe = normalizeText(value);
  if (!safe) {
    return "-";
  }
  if (safe.length <= 12) {
    return safe;
  }
  return `${safe.slice(0, 6)}...${safe.slice(-4)}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return DATE_FORMATTER.format(parsed);
};

const formatKrw = (value?: number | string | null) => {
  const numeric = Number(value || 0);
  return `${KRW_FORMATTER.format(numeric)} KRW`;
};

const formatUsdt = (value?: number | string | null) => {
  const numeric = Number(value || 0);
  return `${USDT_FORMATTER.format(numeric)} USDT`;
};

const formatDateLabel = (value?: string | null) => {
  const safe = normalizeText(value);
  if (!safe) {
    return "-";
  }

  const parsed = new Date(`${safe}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) {
    return safe;
  }

  return parsed.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
};

const getStoreDisplayName = (store?: AdminStoreStripItem | null) =>
  normalizeText(store?.storeName)
  || normalizeText(store?.companyName)
  || normalizeText(store?.storecode)
  || "전체 가맹점";

export default function DailyTradeHistoryConsoleClient({
  lang,
  initialStorecode = "",
}: {
  lang: string;
  initialStorecode?: string;
}) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters(normalizeText(initialStorecode)));
  const [data, setData] = useState<DailyTradeHistoryResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [storeDirectory, setStoreDirectory] = useState<StoreDirectoryResult>(EMPTY_STORE_DIRECTORY_RESULT);
  const [storeDirectoryLoading, setStoreDirectoryLoading] = useState(true);
  const [storeDirectoryError, setStoreDirectoryError] = useState("");
  const [signerWarmup, setSignerWarmup] = useState(false);
  const requestIdRef = useRef(0);
  const warmupRetryCountRef = useRef(0);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (warmupTimerRef.current) {
        clearTimeout(warmupTimerRef.current);
      }
    };
  }, []);

  const loadStoreDirectory = useCallback(async () => {
    setStoreDirectoryLoading(true);
    setStoreDirectoryError("");

    try {
      const response = await fetch("/api/bff/admin/store-directory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          limit: 300,
          startPage: 1,
          maxPages: 12,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load store directory");
      }

      const result = (payload?.result || {}) as StoreDirectoryResult;
      setStoreDirectory({
        fetchedAt: normalizeText(result?.fetchedAt),
        stores: Array.isArray(result?.stores) ? result.stores : [],
        totalCount: Number(result?.totalCount || 0),
      });
    } catch (loadError) {
      setStoreDirectoryError(loadError instanceof Error ? loadError.message : "Failed to load store directory");
    } finally {
      setStoreDirectoryLoading(false);
    }
  }, []);

  const loadDailyHistory = useCallback(async (options?: { silent?: boolean; preferSigned?: boolean }) => {
    const requestId = ++requestIdRef.current;
    const silent = options?.silent === true;
    const preferSigned = options?.preferSigned !== false;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      let signedStatsBody: Record<string, unknown> | null = null;

      if (preferSigned && activeAccount) {
        try {
          signedStatsBody = await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route: "/api/order/getAdminTradeHistoryDaily",
            storecode: "admin",
            requesterWalletAddress: activeAccount.address,
            body: {
              storecode: filters.storecode,
              limit: filters.limit,
              page: filters.page,
              fromDate: filters.fromDate,
              toDate: filters.toDate,
            },
          });
          warmupRetryCountRef.current = 0;
          setSignerWarmup(false);
        } catch {
          if (warmupRetryCountRef.current < 2) {
            warmupRetryCountRef.current += 1;
            setSignerWarmup(true);
            if (warmupTimerRef.current) {
              clearTimeout(warmupTimerRef.current);
            }
            warmupTimerRef.current = setTimeout(() => {
              warmupTimerRef.current = null;
              void loadDailyHistory({ silent: true, preferSigned: true });
            }, 700);
            return;
          }

          signedStatsBody = null;
          setSignerWarmup(false);
        }
      } else {
        warmupRetryCountRef.current = 0;
        setSignerWarmup(false);
      }

      const response = await fetch("/api/bff/admin/daily-trade-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          signedStatsBody,
          statsFilters: filters,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load daily trade history");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      const result = (payload?.result || {}) as DailyTradeHistoryResult;
      setData({
        fetchedAt: normalizeText(result?.fetchedAt),
        remoteBackendBaseUrl: normalizeText(result?.remoteBackendBaseUrl),
        statsAccessLevel: normalizeText(result?.statsAccessLevel) || "public",
        statsError: normalizeText(result?.statsError),
        rows: Array.isArray(result?.rows) ? result.rows : [],
        totalCount: Number(result?.totalCount || 0),
        totalPages: Number(result?.totalPages || 1),
        page: Number(result?.page || filters.page || 1),
        limit: Number(result?.limit || filters.limit || 30),
        totalTradeCount: Number(result?.totalTradeCount || 0),
        totalTradeUsdtAmount: Number(result?.totalTradeUsdtAmount || 0),
        totalTradeKrwAmount: Number(result?.totalTradeKrwAmount || 0),
        totalSettlementCount: Number(result?.totalSettlementCount || 0),
        totalSettlementAmount: Number(result?.totalSettlementAmount || 0),
        totalSettlementAmountKRW: Number(result?.totalSettlementAmountKRW || 0),
        totalAgentFeeAmount: Number(result?.totalAgentFeeAmount || 0),
        totalAgentFeeAmountKRW: Number(result?.totalAgentFeeAmountKRW || 0),
        totalFeeAmount: Number(result?.totalFeeAmount || 0),
        totalFeeAmountKRW: Number(result?.totalFeeAmountKRW || 0),
        totalClearanceCount: Number(result?.totalClearanceCount || 0),
        totalClearanceUsdtAmount: Number(result?.totalClearanceUsdtAmount || 0),
        totalClearanceKrwAmount: Number(result?.totalClearanceKrwAmount || 0),
        fromDate: normalizeText(result?.fromDate),
        toDate: normalizeText(result?.toDate),
      });
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Failed to load daily trade history");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeAccount, filters]);

  useEffect(() => {
    void loadStoreDirectory();
  }, [loadStoreDirectory]);

  useEffect(() => {
    void loadDailyHistory();
  }, [loadDailyHistory]);

  const selectedStore = useMemo(
    () =>
      storeDirectory.stores.find(
        (store) => normalizeText(store.storecode) === normalizeText(filters.storecode),
      ) || null,
    [filters.storecode, storeDirectory.stores],
  );

  const totalPages = Math.max(1, Number(data.totalPages || 1));
  const currentPage = Math.min(Math.max(1, Number(data.page || filters.page || 1)), totalPages);
  const currentRangeStart = data.rows.length === 0 ? 0 : ((currentPage - 1) * filters.limit) + 1;
  const currentRangeEnd = data.rows.length === 0 ? 0 : currentRangeStart + data.rows.length - 1;
  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const hasPrivilegedAccess = data.statsAccessLevel === "privileged";
  const querySummaryLabel = selectedStore
    ? `${getStoreDisplayName(selectedStore)} · 일자 ${Number(data.totalCount || 0).toLocaleString()}개`
    : `전체 가맹점 · 일자 ${Number(data.totalCount || 0).toLocaleString()}개`;
  const walletAccessLabel = activeAccount?.address
    ? "Admin signed"
    : walletConnectionStatus === "connecting"
      ? "Wallet syncing"
      : "Wallet disconnected";
  const walletTitle = activeAccount?.address ? shortAddress(activeAccount.address) : "관리자 지갑";

  const metrics = [
    {
      label: "집계 일수",
      value: `${Number(data.totalCount || 0).toLocaleString()}일`,
    },
    {
      label: "P2P 거래수",
      value: `${Number(data.totalTradeCount || 0).toLocaleString()}건`,
    },
    {
      label: "P2P 거래량",
      value: formatUsdt(data.totalTradeUsdtAmount),
    },
    {
      label: "P2P 거래금액",
      value: formatKrw(data.totalTradeKrwAmount),
    },
    {
      label: "가맹점 결제수",
      value: `${Number(data.totalSettlementCount || 0).toLocaleString()}건`,
    },
    {
      label: "청산 거래수",
      value: `${Number(data.totalClearanceCount || 0).toLocaleString()}건`,
    },
    {
      label: "청산 거래량",
      value: formatUsdt(data.totalClearanceUsdtAmount),
    },
    {
      label: "청산 거래금액",
      value: formatKrw(data.totalClearanceKrwAmount),
    },
  ];

  const resetFilters = useCallback(() => {
    setFilters(createDefaultFilters(""));
  }, []);

  const updateDateRange = useCallback((fromDate: string, toDate: string) => {
    setFilters((prev) => ({
      ...prev,
      fromDate,
      toDate,
      page: 1,
    }));
  }, []);

  return (
    <div className="console-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.8fr)_360px] lg:px-8 lg:py-8">
            <div className="space-y-5">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  Buyorder / Daily Trade History
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  {querySummaryLabel}
                </span>
              </div>

              <div className="max-w-4xl space-y-3">
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  일별통계
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                  P2P 완료 거래와 청산 거래를 날짜별로 묶어 보고, 가맹점 결제와 수수료 흐름까지 한 번에
                  확인할 수 있게 정리했습니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void loadDailyHistory({ silent: true });
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/15"
                >
                  {refreshing ? "새로고침 중..." : "새로고침"}
                </button>
              </div>

              <BuyorderSubnav
                lang={lang}
                selectedStorecode={filters.storecode}
                active="trade-history-daily"
              />

              <div className="console-dark-card max-w-xl rounded-[24px] p-4">
                <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  Query state
                </div>
                <div className="mt-3 text-sm font-medium text-white">
                  {data.fetchedAt ? formatDateTime(data.fetchedAt) : "Waiting for first sync"}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {signerWarmup
                    ? "서명 준비 중입니다. 관리자 권한 조회를 다시 시도하고 있습니다."
                    : hasPrivilegedAccess
                      ? "관리자 권한으로 일별 통계를 조회하고 있습니다."
                      : "일별 통계는 관리자 지갑 없이도 조회할 수 있습니다."}
                </div>
              </div>
            </div>

            <AdminWalletCard
              address={activeAccount?.address}
              accessLabel={walletAccessLabel}
              title={walletTitle}
              disconnectedMessage="일별 통계는 지갑 없이도 조회할 수 있고, 연결하면 관리자 권한 상태를 함께 확인할 수 있습니다."
            />
          </div>
        </section>

        <AdminStoreStrip
          stores={storeDirectory.stores}
          selectedStorecode={filters.storecode}
          onSelectStorecode={(storecode) => {
            setFilters((prev) => ({
              ...prev,
              storecode,
              page: 1,
            }));
          }}
          activeAccount={activeAccount}
          loading={storeDirectoryLoading}
          error={storeDirectoryError}
          onRefresh={() => {
            void loadStoreDirectory();
          }}
          onStoreUpdate={(storecode, patch) => {
            setStoreDirectory((current) => ({
              ...current,
              stores: current.stores.map((store) =>
                normalizeText(store.storecode) === normalizeText(storecode)
                  ? { ...store, ...patch }
                  : store,
              ),
            }));
          }}
          allowAllStores
          allStoresValue=""
          allStoresLabel="전체 가맹점"
          emptyMessage="검색 조건에 맞는 가맹점이 없습니다."
        />

        <section className="console-panel rounded-[30px] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                Daily filters
              </p>
              <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                날짜별 통계 검색
              </h2>
            </div>
            <div className="text-sm text-slate-500">
              Rows {Number(currentRangeStart).toLocaleString()}-{Number(currentRangeEnd).toLocaleString()} / {Number(data.totalCount || 0).toLocaleString()}
            </div>
          </div>

          <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
            <div className="grid gap-3 xl:grid-cols-12">
              <label className="space-y-2 text-sm xl:col-span-4">
                <span className="font-medium text-slate-200">시작일</span>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => updateDateRange(event.target.value, filters.toDate)}
                  className="h-11 w-full rounded-2xl border border-white/20 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-300 focus:bg-sky-50"
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-4">
                <span className="font-medium text-slate-200">종료일</span>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(event) => updateDateRange(filters.fromDate, event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/20 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-300 focus:bg-sky-50"
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">페이지당</span>
                <select
                  value={filters.limit}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      limit: Number(event.target.value),
                      page: 1,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-white/20 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-300 focus:bg-sky-50"
                >
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={60}>60</option>
                  <option value={100}>100</option>
                </select>
              </label>

              <div className="flex items-end gap-2 xl:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    void loadDailyHistory({ silent: true });
                  }}
                  className="h-11 flex-1 rounded-2xl bg-sky-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  조회
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "7일", days: 7 },
                  { label: "30일", days: 30 },
                  { label: "90일", days: 90 },
                  { label: "180일", days: 180 },
                ].map((item) => {
                  const fromDate = createInputDate(-(item.days - 1));
                  const toDate = createInputDate(0);
                  const active = filters.fromDate === fromDate && filters.toDate === toDate;

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => updateDateRange(fromDate, toDate)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? "border-sky-300/45 bg-sky-300/16 text-sky-100"
                          : "border-white/12 bg-white/6 text-slate-300 hover:border-white/20 hover:bg-white/10"
                      }`}
                    >
                      최근 {item.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="h-9 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
              >
                초기화
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.label} className="console-panel rounded-[26px] px-5 py-5">
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </div>
              <div className="console-display mt-3 text-right text-[1.32rem] font-semibold leading-[1.1] tracking-[-0.045em] text-slate-950 sm:text-[1.46rem]">
                {item.value}
              </div>
            </div>
          ))}
        </section>

        {error ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </section>
        ) : null}

        <section className="console-panel rounded-[30px] p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Daily summary
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-950">P2P + 청산 일별 집계</div>
            </div>
            <div className="text-xs text-slate-500">
              {loading ? "불러오는 중..." : `마지막 동기화 ${data.fetchedAt ? formatDateTime(data.fetchedAt) : "-"}`}
            </div>
          </div>

          <div className="overflow-x-auto lg:overflow-visible">
            <table className="min-w-[1180px] w-full table-auto border-collapse lg:min-w-0 lg:table-fixed">
              <thead className="bg-slate-950/95 text-left text-white">
                <tr>
                  <th className="px-4 py-3 text-sm font-semibold lg:w-[14%]">날짜</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[8%]">P2P 거래수</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[13%]">P2P 거래량 / 금액</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[11%]">결제수 / 미결제수</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[13%]">결제량 / 금액</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[14%]">수수료</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[8%]">청산수</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right lg:w-[11%]">청산량 / 금액</th>
                </tr>
              </thead>
              <tbody>
                {!loading && data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      조회된 일별 통계가 없습니다.
                    </td>
                  </tr>
                ) : null}

                {data.rows.map((row, index) => {
                  const unsettledCount = Math.max(
                    0,
                    Number(row.totalCount || 0) - Number(row.totalSettlementCount || 0),
                  );
                  const totalFeeUsdt = Number(row.totalAgentFeeAmount || 0) + Number(row.totalFeeAmount || 0);
                  const totalFeeKrw = Number(row.totalAgentFeeAmountKRW || 0) + Number(row.totalFeeAmountKRW || 0);

                  return (
                    <tr
                      key={`${normalizeText(row.date)}-${index}`}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="min-w-[160px] lg:min-w-0">
                          <div className="text-base font-semibold text-slate-950">{formatDateLabel(row.date)}</div>
                          <div className="mt-1 text-xs text-slate-500">{normalizeText(row.date) || "-"}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-right text-sm font-semibold text-slate-950">
                        {Number(row.totalCount || 0).toLocaleString()}건
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <div className="min-w-[170px] space-y-1 lg:min-w-0">
                          <div className="text-sm font-semibold text-slate-950">{formatUsdt(row.totalUsdtAmount)}</div>
                          <div className="text-sm text-slate-500">{formatKrw(row.totalKrwAmount)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <div className="min-w-[150px] space-y-1 lg:min-w-0">
                          <div className="text-sm font-semibold text-slate-950">
                            {Number(row.totalSettlementCount || 0).toLocaleString()}건
                          </div>
                          <div className="text-sm text-slate-500">{unsettledCount.toLocaleString()}건</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <div className="min-w-[170px] space-y-1 lg:min-w-0">
                          <div className="text-sm font-semibold text-slate-950">{formatUsdt(row.totalSettlementAmount)}</div>
                          <div className="text-sm text-slate-500">{formatKrw(row.totalSettlementAmountKRW)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <div className="min-w-[170px] space-y-1 lg:min-w-0">
                          <div className="text-sm font-semibold text-slate-950">{formatUsdt(totalFeeUsdt)}</div>
                          <div className="text-sm text-slate-500">{formatKrw(totalFeeKrw)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-right text-sm font-semibold text-slate-950">
                        {Number(row.totalClearanceCount || 0).toLocaleString()}건
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <div className="min-w-[170px] space-y-1 lg:min-w-0">
                          <div className="text-sm font-semibold text-slate-950">{formatUsdt(row.totalClearanceUsdtAmount)}</div>
                          <div className="text-sm text-slate-500">{formatKrw(row.totalClearanceKrwAmount)}</div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <div className="text-sm text-slate-500">
              총 {Number(data.totalCount || 0).toLocaleString()}일 중 {Number(currentRangeStart).toLocaleString()}-{Number(currentRangeEnd).toLocaleString()}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: 1,
                  }))
                }
                className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                  currentPage <= 1
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                {"<<"}
              </button>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.max(1, currentPage - 1),
                  }))
                }
                className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                  currentPage <= 1
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                이전
              </button>
              {paginationItems.map((item) => {
                const active = item === currentPage;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        page: item,
                      }))
                    }
                    className={`h-9 min-w-[2.25rem] rounded-lg border px-3 text-sm font-medium transition ${
                      active
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: Math.min(totalPages, currentPage + 1),
                  }))
                }
                className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                  currentPage >= totalPages
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                다음
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    page: totalPages,
                  }))
                }
                className={`h-9 rounded-lg border px-3 text-sm font-medium transition ${
                  currentPage >= totalPages
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                {">>"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
