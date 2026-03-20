"use client";

import * as Ably from "ably";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import {
  BANKTRANSFER_ABLY_CHANNEL,
  BANKTRANSFER_ABLY_EVENT_NAME,
  type BankTransferDashboardEvent,
} from "@/lib/realtime/banktransfer";
import {
  BUYORDER_STATUS_ABLY_CHANNEL,
  BUYORDER_STATUS_ABLY_EVENT_NAME,
  type BuyOrderStatusRealtimeEvent,
} from "@/lib/realtime/buyorder";
import { thirdwebClient } from "@/lib/thirdweb-client";

type BankInfo = {
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  realAccountNumber?: string;
};

type StoreItem = {
  storecode?: string;
  storeName?: string;
  companyName?: string;
  storeLogo?: string;
  bankInfo?: BankInfo;
  bankInfoAAA?: BankInfo;
  bankInfoBBB?: BankInfo;
  bankInfoCCC?: BankInfo;
  bankInfoDDD?: BankInfo;
};

type ClearanceOrder = {
  _id?: string;
  tradeId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  paymentRequestedAt?: string;
  paymentConfirmedAt?: string;
  cancelledAt?: string;
  usdtAmount?: number;
  krwAmount?: number;
  rate?: number;
  userType?: string;
  transactionHash?: string;
  walletAddress?: string;
  storecode?: string;
  nickname?: string;
  buyer?: {
    nickname?: string;
    depositName?: string;
    depositCompleted?: boolean;
    walletAddress?: string;
    bankInfo?: BankInfo;
  } | null;
  seller?: {
    nickname?: string;
    walletAddress?: string;
    signerAddress?: string;
    bankInfo?: BankInfo;
  } | null;
  store?: StoreItem | null;
};

type ClearanceDashboardResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  stores: StoreItem[];
  storeTotalCount: number;
  selectedStore: StoreItem | null;
  orders: ClearanceOrder[];
  totalCount: number;
  totalClearanceCount: number;
  totalClearanceAmount: number;
  totalClearanceAmountKRW: number;
  withdrawalEvents: BankTransferDashboardEvent[];
  withdrawalNextCursor: string | null;
};

type FilterState = {
  storecode: string;
  limit: number;
  page: number;
  fromDate: string;
  toDate: string;
  searchMyOrders: boolean;
};

type WithdrawalRealtimeItem = {
  id: string;
  data: BankTransferDashboardEvent;
  highlightUntil: number;
};

const EMPTY_STORES: StoreItem[] = [];
const EMPTY_ORDERS: ClearanceOrder[] = [];
const EMPTY_WITHDRAWALS: BankTransferDashboardEvent[] = [];

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

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const USDT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WITHDRAWAL_HIGHLIGHT_MS = 4500;

const createInputDate = (daysOffset = 0) => {
  const kstDate = new Date(Date.now() + KST_OFFSET_MS);
  kstDate.setUTCDate(kstDate.getUTCDate() + daysOffset);
  return kstDate.toISOString().slice(0, 10);
};

const createDefaultFilters = (): FilterState => ({
  storecode: "",
  limit: 30,
  page: 1,
  fromDate: createInputDate(0),
  toDate: createInputDate(0),
  searchMyOrders: false,
});

const normalizeBankTransferTransactionType = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "withdrawn" || normalized === "withdrawal" || normalized === "출금") {
    return "withdrawn";
  }
  if (normalized === "deposited" || normalized === "deposit" || normalized === "입금") {
    return "deposited";
  }
  return normalized;
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

const formatKrwValue = (value?: number | string | null) => {
  return NUMBER_FORMATTER.format(Number(value || 0));
};

const formatUsdtValue = (value?: number | string | null) => {
  return USDT_FORMATTER.format(Number(value || 0));
};

const shortAddress = (value?: string | null) => {
  const safe = String(value || "").trim();
  if (!safe) {
    return "-";
  }
  if (safe.length <= 12) {
    return safe;
  }
  return `${safe.slice(0, 6)}...${safe.slice(-4)}`;
};

const normalizeAccountNumber = (value?: string | null) => String(value || "").replace(/[\s-]/g, "");

const getStoreDisplayName = (store?: StoreItem | null) => {
  return String(store?.storeName || store?.companyName || store?.storecode || "").trim();
};

const getStoreLogoSrc = (store?: StoreItem | null) => {
  return String(store?.storeLogo || "").trim() || "/logo.png";
};

const getStoreBankInfo = (order: ClearanceOrder) => {
  const userType = String(order.userType || "").trim();
  if (userType === "AAA") {
    return order.store?.bankInfoAAA || order.store?.bankInfo;
  }
  if (userType === "BBB") {
    return order.store?.bankInfoBBB || order.store?.bankInfo;
  }
  if (userType === "CCC") {
    return order.store?.bankInfoCCC || order.store?.bankInfo;
  }
  if (userType === "DDD") {
    return order.store?.bankInfoDDD || order.store?.bankInfo;
  }
  return order.store?.bankInfo;
};

const getSellerBankSummary = (order: ClearanceOrder) => {
  const bankInfo = order.seller?.bankInfo || getStoreBankInfo(order);
  if (!bankInfo) {
    return {
      primary: "계좌정보 없음",
      secondary: shortAddress(order.seller?.walletAddress || order.seller?.signerAddress),
    };
  }

  const accountNumber = bankInfo.realAccountNumber || bankInfo.accountNumber || "";
  return {
    primary: [bankInfo.bankName, bankInfo.accountHolder].filter(Boolean).join(" / ") || "계좌정보 없음",
    secondary: accountNumber || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress),
  };
};

const getStatusMeta = (status?: string | null) => {
  const normalized = String(status || "").trim();
  const metaMap: Record<string, { label: string; className: string }> = {
    ordered: { label: "주문접수", className: "border border-slate-200 bg-slate-100 text-slate-700" },
    accepted: { label: "접수완료", className: "border border-sky-200 bg-sky-100 text-sky-700" },
    paymentRequested: { label: "결제요청", className: "border border-amber-200 bg-amber-50 text-amber-700" },
    paymentConfirmed: { label: "USDT 전송완료", className: "border border-emerald-200 bg-emerald-50 text-emerald-700" },
    cancelled: { label: "취소됨", className: "border border-rose-200 bg-rose-50 text-rose-700" },
  };

  return metaMap[normalized] || {
    label: normalized || "-",
    className: "border border-slate-200 bg-slate-100 text-slate-700",
  };
};

const getWithdrawalStatusMeta = (order: ClearanceOrder) => {
  if (String(order.status || "").trim() === "cancelled") {
    return {
      label: "취소됨",
      className: "border border-rose-200 bg-rose-50 text-rose-700",
      detail: "",
    };
  }

  if (order.buyer?.depositCompleted === true) {
    return {
      label: "출금완료",
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
      detail: "",
    };
  }

  return {
    label: "출금대기",
    className: "border border-slate-200 bg-slate-100 text-slate-700",
    detail: "",
  };
};

export default function ClearanceManagementConsoleClient({ lang }: { lang: string }) {
  const activeAccount = useActiveAccount();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters());
  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [storeSearchOpen, setStoreSearchOpen] = useState(false);
  const [data, setData] = useState<ClearanceDashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [withdrawalRealtimeItems, setWithdrawalRealtimeItems] = useState<WithdrawalRealtimeItem[]>([]);
  const [connectionState, setConnectionState] = useState<Ably.ConnectionState>("initialized");
  const [connectionError, setConnectionError] = useState("");

  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeSearchRef = useRef<HTMLDivElement | null>(null);
  const lastBuyorderEventIdRef = useRef("");
  const lastWithdrawalEventIdRef = useRef("");
  const ablyClientIdRef = useRef(`console-clearance-${Math.random().toString(36).slice(2, 10)}`);

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
        const signedOrdersBody =
          activeAccount && filters.storecode
            ? await createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/order/getAllCollectOrdersForSeller",
                storecode: filters.storecode,
                requesterWalletAddress: activeAccount.address,
                body: {
                  storecode: filters.storecode,
                  limit: filters.limit,
                  page: filters.page,
                  walletAddress: activeAccount.address,
                  searchMyOrders: filters.searchMyOrders,
                  privateSale: true,
                  fromDate: filters.fromDate,
                  toDate: filters.toDate,
                },
              })
            : null;

        const response = await fetch("/api/bff/admin/clearance-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            signedOrdersBody,
            selectedStorecode: filters.storecode,
            storesLimit: 200,
            storesPage: 1,
            withdrawalLimit: 24,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load clearance dashboard");
        }

        setData(payload.result as ClearanceDashboardResult);
        setWithdrawalRealtimeItems(
          Array.isArray(payload.result?.withdrawalEvents)
            ? payload.result.withdrawalEvents.map((event: BankTransferDashboardEvent) => ({
                id: String(event.eventId || event.traceId || Math.random().toString(36).slice(2)),
                data: event,
                highlightUntil: 0,
              }))
            : [],
        );
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load clearance dashboard");
      } finally {
        inflightLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);
        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          queueMicrotask(() => {
            void loadDashboard({ silent: true });
          });
        }
      }
    },
    [activeAccount, filters],
  );

  const requestRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) {
      clearTimeout(realtimeRefreshTimerRef.current);
    }

    realtimeRefreshTimerRef.current = setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void loadDashboard({ silent: true });
    }, 350);
  }, [loadDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadDashboard({ silent: true });
    }, 60000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (storeSearchRef.current && !storeSearchRef.current.contains(event.target as Node)) {
        setStoreSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!filters.storecode) {
      return;
    }

    const realtime = new Ably.Realtime({
      authUrl: `/api/bff/realtime/ably-token?stream=ops-admin&clientId=${ablyClientIdRef.current}`,
    });
    const buyorderChannel = realtime.channels.get(BUYORDER_STATUS_ABLY_CHANNEL);
    const banktransferChannel = realtime.channels.get(BANKTRANSFER_ABLY_CHANNEL);

    const onConnectionStateChange = (stateChange: Ably.ConnectionStateChange) => {
      setConnectionState(stateChange.current);
      if (stateChange.reason) {
        setConnectionError(stateChange.reason.message || "Ably connection error");
      } else if (stateChange.current === "connected") {
        setConnectionError("");
      }
    };

    const onBuyorderMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BuyOrderStatusRealtimeEvent & {
        store?: { code?: string | null; name?: string | null };
      };
      const eventId = String(event.eventId || message.id || "").trim();
      if (eventId && lastBuyorderEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastBuyorderEventIdRef.current = eventId;
      }

      const storecode = String(event.store?.code || "").trim();
      if (storecode && storecode === filters.storecode) {
        requestRealtimeRefresh();
      }
    };

    const onBanktransferMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BankTransferDashboardEvent;
      const eventId = String(event.eventId || message.id || "").trim();
      if (eventId && lastWithdrawalEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastWithdrawalEventIdRef.current = eventId;
      }

      if (
        normalizeBankTransferTransactionType(event.transactionType) !== "withdrawn"
        || String(event.storecode || "").trim() !== filters.storecode
      ) {
        return;
      }

      setWithdrawalRealtimeItems((current) => {
        const nextId = eventId || `${event.traceId || "withdraw"}-${event.publishedAt || Date.now()}`;
        const nextMap = new Map(current.map((item) => [item.id, item]));
        nextMap.set(nextId, {
          id: nextId,
          data: event,
          highlightUntil: Date.now() + WITHDRAWAL_HIGHLIGHT_MS,
        });

        return Array.from(nextMap.values())
          .sort((left, right) => {
            return (
              Date.parse(String(right.data.processingDate || right.data.transactionDate || right.data.publishedAt || 0))
              - Date.parse(String(left.data.processingDate || left.data.transactionDate || left.data.publishedAt || 0))
            );
          })
          .slice(0, 24);
      });

      requestRealtimeRefresh();
    };

    realtime.connection.on(onConnectionStateChange);
    void buyorderChannel.subscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onBuyorderMessage);
    void banktransferChannel.subscribe(BANKTRANSFER_ABLY_EVENT_NAME, onBanktransferMessage);

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }
      buyorderChannel.unsubscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onBuyorderMessage);
      banktransferChannel.unsubscribe(BANKTRANSFER_ABLY_EVENT_NAME, onBanktransferMessage);
      realtime.connection.off(onConnectionStateChange);
      realtime.close();
    };
  }, [filters.storecode, requestRealtimeRefresh]);

  const stores = data?.stores || EMPTY_STORES;
  const orders = data?.orders || EMPTY_ORDERS;
  const selectedStore = useMemo(() => {
    if (!filters.storecode) {
      return null;
    }
    return stores.find((item) => String(item.storecode || "").trim() === filters.storecode) || data?.selectedStore || null;
  }, [data?.selectedStore, filters.storecode, stores]);
  const filteredStoreOptions = useMemo(() => {
    const normalizedQuery = storeSearchQuery.trim().toLowerCase();
    return stores
      .filter((item) => {
        if (!normalizedQuery) {
          return true;
        }
        return [
          String(item.storecode || "").trim().toLowerCase(),
          String(item.storeName || "").trim().toLowerCase(),
          String(item.companyName || "").trim().toLowerCase(),
        ].some((value) => value.includes(normalizedQuery));
      })
      .slice(0, 16);
  }, [storeSearchQuery, stores]);

  const currentOrderPage = Math.max(1, filters.page);
  const totalOrderCount = Number(data?.totalCount || 0);
  const totalOrderPages = Math.max(1, Math.ceil(totalOrderCount / Math.max(1, filters.limit)));
  const currentOrderRangeStart = totalOrderCount === 0 ? 0 : (currentOrderPage - 1) * filters.limit + 1;
  const currentOrderRangeEnd = totalOrderCount === 0 ? 0 : Math.min(totalOrderCount, currentOrderPage * filters.limit);

  return (
    <div className="console-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.8fr)_380px] lg:px-8 lg:py-8">
            <div className="space-y-6">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  Stable Georgia / Clearance Console
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  {refreshing ? "Live refresh running" : "Live clearance board"}
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  Clearance Management
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                  청산 주문 목록과 출금 webhook 흐름을 한 화면에서 확인합니다. 선택한 가맹점 기준으로
                  주문 목록은 `buyorder.status.changed`, 출금 live는 `banktransfer.updated`를 구독합니다.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Selected store
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {getStoreDisplayName(selectedStore) || "가맹점 선택 필요"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{filters.storecode || "storecode not selected"}</div>
                </div>
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Last sync
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {data?.fetchedAt ? formatDateTime(data.fetchedAt) : "Waiting for first sync"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{connectionState}</div>
                </div>
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Wallet gate
                  </div>
                  <div className="mt-2 text-sm font-medium text-white">
                    {activeAccount?.address || "관리자 지갑 미연결"}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    연결 전에는 가맹점 목록만 보고, 주문 목록은 서명 후 조회됩니다.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-slate-950/66 p-5 text-white backdrop-blur">
              <div className="space-y-2">
                <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  Signed access
                </p>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-white">
                  Wallet signature gate
                </h2>
              </div>

              <div className="mt-5 rounded-[24px] border border-white/10 bg-white/6 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <ConnectButton
                    client={thirdwebClient}
                    wallets={[
                      inAppWallet({
                        auth: {
                          options: ["email", "google", "apple"],
                        },
                      }),
                      createWallet("io.metamask"),
                      createWallet("com.coinbase.wallet"),
                    ]}
                    theme="dark"
                  />
                  <span className="text-sm text-slate-300">
                    {activeAccount ? "Signed mode active" : "Connect to unlock protected clearance queries"}
                  </span>
                </div>
                {connectionError ? (
                  <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {connectionError}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="console-panel rounded-[30px] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                Filters
              </p>
              <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                Clearance query
              </h2>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
            <div className="grid gap-3 xl:grid-cols-12">
              <div className="space-y-2 text-sm xl:col-span-5">
                <span className="font-medium text-slate-200">가맹점 선택</span>
                <div ref={storeSearchRef} className="relative">
                  <input
                    value={storeSearchQuery}
                    onFocus={() => setStoreSearchOpen(true)}
                    onChange={(event) => {
                      setStoreSearchOpen(true);
                      setStoreSearchQuery(event.target.value);
                    }}
                    placeholder="storecode / 가맹점명 검색"
                    className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  />
                  {storeSearchOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_22px_55px_rgba(15,23,42,0.18)]">
                      <div className="max-h-80 overflow-y-auto p-2">
                        {filteredStoreOptions.map((item) => {
                          const storecode = String(item.storecode || "").trim();
                          const active = storecode === draftFilters.storecode;

                          return (
                            <button
                              key={storecode || getStoreDisplayName(item)}
                              type="button"
                              onClick={() => {
                                setDraftFilters((prev) => ({
                                  ...prev,
                                  storecode,
                                  page: 1,
                                }));
                                setStoreSearchQuery("");
                                setStoreSearchOpen(false);
                              }}
                              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                                active
                                  ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
                                  : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              <img
                                src={getStoreLogoSrc(item)}
                                alt={getStoreDisplayName(item) || storecode || "Store"}
                                className="h-10 w-10 rounded-2xl border border-slate-200 bg-white object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {getStoreDisplayName(item) || storecode}
                                </div>
                                <div className="console-mono truncate text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                  {storecode}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">From</span>
                <input
                  type="date"
                  value={draftFilters.fromDate}
                  onChange={(event) => {
                    setDraftFilters((prev) => ({
                      ...prev,
                      fromDate: event.target.value,
                      page: 1,
                    }));
                  }}
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">To</span>
                <input
                  type="date"
                  value={draftFilters.toDate}
                  onChange={(event) => {
                    setDraftFilters((prev) => ({
                      ...prev,
                      toDate: event.target.value,
                      page: 1,
                    }));
                  }}
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div className="space-y-2 text-sm xl:col-span-3">
                <span className="font-medium text-slate-200">옵션</span>
                <div className="flex h-12 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftFilters((prev) => ({
                        ...prev,
                        searchMyOrders: !prev.searchMyOrders,
                        page: 1,
                      }));
                    }}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                      draftFilters.searchMyOrders
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    내 주문
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(draftFilters);
                    }}
                    className="rounded-full border border-emerald-400/30 bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    적용
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "전체 주문",
              value: NUMBER_FORMATTER.format(data?.totalCount || 0),
              caption: "현재 필터 기준 청산 주문 수",
            },
            {
              label: "출금완료",
              value: NUMBER_FORMATTER.format(data?.totalClearanceCount || 0),
              caption: "paymentConfirmed 기준 완료 건수",
            },
            {
              label: "청산량",
              value: `${formatUsdtValue(data?.totalClearanceAmount || 0)} USDT`,
              caption: "완료된 청산 물량",
            },
            {
              label: "청산금액",
              value: `${formatKrwValue(data?.totalClearanceAmountKRW || 0)} KRW`,
              caption: "완료된 청산 금액",
            },
          ].map((item) => (
            <article key={item.label} className="console-panel rounded-[28px] p-5">
              <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {item.label}
              </div>
              <div className="console-display mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                {item.value}
              </div>
              <div className="mt-2 text-sm text-slate-600">{item.caption}</div>
            </article>
          ))}
        </section>

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  webhook 통장출금 LIVE
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {filters.storecode || "store not selected"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{connectionState}</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto px-6 py-5">
            <div className="flex min-w-full gap-3">
              {(withdrawalRealtimeItems.length === 0 ? [] : withdrawalRealtimeItems).map((item) => {
                const isHighlighted = item.highlightUntil > Date.now();
                const event = item.data;
                const receiverLabel = event.receiver?.accountHolder || event.receiver?.nickname || "-";

                return (
                  <article
                    key={item.id}
                    className={`w-[292px] shrink-0 rounded-[24px] border px-4 py-4 transition ${
                      isHighlighted
                        ? "border-emerald-200 bg-emerald-50/80 shadow-[0_12px_30px_-18px_rgba(16,185,129,0.65)]"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-400">출금</div>
                        <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-rose-600">
                          {formatKrwValue(event.amount)} KRW
                        </div>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                        {formatTimeAgo(event.processingDate || event.transactionDate || event.publishedAt)}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">수취인</div>
                        <div className="mt-1 font-semibold text-slate-900">{receiverLabel}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {event.receiver?.bankName || "-"} · {normalizeAccountNumber(event.receiver?.accountNumber) || "-"}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">원본 거래명</div>
                        <div className="mt-1 font-medium text-slate-900">{event.transactionName || "-"}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(event.processingDate || event.transactionDate)}</div>
                      </div>
                    </div>
                  </article>
                );
              })}

              {withdrawalRealtimeItems.length === 0 ? (
                <div className="w-full rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                  선택한 가맹점의 출금 live 이벤트가 아직 없습니다.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  Clearance stream
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Rows {NUMBER_FORMATTER.format(currentOrderRangeStart)}-{NUMBER_FORMATTER.format(currentOrderRangeEnd)} / {NUMBER_FORMATTER.format(totalOrderCount)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Page {NUMBER_FORMATTER.format(currentOrderPage)} / {NUMBER_FORMATTER.format(totalOrderPages)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            {error ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto px-2 pb-2">
            <table className="min-w-[1320px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="console-mono text-left text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  <th className="border-b border-slate-200 px-4 py-3">Trade / Created</th>
                  <th className="w-[150px] border-b border-slate-200 px-4 py-3">Status</th>
                  <th className="border-b border-slate-200 px-4 py-3">Buyer</th>
                  <th className="border-b border-slate-200 px-4 py-3">Seller / 입금계좌</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-right">Amount</th>
                  <th className="w-[160px] border-b border-slate-200 px-4 py-3">출금상태</th>
                  <th className="w-[170px] border-b border-slate-200 px-4 py-3">USDT 전송</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      {loading ? "Loading clearance orders..." : "No clearance orders returned for the current filter."}
                    </td>
                  </tr>
                ) : (
                  orders.map((order, index) => {
                    const statusMeta = getStatusMeta(order.status);
                    const withdrawalStatusMeta = getWithdrawalStatusMeta(order);
                    const sellerBankSummary = getSellerBankSummary(order);
                    const buyerLabel = String(order.buyer?.depositName || order.buyer?.nickname || order.nickname || "").trim() || "-";
                    const createdAtLabel = formatDateTime(order.createdAt);
                    const createdTimeAgoLabel = formatTimeAgo(order.createdAt);
                    const transactionHash = String(order.transactionHash || "").trim();

                    return (
                      <tr
                        key={order._id || order.tradeId}
                        className={index % 2 === 0 ? "bg-white text-sm text-slate-700" : "bg-slate-50/60 text-sm text-slate-700"}
                      >
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="font-semibold text-slate-950">{order.tradeId || "-"}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {createdAtLabel === "-" ? "-" : `${createdAtLabel} · ${createdTimeAgoLabel}`}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="font-medium text-slate-950">{buyerLabel}</div>
                          <div className="console-mono mt-1 text-xs text-slate-500">
                            {shortAddress(order.buyer?.walletAddress || order.walletAddress)}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="font-medium text-slate-950">
                            {order.seller?.nickname || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{sellerBankSummary.primary}</div>
                          <div className="console-mono mt-1 text-xs text-slate-500">{sellerBankSummary.secondary}</div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-right align-top">
                          <div className="text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-950">
                            {formatKrwValue(order.krwAmount)} KRW
                          </div>
                          <div className="mt-1 text-xs font-semibold text-emerald-600">
                            {formatUsdtValue(order.usdtAmount)} USDT
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${withdrawalStatusMeta.className}`}>
                            {withdrawalStatusMeta.label}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          {transactionHash && transactionHash !== "0x" ? (
                            <div>
                              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                전송완료
                              </div>
                              <div className="console-mono mt-2 text-xs text-slate-500">{shortAddress(transactionHash)}</div>
                            </div>
                          ) : (
                            <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                              전송대기
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
