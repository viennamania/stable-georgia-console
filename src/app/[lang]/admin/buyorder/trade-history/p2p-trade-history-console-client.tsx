"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminStoreStrip, { type AdminStoreStripItem } from "@/components/admin/admin-store-strip";
import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";

type BankInfo = {
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  realAccountNumber?: string;
};

type SettlementInfo = {
  status?: string;
  settlementAmount?: number | string;
  settlementAmountKRW?: number | string;
  feeAmount?: number | string;
  feeAmountKRW?: number | string;
  agentFeeAmount?: number | string;
  agentFeeAmountKRW?: number | string;
};

type OrderActionActor = {
  walletAddress?: string | null;
  nickname?: string | null;
  storecode?: string | null;
  role?: string | null;
  confirmedAt?: string | null;
};

type TradeOrder = {
  _id?: string;
  tradeId?: string;
  storecode?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentConfirmedAt?: string;
  status?: string;
  userType?: string;
  rate?: number;
  krwAmount?: number;
  usdtAmount?: number;
  nickname?: string;
  walletAddress?: string;
  paymentConfirmedBy?: OrderActionActor | null;
  paymentConfirmedByName?: string;
  paymentConfirmedByWalletAddress?: string;
  buyer?: {
    nickname?: string;
    walletAddress?: string;
    depositName?: string;
    depositBankAccountNumber?: string;
    bankInfo?: BankInfo;
  } | null;
  seller?: {
    nickname?: string;
    walletAddress?: string;
    signerAddress?: string;
    bankInfo?: BankInfo;
  } | null;
  store?: {
    storecode?: string;
    storeName?: string;
    companyName?: string;
    storeLogo?: string;
    bankInfo?: BankInfo;
  } | null;
  settlement?: SettlementInfo | null;
};

type TradeHistoryResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  ordersAccessLevel: string;
  ordersError: string;
  orders: TradeOrder[];
  totalCount: number;
  totalKrwAmount: number;
  totalUsdtAmount: number;
  totalSettlementCount: number;
  totalSettlementAmount: number;
  totalSettlementAmountKRW: number;
  totalFeeAmount: number;
  totalFeeAmountKRW: number;
  totalAgentFeeAmount: number;
  totalAgentFeeAmountKRW: number;
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
  searchKeyword: string;
  userType: string;
};

const EMPTY_TRADE_HISTORY_RESULT: TradeHistoryResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  ordersAccessLevel: "public",
  ordersError: "",
  orders: [],
  totalCount: 0,
  totalKrwAmount: 0,
  totalUsdtAmount: 0,
  totalSettlementCount: 0,
  totalSettlementAmount: 0,
  totalSettlementAmountKRW: 0,
  totalFeeAmount: 0,
  totalFeeAmountKRW: 0,
  totalAgentFeeAmount: 0,
  totalAgentFeeAmountKRW: 0,
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

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("ko", {
  numeric: "auto",
});

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const RATE_FORMATTER = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
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
  fromDate: createInputDate(-6),
  toDate: createInputDate(0),
  searchKeyword: "",
  userType: "all",
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

const getStoreDisplayName = (store?: AdminStoreStripItem | null) =>
  normalizeText(store?.storeName)
  || normalizeText(store?.companyName)
  || normalizeText(store?.storecode)
  || "전체 가맹점";

const getOrderStoreName = (order?: TradeOrder | null) =>
  normalizeText(order?.store?.storeName)
  || normalizeText(order?.store?.companyName)
  || normalizeText(order?.store?.storecode)
  || normalizeText(order?.storecode)
  || "가맹점";

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

const formatTimeAgo = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  const time = parsed.getTime();
  if (Number.isNaN(time)) {
    return "-";
  }

  const diffMs = time - Date.now();
  const absMs = Math.abs(diffMs);

  if (absMs < 45_000) {
    return diffMs >= 0 ? "곧" : "방금 전";
  }

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
  ];

  for (const [unit, size] of units) {
    if (absMs >= size) {
      return RELATIVE_TIME_FORMATTER.format(Math.round(diffMs / size), unit);
    }
  }

  return RELATIVE_TIME_FORMATTER.format(Math.round(diffMs / 1000), "second");
};

const formatKrw = (value?: number | string | null) => {
  const numeric = Number(value || 0);
  return `${KRW_FORMATTER.format(numeric)} KRW`;
};

const formatUsdt = (value?: number | string | null) => {
  const numeric = Number(value || 0);
  return `${USDT_FORMATTER.format(numeric)} USDT`;
};

const formatRate = (value?: number | string | null) => {
  const numeric = Number(value || 0);
  return RATE_FORMATTER.format(numeric);
};

const getUserTypeLabel = (value?: string | null) => {
  const safe = normalizeText(value);
  if (safe === "AAA") {
    return "1등급";
  }
  if (safe === "BBB") {
    return "2등급";
  }
  if (safe === "CCC") {
    return "3등급";
  }
  if (safe === "DDD") {
    return "4등급";
  }
  return "일반";
};

const getBankInfoDisplay = (bankInfo?: BankInfo | null, fallbackAccountNumber?: string | null) => {
  const bankName = normalizeText(bankInfo?.bankName);
  const holder = normalizeText(bankInfo?.accountHolder);
  const accountNumber = normalizeText(bankInfo?.accountNumber)
    || normalizeText(bankInfo?.realAccountNumber)
    || normalizeText(fallbackAccountNumber);

  return {
    bankName: bankName || "-",
    holder: holder || "-",
    accountNumber: accountNumber || "-",
    summary:
      [bankName, holder].filter(Boolean).join(" / ")
      || bankName
      || holder
      || "-",
  };
};

export default function P2PTradeHistoryConsoleClient({
  lang,
  initialStorecode = "",
}: {
  lang: string;
  initialStorecode?: string;
}) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters(normalizeText(initialStorecode)));
  const [searchKeywordInput, setSearchKeywordInput] = useState(() => "");
  const [data, setData] = useState<TradeHistoryResult>(EMPTY_TRADE_HISTORY_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [storeDirectory, setStoreDirectory] = useState<StoreDirectoryResult>(EMPTY_STORE_DIRECTORY_RESULT);
  const [storeDirectoryLoading, setStoreDirectoryLoading] = useState(true);
  const [storeDirectoryError, setStoreDirectoryError] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");
  const [signerWarmup, setSignerWarmup] = useState(false);
  const requestIdRef = useRef(0);
  const warmupRetryCountRef = useRef(0);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (warmupTimerRef.current) {
        clearTimeout(warmupTimerRef.current);
      }
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
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

  const loadTradeHistory = useCallback(async (options?: { silent?: boolean; preferSigned?: boolean }) => {
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
      let signedOrdersBody: Record<string, unknown> | null = null;

      if (preferSigned && activeAccount) {
        try {
          signedOrdersBody = await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route: "/api/order/getAdminP2PTradeHistory",
            storecode: "admin",
            requesterWalletAddress: activeAccount.address,
            body: {
              storecode: filters.storecode,
              limit: filters.limit,
              page: filters.page,
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              searchKeyword: filters.searchKeyword,
              userType: filters.userType,
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
              void loadTradeHistory({ silent: true, preferSigned: true });
            }, 700);
            return;
          }

          signedOrdersBody = null;
          setSignerWarmup(false);
        }
      } else {
        warmupRetryCountRef.current = 0;
        setSignerWarmup(false);
      }

      const response = await fetch("/api/bff/admin/p2p-trade-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          signedOrdersBody,
          orderFilters: filters,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load P2P trade history");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      const result = (payload?.result || {}) as TradeHistoryResult;
      setData({
        fetchedAt: normalizeText(result?.fetchedAt),
        remoteBackendBaseUrl: normalizeText(result?.remoteBackendBaseUrl),
        ordersAccessLevel: normalizeText(result?.ordersAccessLevel) || "public",
        ordersError: normalizeText(result?.ordersError),
        orders: Array.isArray(result?.orders) ? result.orders : [],
        totalCount: Number(result?.totalCount || 0),
        totalKrwAmount: Number(result?.totalKrwAmount || 0),
        totalUsdtAmount: Number(result?.totalUsdtAmount || 0),
        totalSettlementCount: Number(result?.totalSettlementCount || 0),
        totalSettlementAmount: Number(result?.totalSettlementAmount || 0),
        totalSettlementAmountKRW: Number(result?.totalSettlementAmountKRW || 0),
        totalFeeAmount: Number(result?.totalFeeAmount || 0),
        totalFeeAmountKRW: Number(result?.totalFeeAmountKRW || 0),
        totalAgentFeeAmount: Number(result?.totalAgentFeeAmount || 0),
        totalAgentFeeAmountKRW: Number(result?.totalAgentFeeAmountKRW || 0),
      });
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Failed to load P2P trade history");
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
    void loadTradeHistory();
  }, [loadTradeHistory]);

  const selectedStore = useMemo(
    () =>
      storeDirectory.stores.find(
        (store) => normalizeText(store.storecode) === normalizeText(filters.storecode),
      ) || null,
    [filters.storecode, storeDirectory.stores],
  );

  const orderLimit = Math.max(1, Number(filters.limit) || 1);
  const totalPages = Math.max(1, Math.ceil(Number(data.totalCount || 0) / orderLimit));
  const currentPage = Math.min(Math.max(1, Number(filters.page) || 1), totalPages);
  const currentRangeStart = data.orders.length === 0 ? 0 : ((currentPage - 1) * orderLimit) + 1;
  const currentRangeEnd = data.orders.length === 0 ? 0 : currentRangeStart + data.orders.length - 1;
  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages],
  );
  const hasPrivilegedOrderAccess = data.ordersAccessLevel === "privileged";
  const querySummaryLabel = selectedStore
    ? `${getStoreDisplayName(selectedStore)} · 완료 거래 ${Number(data.totalCount || 0).toLocaleString()}건`
    : `전체 가맹점 · 완료 거래 ${Number(data.totalCount || 0).toLocaleString()}건`;
  const walletAccessLabel = activeAccount?.address
    ? "Admin signed"
    : walletConnectionStatus === "connecting"
    ? "Wallet syncing"
    : "Wallet disconnected";
  const walletTitle = activeAccount?.address ? shortAddress(activeAccount.address) : "관리자 지갑";
  const selectedStoreQuery = normalizeText(filters.storecode);
  const backToBuyorderHref = selectedStoreQuery
    ? `/${lang}/admin/buyorder?storecode=${encodeURIComponent(selectedStoreQuery)}`
    : `/${lang}/admin/buyorder`;

  const metrics = [
    {
      label: "완료 거래수",
      value: `${Number(data.totalCount || 0).toLocaleString()}건`,
    },
    {
      label: "완료 거래량",
      value: formatUsdt(data.totalUsdtAmount),
    },
    {
      label: "완료 거래금액",
      value: formatKrw(data.totalKrwAmount),
    },
    {
      label: "가맹점 결제수",
      value: `${Number(data.totalSettlementCount || 0).toLocaleString()}건`,
    },
    {
      label: "가맹점 결제금액",
      value: formatKrw(data.totalSettlementAmountKRW),
    },
    {
      label: "수수료 합계",
      value: formatKrw(data.totalFeeAmountKRW),
    },
  ];

  const copyTradeId = useCallback(async (tradeId: string) => {
    const safeTradeId = normalizeText(tradeId);
    if (!safeTradeId || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeTradeId);
      setCopiedTradeId(safeTradeId);
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => {
        setCopiedTradeId("");
      }, 1800);
    } catch {
      // Ignore clipboard failures.
    }
  }, []);

  const applySearchKeyword = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      searchKeyword: searchKeywordInput.trim(),
      page: 1,
    }));
  }, [searchKeywordInput]);

  const resetFilters = useCallback(() => {
    const next = createDefaultFilters("");
    setSearchKeywordInput("");
    setFilters(next);
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
                  Buyorder / Trade History
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  {querySummaryLabel}
                </span>
              </div>

              <div className="max-w-4xl space-y-3">
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  P2P 거래내역
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                  완료된 P2P 거래만 별도로 모아 보고, 거래번호부터 가맹점, 구매자, 판매자,
                  입금자명, 계좌번호까지 한 번에 검색할 수 있게 정리했습니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={backToBuyorderHref}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/15"
                >
                  구매주문 화면으로
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void loadTradeHistory({ silent: true });
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/15"
                >
                  {refreshing ? "새로고침 중..." : "새로고침"}
                </button>
              </div>

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
                    : hasPrivilegedOrderAccess
                    ? "관리자 권한으로 민감정보가 풀린 거래내역을 보고 있습니다."
                    : "공개 마스킹 뷰로 완료 거래를 보고 있습니다."}
                </div>
              </div>
            </div>

            <AdminWalletCard
              address={activeAccount?.address}
              accessLabel={walletAccessLabel}
              title={walletTitle}
              disconnectedMessage="관리자 지갑을 연결하면 마스킹이 해제된 완료 거래내역을 확인할 수 있습니다."
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
                Search
              </p>
              <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                완료 거래 검색
              </h2>
            </div>
            <div className="text-sm text-slate-500">
              Rows {Number(currentRangeStart).toLocaleString()}-{Number(currentRangeEnd).toLocaleString()} / {Number(data.totalCount || 0).toLocaleString()}
            </div>
          </div>

          <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
            <form
              className="grid gap-3 xl:grid-cols-12"
              onSubmit={(event) => {
                event.preventDefault();
                applySearchKeyword();
              }}
            >
              <label className="space-y-2 text-sm xl:col-span-5">
                <span className="font-medium text-slate-200">통합 검색</span>
                <input
                  value={searchKeywordInput}
                  onChange={(event) => setSearchKeywordInput(event.target.value)}
                  placeholder="거래번호, 가맹점, 구매자, 판매자, 입금자명, 계좌번호"
                  className="h-11 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 focus:bg-white/12"
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">시작일</span>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => updateDateRange(event.target.value, filters.toDate)}
                  className="h-11 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm text-white outline-none transition focus:border-sky-300/50 focus:bg-white/12"
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">종료일</span>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(event) => updateDateRange(filters.fromDate, event.target.value)}
                  className="h-11 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm text-white outline-none transition focus:border-sky-300/50 focus:bg-white/12"
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">회원등급</span>
                <select
                  value={filters.userType}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      userType: event.target.value,
                      page: 1,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border border-white/12 bg-white/8 px-4 text-sm text-white outline-none transition focus:border-sky-300/50 focus:bg-white/12"
                >
                  <option value="all">전체등급</option>
                  <option value="EMPTY">일반회원</option>
                  <option value="AAA">1등급</option>
                  <option value="BBB">2등급</option>
                  <option value="CCC">3등급</option>
                  <option value="DDD">4등급</option>
                </select>
              </label>

              <div className="flex items-end gap-2 xl:col-span-1">
                <button
                  type="submit"
                  className="h-11 flex-1 rounded-2xl bg-sky-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  검색
                </button>
              </div>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "오늘", days: 1 },
                  { label: "7일", days: 7 },
                  { label: "30일", days: 30 },
                  { label: "90일", days: 90 },
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

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <span>페이지당</span>
                  <select
                    value={filters.limit}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        limit: Number(event.target.value),
                        page: 1,
                      }))
                    }
                    className="h-9 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-white outline-none"
                  >
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-9 rounded-xl border border-white/12 bg-white/8 px-3 text-sm text-slate-200 transition hover:border-white/20 hover:bg-white/10"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {metrics.map((item) => (
            <div key={item.label} className="console-panel rounded-[26px] px-5 py-5">
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                {item.label}
              </div>
              <div className="console-display mt-3 text-[1.9rem] font-semibold tracking-[-0.06em] text-slate-950">
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

        {!hasPrivilegedOrderAccess ? (
          <section className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            관리자 지갑이 연결되지 않았거나 서명 준비 중이라서, 현재는 민감정보를 마스킹한 완료 거래내역을 보여주고 있습니다.
          </section>
        ) : null}

        <section className="console-panel rounded-[30px] p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Completed trades
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-950">P2P 완료 거래 스트림</div>
            </div>
            <div className="text-xs text-slate-500">
              {loading ? "불러오는 중..." : `마지막 동기화 ${data.fetchedAt ? formatDateTime(data.fetchedAt) : "-"}`}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1240px] w-full table-auto border-collapse">
              <thead className="bg-slate-950/95 text-left text-white">
                <tr>
                  <th className="px-4 py-3 text-sm font-semibold">거래</th>
                  <th className="px-4 py-3 text-sm font-semibold">구매자 / 출금계좌</th>
                  <th className="px-4 py-3 text-sm font-semibold">입금자</th>
                  <th className="px-4 py-3 text-sm font-semibold text-right">금액</th>
                  <th className="px-4 py-3 text-sm font-semibold">판매자 / 입금계좌</th>
                  <th className="px-4 py-3 text-sm font-semibold">입금처리</th>
                </tr>
              </thead>
              <tbody>
                {!loading && data.orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      완료된 P2P 거래내역이 없습니다.
                    </td>
                  </tr>
                ) : null}

                {data.orders.map((order, index) => {
                  const buyerBankInfo = getBankInfoDisplay(
                    order.buyer?.bankInfo,
                    order.buyer?.depositBankAccountNumber,
                  );
                  const sellerBankInfo = getBankInfoDisplay(order.seller?.bankInfo);
                  const paymentActorName = normalizeText(order.paymentConfirmedBy?.nickname)
                    || normalizeText(order.paymentConfirmedByName)
                    || "-";
                  const paymentActorWallet = normalizeText(order.paymentConfirmedBy?.walletAddress)
                    || normalizeText(order.paymentConfirmedByWalletAddress)
                    || "";
                  const paymentActorRole = normalizeText(order.paymentConfirmedBy?.role);
                  const completedAt = normalizeText(order.paymentConfirmedAt) || normalizeText(order.updatedAt);

                  return (
                    <tr
                      key={normalizeText(order._id) || normalizeText(order.tradeId) || `${index}`}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                    >
                      <td className="px-4 py-4 align-top">
                        <div className="flex min-w-[220px] items-start gap-3">
                          <div
                            className="h-12 w-12 shrink-0 rounded-2xl border border-slate-200 bg-white bg-cover bg-center bg-no-repeat"
                            style={{ backgroundImage: `url(${normalizeText(order.store?.storeLogo) || "/logo.png"})` }}
                          />
                          <div className="min-w-0 space-y-2">
                            <div>
                              <div className="text-base font-semibold text-slate-950">
                                {getOrderStoreName(order)}
                              </div>
                              <div className="text-xs text-slate-500">
                                {normalizeText(order.store?.storecode) || "-"}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                void copyTradeId(normalizeText(order.tradeId));
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              <span>{normalizeText(order.tradeId) || "-"}</span>
                              <span className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                                {copiedTradeId === normalizeText(order.tradeId) ? "복사됨" : "copy"}
                              </span>
                            </button>
                            <div className="text-sm text-slate-500">
                              {formatDateTime(completedAt)} · {formatTimeAgo(completedAt)}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="min-w-[220px] space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                              {getUserTypeLabel(order.userType)}
                            </span>
                            <span className="text-sm font-semibold text-slate-950">
                              {normalizeText(order.nickname) || normalizeText(order.buyer?.nickname) || "-"}
                            </span>
                          </div>
                          <div className="text-sm text-slate-500">{shortAddress(order.walletAddress || order.buyer?.walletAddress)}</div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            <div>{buyerBankInfo.summary}</div>
                            <div className="mt-1 font-medium text-slate-950">{buyerBankInfo.accountNumber}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="min-w-[140px] space-y-2">
                          <div className="text-sm font-semibold text-slate-950">
                            {normalizeText(order.buyer?.depositName) || buyerBankInfo.holder}
                          </div>
                          <div className="text-sm text-slate-500">
                            {buyerBankInfo.bankName}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top text-right">
                        <div className="min-w-[180px] space-y-2">
                          <div className="text-base font-semibold text-slate-950">{formatKrw(order.krwAmount)}</div>
                          <div className="text-sm text-slate-500">{formatUsdt(order.usdtAmount)}</div>
                          <div className="text-xs text-slate-400">환율 {formatRate(order.rate)}</div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="min-w-[230px] space-y-2">
                          <div className="text-sm font-semibold text-slate-950">
                            {normalizeText(order.seller?.nickname) || "-"}
                          </div>
                          <div className="text-sm text-slate-500">
                            {shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)}
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            <div>{sellerBankInfo.summary}</div>
                            <div className="mt-1 font-medium text-slate-950">{sellerBankInfo.accountNumber}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="min-w-[210px] space-y-2">
                          <div className="text-sm font-semibold text-slate-950">{paymentActorName}</div>
                          <div className="text-sm text-slate-500">{paymentActorWallet ? shortAddress(paymentActorWallet) : "-"}</div>
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">
                            {paymentActorRole || "actor"}
                          </div>
                          <div className="text-sm text-slate-500">{formatDateTime(completedAt)}</div>
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
              총 {Number(data.totalCount || 0).toLocaleString()}건 중 {Number(currentRangeStart).toLocaleString()}-{Number(currentRangeEnd).toLocaleString()}
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
