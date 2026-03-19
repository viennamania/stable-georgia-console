"use client";

import * as Ably from "ably";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import {
  BUYORDER_STATUS_ABLY_CHANNEL,
  BUYORDER_STATUS_ABLY_EVENT_NAME,
  type BuyOrderStatusRealtimeEvent,
} from "@/lib/realtime/buyorder";
import {
  BANKTRANSFER_UNMATCHED_ABLY_CHANNEL,
  BANKTRANSFER_UNMATCHED_ABLY_EVENT_NAME,
  type BankTransferUnmatchedRealtimeEvent,
} from "@/lib/realtime/banktransfer";
import { thirdwebClient } from "@/lib/thirdweb-client";

type BankInfo = {
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  realAccountNumber?: string;
};

type BuyOrder = {
  _id?: string;
  tradeId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  usdtAmount?: number;
  krwAmount?: number;
  rate?: number;
  transactionHash?: string;
  storecode?: string;
  nickname?: string;
  walletAddress?: string;
  autoConfirmPayment?: boolean | null;
  matchedByAdmin?: boolean | null;
  userType?: string;
  paymentMethod?: string;
  buyer?: {
    nickname?: string;
    walletAddress?: string;
    bankInfo?: BankInfo;
    depositBankName?: string;
    depositBankAccountNumber?: string;
    depositName?: string;
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
    storeLogo?: string;
    bankInfo?: BankInfo;
    bankInfoAAA?: BankInfo;
    bankInfoBBB?: BankInfo;
    bankInfoCCC?: BankInfo;
    bankInfoDDD?: BankInfo;
  } | null;
};

type StoreItem = {
  storecode?: string;
  storeName?: string;
  companyName?: string;
  storeLogo?: string;
};

type UnmatchedTransfer = {
  _id?: string;
  amount?: number;
  transactionName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  transactionDateUtc?: string;
  processingDate?: string;
  regDate?: string;
  storeInfo?: {
    storecode?: string;
    storeName?: string;
    storeLogo?: string;
  } | null;
};

const EMPTY_ORDERS: BuyOrder[] = [];
const EMPTY_STORES: StoreItem[] = [];
const EMPTY_UNMATCHED_TRANSFERS: UnmatchedTransfer[] = [];

type DashboardResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  metrics: {
    totalBuyOrders: number;
    totalClearanceOrders: number;
    audioOnBuyOrders: number;
    p2pTradeCount: number;
    storePaymentCount: number;
  };
  orders: BuyOrder[];
  orderTotalCount: number;
  processingBuyOrders: BuyOrder[];
  processingClearanceOrders: BuyOrder[];
  stores: StoreItem[];
  storeTotalCount: number;
  unmatchedTransfers: UnmatchedTransfer[];
  unmatchedTotalAmount: number;
  unmatchedTotalCount: number;
  selectedStore: Record<string, unknown> | null;
};

type FilterState = {
  storecode: string;
  limit: number;
  page: number;
  fromDate: string;
  toDate: string;
  searchTradeId: string;
  searchBuyer: string;
  searchMyOrders: boolean;
  searchOrderStatusCancelled: boolean;
  searchOrderStatusCompleted: boolean;
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

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const USDT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const createInputDate = (daysOffset = 0) => {
  const kstDate = new Date(Date.now() + KST_OFFSET_MS);
  kstDate.setUTCDate(kstDate.getUTCDate() + daysOffset);
  return kstDate.toISOString().slice(0, 10);
};

const createDefaultFilters = (): FilterState => ({
  storecode: "",
  limit: 50,
  page: 1,
  fromDate: createInputDate(0),
  toDate: createInputDate(0),
  searchTradeId: "",
  searchBuyer: "",
  searchMyOrders: false,
  searchOrderStatusCancelled: false,
  searchOrderStatusCompleted: false,
});

const areFiltersEqual = (left: FilterState, right: FilterState) => {
  return (
    left.storecode === right.storecode
    && left.limit === right.limit
    && left.page === right.page
    && left.fromDate === right.fromDate
    && left.toDate === right.toDate
    && left.searchTradeId === right.searchTradeId
    && left.searchBuyer === right.searchBuyer
    && left.searchMyOrders === right.searchMyOrders
    && left.searchOrderStatusCancelled === right.searchOrderStatusCancelled
    && left.searchOrderStatusCompleted === right.searchOrderStatusCompleted
  );
};

const statusMetaMap: Record<string, { label: string; className: string }> = {
  ordered: {
    label: "주문접수",
    className: "border border-slate-200 bg-slate-100 text-slate-700",
  },
  accepted: {
    label: "접수완료",
    className: "border border-sky-200 bg-sky-100 text-sky-700",
  },
  paymentRequested: {
    label: "결제요청",
    className: "border border-amber-200 bg-amber-50 text-amber-700",
  },
  paymentConfirmed: {
    label: "거래완료",
    className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  paymentSettled: {
    label: "정산완료",
    className: "border border-zinc-900 bg-zinc-900 text-white",
  },
  cancelled: {
    label: "거래취소",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
  },
  canceled: {
    label: "거래취소",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
  },
};

const statusRowToneMap: Record<string, string> = {
  paymentRequested: "bg-amber-50/70",
  paymentConfirmed: "bg-emerald-50/45",
  cancelled: "bg-rose-50/70",
  canceled: "bg-rose-50/70",
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

const formatUsdt = (value?: number | null) => {
  const numeric = Number(value || 0);
  return `${USDT_FORMATTER.format(numeric)} USDT`;
};

const formatKrw = (value?: number | null) => {
  const numeric = Number(value || 0);
  return `${KRW_FORMATTER.format(numeric)} KRW`;
};

const maskName = (value?: string | null) => {
  const safe = String(value || "").trim();
  if (!safe) {
    return "-";
  }
  if (safe.length <= 1) {
    return "*";
  }
  if (safe.length === 2) {
    return `${safe[0]}*`;
  }
  return `${safe[0]}${"*".repeat(Math.max(1, safe.length - 2))}${safe[safe.length - 1]}`;
};

const maskAccountNumber = (value?: string | null) => {
  const safe = String(value || "").trim();
  if (!safe) {
    return "-";
  }
  if (safe.length <= 4) {
    return `${"*".repeat(Math.max(1, safe.length - 1))}${safe.slice(-1)}`;
  }
  const head = safe.slice(0, -4).replace(/[0-9A-Za-z가-힣]/g, "*");
  return `${head}${safe.slice(-4)}`;
};

const hasBankInfo = (value?: BankInfo | null) => {
  return Boolean(
    value?.bankName
      || value?.accountHolder
      || value?.accountNumber
      || value?.realAccountNumber,
  );
};

const getFirstAvailableBankInfo = (...values: Array<BankInfo | null | undefined>) => {
  return values.find((value) => hasBankInfo(value)) || null;
};

const getSellerBankInfo = (order: BuyOrder) => {
  const userType = String(order.userType || "").trim();
  const storeBankInfo =
    userType === "AAA"
      ? order.store?.bankInfoAAA
      : userType === "BBB"
        ? order.store?.bankInfoBBB
        : userType === "CCC"
          ? order.store?.bankInfoCCC
          : userType === "DDD"
            ? order.store?.bankInfoDDD
            : order.store?.bankInfo;

  return getFirstAvailableBankInfo(
    order.seller?.bankInfo,
    storeBankInfo,
    order.store?.bankInfo,
    order.store?.bankInfoAAA,
    order.store?.bankInfoBBB,
    order.store?.bankInfoCCC,
    order.store?.bankInfoDDD,
  );
};

const getSellerBankSummary = (order: BuyOrder) => {
  const bankInfo = getSellerBankInfo(order);
  if (!bankInfo) {
    return {
      primary: "계좌정보 없음",
      secondary: shortAddress(order.seller?.walletAddress || order.seller?.signerAddress),
    };
  }

  const accountNumber = bankInfo.realAccountNumber || bankInfo.accountNumber || "";
  const primary = [bankInfo.bankName, bankInfo.accountHolder].filter(Boolean).join(" / ") || "계좌정보 없음";
  const secondary = accountNumber || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress);

  return { primary, secondary };
};

const getDepositProcessingMeta = (order: BuyOrder) => {
  if (order.autoConfirmPayment === true) {
    return {
      label: "자동",
      className: "bg-sky-100 text-sky-700",
      detail: "자동입금확인",
    };
  }

  if (order.autoConfirmPayment === false) {
    return {
      label: "수동",
      className: "bg-amber-100 text-amber-800",
      detail: "수동입금확인",
    };
  }

  if (order.matchedByAdmin === true) {
    return {
      label: "수동",
      className: "bg-amber-100 text-amber-800",
      detail: "관리자 확인",
    };
  }

  if (order.matchedByAdmin === false) {
    return {
      label: "자동",
      className: "bg-sky-100 text-sky-700",
      detail: "자동 매칭",
    };
  }

  if (order.status === "paymentRequested") {
    return {
      label: "확인중",
      className: "bg-slate-100 text-slate-700",
      detail: "입금 확인 대기",
    };
  }

  return {
    label: "-",
    className: "bg-slate-100 text-slate-500",
    detail: "",
  };
};

const getBuyerLabel = (order: BuyOrder) => {
  return (
    order.buyer?.nickname
    || order.nickname
    || shortAddress(order.buyer?.walletAddress || order.walletAddress)
  );
};

const getBuyerDepositName = (order: BuyOrder) => {
  return String(order.buyer?.depositName || "").trim();
};

const getSellerLabel = (order: BuyOrder) => {
  return (
    order.seller?.nickname
    || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)
  );
};

const getStoreLogoSrc = (order: BuyOrder, stores: StoreItem[]) => {
  const directLogo = String(order.store?.storeLogo || "").trim();
  if (directLogo) {
    return directLogo;
  }

  const storecode = String(order.store?.storecode || order.storecode || "").trim();
  if (!storecode) {
    return "/logo.png";
  }

  const fallbackLogo = stores.find((item) => String(item.storecode || "").trim() === storecode)?.storeLogo;
  return String(fallbackLogo || "").trim() || "/logo.png";
};

const getUnmatchedTransferStoreLogoSrc = (transfer: UnmatchedTransfer, stores: StoreItem[]) => {
  const directLogo = String(transfer.storeInfo?.storeLogo || "").trim();
  if (directLogo) {
    return directLogo;
  }

  const storecode = String(transfer.storeInfo?.storecode || "").trim();
  const storeName = String(transfer.storeInfo?.storeName || "").trim();

  const matchedStore = stores.find((item) => {
    const itemStorecode = String(item.storecode || "").trim();
    const itemStoreName = String(item.storeName || "").trim();
    const itemCompanyName = String(item.companyName || "").trim();

    if (storecode && itemStorecode === storecode) {
      return true;
    }

    return Boolean(storeName && (itemStoreName === storeName || itemCompanyName === storeName));
  });

  return String(matchedStore?.storeLogo || "").trim() || "/logo.png";
};

const getStoreDisplayName = (store: StoreItem | Record<string, unknown> | null | undefined) => {
  if (!store) {
    return "";
  }

  return String(
    (store as StoreItem).storeName
      || (store as StoreItem).companyName
      || (store as StoreItem).storecode
      || "",
  ).trim();
};

const getStoreOptionLogoSrc = (store: StoreItem | Record<string, unknown> | null | undefined) => {
  const logo = String((store as StoreItem | undefined)?.storeLogo || "").trim();
  return logo || "/logo.png";
};

export default function BuyorderConsoleClient({ lang }: { lang: string }) {
  const activeAccount = useActiveAccount();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters());
  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [storeSearchOpen, setStoreSearchOpen] = useState(false);
  const [data, setData] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState<Ably.ConnectionState>("initialized");
  const [connectionError, setConnectionError] = useState("");
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState("");
  const [lastUnmatchedEventAt, setLastUnmatchedEventAt] = useState("");
  const [highlightedTradeId, setHighlightedTradeId] = useState("");
  const [highlightedUnmatchedId, setHighlightedUnmatchedId] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmatchedHighlightResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRealtimeEventIdRef = useRef("");
  const lastUnmatchedRealtimeEventIdRef = useRef("");
  const ablyClientIdRef = useRef(`console-buyorder-${Math.random().toString(36).slice(2, 10)}`);
  const storeSearchRef = useRef<HTMLDivElement | null>(null);

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
        const signedOrdersBody = activeAccount
          ? await createCenterStoreAdminSignedBody({
              account: activeAccount,
              route: "/api/order/getAllBuyOrders",
              storecode: "admin",
              body: {
                storecode: filters.storecode,
                limit: filters.limit,
                page: filters.page,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
                searchTradeId: filters.searchTradeId,
                searchBuyer: filters.searchBuyer,
                searchMyOrders: filters.searchMyOrders,
                searchOrderStatusCancelled: filters.searchOrderStatusCancelled,
                searchOrderStatusCompleted: filters.searchOrderStatusCompleted,
              },
            })
          : null;

        const response = await fetch("/api/bff/admin/buyorder-dashboard", {
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
            unmatchedFilters: {
              limit: 24,
              page: 1,
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              storecode: filters.storecode,
            },
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load dashboard");
        }

        setData(payload.result as DashboardResult);
        setError("");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
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

  const copyTradeId = useCallback(async (tradeId: string) => {
    const safeTradeId = String(tradeId || "").trim();
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
      // Ignore clipboard failures and keep the table interaction non-blocking.
    }
  }, []);

  const applyRealtimeEventToDashboard = useCallback((event: BuyOrderStatusRealtimeEvent) => {
    const matchKey = String(event.tradeId || event.orderId || "").trim();
    if (!matchKey) {
      return;
    }

    setData((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const patchOrder = (order: BuyOrder) => {
        const orderTradeId = String(order.tradeId || order._id || "").trim();
        if (orderTradeId !== matchKey) {
          return order;
        }

        changed = true;
        return {
          ...order,
          status: event.statusTo || order.status,
          updatedAt: event.publishedAt || order.updatedAt,
          transactionHash: event.transactionHash || order.transactionHash,
        };
      };

      const nextOrders = current.orders.map(patchOrder);
      const nextProcessingBuyOrders = current.processingBuyOrders.map(patchOrder);
      const nextProcessingClearanceOrders = current.processingClearanceOrders.map(patchOrder);

      if (!changed) {
        return current;
      }

      return {
        ...current,
        fetchedAt: event.publishedAt || current.fetchedAt,
        orders: nextOrders,
        processingBuyOrders: nextProcessingBuyOrders,
        processingClearanceOrders: nextProcessingClearanceOrders,
      };
    });

    setLastRealtimeEventAt(event.publishedAt || new Date().toISOString());
    setHighlightedTradeId(matchKey);
    if (highlightResetTimerRef.current) {
      clearTimeout(highlightResetTimerRef.current);
    }
    highlightResetTimerRef.current = setTimeout(() => {
      setHighlightedTradeId("");
    }, 4000);
  }, []);

  const applyUnmatchedRealtimeEventToDashboard = useCallback(
    (event: BankTransferUnmatchedRealtimeEvent) => {
      setLastUnmatchedEventAt(event.publishedAt || new Date().toISOString());
      const matchStorecode = String(event.storecode || event.store?.code || "").trim();
      if (filters.storecode && matchStorecode && matchStorecode !== filters.storecode) {
        return;
      }

      const syntheticId = String(event.eventId || `${event.transactionDate || ""}-${event.bankAccountNumber || ""}`);
      if (!syntheticId) {
        return;
      }

      setHighlightedUnmatchedId(syntheticId);
      if (unmatchedHighlightResetTimerRef.current) {
        clearTimeout(unmatchedHighlightResetTimerRef.current);
      }
      unmatchedHighlightResetTimerRef.current = setTimeout(() => {
        setHighlightedUnmatchedId("");
      }, 4000);

      setData((current) => {
        if (!current) {
          return current;
        }

        const nextTransfer: UnmatchedTransfer = {
          _id: syntheticId,
          amount: Number(event.amount || 0),
          transactionName: String(event.transactionName || "").trim(),
          bankAccountNumber: String(event.bankAccountNumber || "").trim(),
          transactionDateUtc: event.transactionDate || null || undefined,
          processingDate: event.processingDate || null || undefined,
          storeInfo: {
            storecode: matchStorecode || undefined,
            storeName: String(event.store?.name || "").trim() || undefined,
          },
        };

        const nextTransfers = [nextTransfer, ...current.unmatchedTransfers.filter((item) => String(item._id || "") !== syntheticId)]
          .slice(0, 24);

        return {
          ...current,
          unmatchedTransfers: nextTransfers,
          unmatchedTotalAmount: current.unmatchedTotalAmount + Number(event.amount || 0),
          unmatchedTotalCount: current.unmatchedTotalCount + 1,
        };
      });
    },
    [filters.storecode],
  );

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
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const realtime = new Ably.Realtime({
      authUrl: `/api/bff/realtime/ably-token?stream=ops-admin&clientId=${ablyClientIdRef.current}`,
    });
    const channel = realtime.channels.get(BUYORDER_STATUS_ABLY_CHANNEL);
    const unmatchedChannel = realtime.channels.get(BANKTRANSFER_UNMATCHED_ABLY_CHANNEL);

    const onConnectionStateChange = (stateChange: Ably.ConnectionStateChange) => {
      setConnectionState(stateChange.current);
      if (stateChange.reason) {
        setConnectionError(stateChange.reason.message || "Ably connection error");
      } else if (stateChange.current === "connected") {
        setConnectionError("");
      }

      if (stateChange.current === "connected") {
        void loadDashboard({ silent: true });
      }
    };

    const onMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BuyOrderStatusRealtimeEvent;
      const eventId = event.eventId || String(message.id || "");
      if (eventId && lastRealtimeEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastRealtimeEventIdRef.current = eventId;
      }
      applyRealtimeEventToDashboard(event);
      requestRealtimeRefresh();
    };

    const onUnmatchedMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BankTransferUnmatchedRealtimeEvent;
      const eventId = event.eventId || String(message.id || "");
      if (eventId && lastUnmatchedRealtimeEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastUnmatchedRealtimeEventIdRef.current = eventId;
      }
      applyUnmatchedRealtimeEventToDashboard(event);
      requestRealtimeRefresh();
    };

    realtime.connection.on(onConnectionStateChange);
    void channel.subscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onMessage);
    void unmatchedChannel.subscribe(BANKTRANSFER_UNMATCHED_ABLY_EVENT_NAME, onUnmatchedMessage);

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
      }
      if (highlightResetTimerRef.current) {
        clearTimeout(highlightResetTimerRef.current);
      }
      if (unmatchedHighlightResetTimerRef.current) {
        clearTimeout(unmatchedHighlightResetTimerRef.current);
      }
      channel.unsubscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onMessage);
      unmatchedChannel.unsubscribe(BANKTRANSFER_UNMATCHED_ABLY_EVENT_NAME, onUnmatchedMessage);
      realtime.connection.off(onConnectionStateChange);
      realtime.close();
    };
  }, [applyRealtimeEventToDashboard, applyUnmatchedRealtimeEventToDashboard, loadDashboard, requestRealtimeRefresh]);

  const orders = data?.orders ?? EMPTY_ORDERS;
  const stores = data?.stores ?? EMPTY_STORES;
  const unmatchedTransfers = data?.unmatchedTransfers ?? EMPTY_UNMATCHED_TRANSFERS;
  const filteredStoreOptions = useMemo(() => {
    const normalizedQuery = storeSearchQuery.trim().toLowerCase();
    const results = stores.filter((item) => {
      if (!normalizedQuery) {
        return true;
      }

      const candidates = [
        String(item.storecode || "").trim().toLowerCase(),
        String(item.storeName || "").trim().toLowerCase(),
        String(item.companyName || "").trim().toLowerCase(),
      ];

      return candidates.some((value) => value.includes(normalizedQuery));
    });

    results.sort((left, right) => {
      const leftSelected = String(left.storecode || "").trim() === draftFilters.storecode;
      const rightSelected = String(right.storecode || "").trim() === draftFilters.storecode;

      if (leftSelected === rightSelected) {
        return getStoreDisplayName(left).localeCompare(getStoreDisplayName(right), "ko");
      }

      return leftSelected ? -1 : 1;
    });

    return results.slice(0, 16);
  }, [draftFilters.storecode, storeSearchQuery, stores]);
  const selectedStoreSummary = useMemo(() => {
    if (!filters.storecode) {
      return null;
    }

    return (
      stores.find((item) => String(item.storecode || "").trim() === filters.storecode)
      || data?.selectedStore
      || null
    );
  }, [data?.selectedStore, filters.storecode, stores]);
  const selectedDraftStoreSummary = useMemo(() => {
    if (!draftFilters.storecode) {
      return null;
    }

    return (
      stores.find((item) => String(item.storecode || "").trim() === draftFilters.storecode)
      || (filters.storecode === draftFilters.storecode ? selectedStoreSummary : null)
      || null
    );
  }, [draftFilters.storecode, filters.storecode, selectedStoreSummary, stores]);

  const remoteAdminUrl = useMemo(() => {
    const baseUrl = data?.remoteBackendBaseUrl || "https://www.stable.makeup";
    return `${baseUrl}/${lang}/admin/buyorder`;
  }, [data?.remoteBackendBaseUrl, lang]);

  const isSignedIn = Boolean(activeAccount);
  const fieldClassName =
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100";
  const metricCards = [
    {
      label: "Total buy orders",
      value: NUMBER_FORMATTER.format(data?.metrics.totalBuyOrders || 0),
      caption: "원백엔드 전체 진행 건수",
      accent: "bg-sky-500",
    },
    {
      label: "Clearance queue",
      value: NUMBER_FORMATTER.format(data?.metrics.totalClearanceOrders || 0),
      caption: "청산 대기 주문 수",
      accent: "bg-amber-500",
    },
    {
      label: "Audio alerts",
      value: NUMBER_FORMATTER.format(data?.metrics.audioOnBuyOrders || 0),
      caption: "오디오 알림이 켜진 주문",
      accent: "bg-emerald-500",
    },
    {
      label: "Stores",
      value: NUMBER_FORMATTER.format(data?.storeTotalCount || 0),
      caption: "검색 가능한 가맹점 수",
      accent: "bg-violet-500",
    },
    {
      label: "P2P 거래수(건)",
      value: NUMBER_FORMATTER.format(data?.metrics.p2pTradeCount || 0),
      caption: "trade summary totalCount",
      accent: "bg-emerald-500",
    },
    {
      label: "가맹점 결제수(건)",
      value: NUMBER_FORMATTER.format(data?.metrics.storePaymentCount || 0),
      caption: "trade summary settlement count",
      accent: "bg-amber-500",
    },
  ];
  const selectedScopeLabel = selectedStoreSummary
    ? (selectedStoreSummary as any).storeName
      || (selectedStoreSummary as any).companyName
      || "Selected store"
    : "전체 가맹점 범위";
  const syncStatusLabel = loading
    ? "Loading dashboard"
    : refreshing
      ? "Refreshing dashboard"
      : connectionState === "connected"
        ? "Ably live connected"
        : connectionState === "connecting" || connectionState === "initialized"
          ? "Connecting Ably live"
          : connectionState === "failed"
            ? "Ably failed, fallback polling"
            : connectionState === "suspended"
              ? "Ably suspended, fallback polling"
              : "Fallback polling active";
  const syncStatusTone = loading
    ? "text-sky-300"
    : refreshing
      ? "text-amber-300"
      : connectionState === "connected"
        ? "text-emerald-300"
        : connectionState === "connecting" || connectionState === "initialized"
          ? "text-sky-300"
          : "text-amber-300";
  const liveTransportLabel = connectionState === "connected"
    ? "Ably live"
    : connectionState === "connecting" || connectionState === "initialized"
      ? "Connecting"
      : "Fallback polling";
  const liveTransportBadgeClassName = connectionState === "connected"
    ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-200"
    : connectionState === "connecting" || connectionState === "initialized"
      ? "border-sky-400/30 bg-sky-400/12 text-sky-200"
      : "border-amber-400/30 bg-amber-400/12 text-amber-200";
  const liveQueueCards = [
    {
      label: "Processing buy orders",
      value: `${NUMBER_FORMATTER.format(data?.processingBuyOrders.length || 0)}건`,
    },
    {
      label: "Clearance waiting",
      value: `${NUMBER_FORMATTER.format(data?.processingClearanceOrders.length || 0)}건`,
    },
    {
      label: "Loaded rows",
      value: `${NUMBER_FORMATTER.format(orders.length)} / ${NUMBER_FORMATTER.format(data?.orderTotalCount || 0)}`,
    },
    {
      label: "Unmatched deposits",
      value: `${NUMBER_FORMATTER.format(data?.unmatchedTotalCount || 0)}건`,
    },
  ];
  const orderLimit = Math.max(1, Number(filters.limit) || 1);
  const totalOrderCount = Math.max(0, Number(data?.orderTotalCount || 0));
  const totalOrderPages = Math.max(1, Math.ceil(totalOrderCount / orderLimit));
  const currentOrderPage = Math.min(Math.max(1, Number(filters.page) || 1), totalOrderPages);
  const currentOrderRangeStart = orders.length === 0 ? 0 : ((currentOrderPage - 1) * orderLimit) + 1;
  const currentOrderRangeEnd = orders.length === 0 ? 0 : currentOrderRangeStart + orders.length - 1;
  const visibleOrderPages = useMemo(() => {
    const start = Math.max(1, currentOrderPage - 2);
    const end = Math.min(totalOrderPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);

    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  }, [currentOrderPage, totalOrderPages]);

  const setOrderPage = useCallback((nextPage: number) => {
    const safePage = Math.min(Math.max(1, nextPage), totalOrderPages);

    setDraftFilters((prev) => (prev.page === safePage ? prev : { ...prev, page: safePage }));
  }, [totalOrderPages]);

  useEffect(() => {
    if (!storeSearchOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!storeSearchRef.current?.contains(event.target as Node)) {
        setStoreSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [storeSearchOpen]);

  useEffect(() => {
    setFilters((prev) => (areFiltersEqual(prev, draftFilters) ? prev : draftFilters));
  }, [draftFilters]);

  useEffect(() => {
    if (filters.page <= totalOrderPages) {
      return;
    }

    setOrderPage(totalOrderPages);
  }, [filters.page, setOrderPage, totalOrderPages]);

  return (
    <div className="console-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.8fr)_380px] lg:px-8 lg:py-8">
            <div className="space-y-6">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  Stable Georgia / Ops Read Console
                </span>
                <span className={`rounded-full border border-white/12 bg-white/8 px-3 py-1 ${syncStatusTone}`}>
                  {syncStatusLabel}
                </span>
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_320px]">
                <div className="space-y-5">
                  <div className="max-w-4xl space-y-3">
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                      Stable Georgia
                      <br />
                      Buyorder Read Ops
                    </h1>
                    <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                      원격 관리자 API는 로컬 BFF가 흡수하고, 브라우저는 관리자 지갑 서명만 담당합니다.
                      이 콘솔은 읽기와 추적 중심으로 설계된 운영 화면입니다.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="console-dark-card rounded-[24px] p-4">
                      <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        Remote backend
                      </div>
                      <div className="mt-3 break-all text-sm font-medium leading-6 text-white/95">
                        {data?.remoteBackendBaseUrl || "https://www.stable.makeup"}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">BFF proxied target</div>
                    </div>

                    <div className="console-dark-card rounded-[24px] p-4">
                      <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        Current scope
                      </div>
                      <div className="mt-3 text-lg font-semibold text-white">
                        {filters.storecode || "admin"}
                      </div>
                      <div className="mt-2 text-xs leading-6 text-slate-400">{selectedScopeLabel}</div>
                    </div>

                    <div className="console-dark-card rounded-[24px] p-4">
                      <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        Last sync
                      </div>
                      <div className="mt-3 text-sm font-medium text-white">
                        {data?.fetchedAt ? formatDateTime(data.fetchedAt) : "Waiting for first sync"}
                      </div>
                      <div className={`mt-2 text-xs ${syncStatusTone}`}>{syncStatusLabel}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${liveTransportBadgeClassName}`}
                        >
                          {liveTransportLabel}
                        </span>
                        <span className="text-xs text-slate-400">
                          {lastRealtimeEventAt
                            ? `Last event ${formatDateTime(lastRealtimeEventAt)}`
                            : "Awaiting first live event"}
                        </span>
                        <span className="text-xs text-slate-400">
                          {lastUnmatchedEventAt
                            ? `Unmatched ${formatDateTime(lastUnmatchedEventAt)}`
                            : "Awaiting first unmatched event"}
                        </span>
                      </div>
                      {connectionError ? (
                        <div className="mt-1 text-xs text-rose-300">{connectionError}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="console-dark-card rounded-[28px] p-5">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Live command deck
                  </div>
                  <div className="mt-4 space-y-3">
                    {liveQueueCards.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-4"
                      >
                        <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
                          {item.label}
                        </div>
                        <div className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">
                          {item.value}
                        </div>
                      </div>
                    ))}
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
                <p className="text-sm leading-6 text-slate-300">
                  관리자 서명 이후에만 보호된 주문 피드가 열립니다. 연결 전에는 요약 수치와 범위 정보만
                  유지됩니다.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-[24px] border px-4 py-4 ${
                    isSignedIn
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : "border-white/10 bg-white/6"
                  }`}
                >
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Connected wallet
                  </div>
                  <div className="mt-2 break-all text-sm font-medium text-white">
                    {activeAccount?.address || "Not connected"}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {isSignedIn
                      ? "Signed requests are available now."
                      : "Connect to unlock protected order queries."}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
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
                      {isSignedIn
                        ? "Signed mode active"
                        : "Summary-only mode until a wallet is connected"}
                    </span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Remote admin handoff
                  </div>
                  <div className="mt-2 break-all text-sm leading-6 text-white/90">{remoteAdminUrl}</div>
                  <div className="mt-4">
                    <Link
                      href={remoteAdminUrl}
                      target="_blank"
                      className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-slate-100"
                    >
                      Open original admin
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {metricCards.map((item) => (
            <article key={item.label} className="console-panel relative overflow-hidden rounded-[28px] p-5">
              <div className={`absolute left-5 top-5 h-2 w-10 rounded-full ${item.accent}`} />
              <div className="console-mono pl-14 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {item.label}
              </div>
              <div className="console-display mt-5 text-right text-5xl font-semibold tracking-[-0.06em] text-slate-950">
                {item.value}
              </div>
              <div className="mt-2 text-right text-sm leading-6 text-slate-600">{item.caption}</div>
            </article>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_360px]">
          <div className="console-panel rounded-[30px] p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1">
                <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Filters
                </p>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  Admin query
                </h2>
                <p className="text-sm text-slate-600">
                  필요한 조건만 좁혀서 주문 테이블을 읽기 쉬운 상태로 유지합니다.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="console-mono rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                  scope: {filters.storecode || "admin"}
                </span>
                <span className="console-mono rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                  rows: {NUMBER_FORMATTER.format(orders.length)}
                </span>
                <span className="console-mono rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                  mode: {isSignedIn ? "signed" : "summary"}
                </span>
              </div>

	              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <div className="space-y-2 text-sm xl:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-200">가맹점 선택</span>
                    <button
                      type="button"
                      onClick={() => {
                        setStoreSearchQuery("");
                        setStoreSearchOpen(false);
                        setDraftFilters((prev) => ({
                          ...prev,
                          storecode: "",
                          page: 1,
                        }));
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10"
                    >
                      전체 범위
                    </button>
                  </div>
                  <div ref={storeSearchRef} className="relative">
                    <input
                      value={storeSearchQuery}
                      onFocus={() => setStoreSearchOpen(true)}
                      onChange={(event) => {
                        setStoreSearchOpen(true);
                        setStoreSearchQuery(event.target.value);
                      }}
                      placeholder="storecode / 가맹점명 검색"
                      className={fieldClassName}
                    />
                    {storeSearchOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_22px_55px_rgba(15,23,42,0.18)]">
                        <div className="max-h-80 overflow-y-auto p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDraftFilters((prev) => ({
                                ...prev,
                                storecode: "",
                                page: 1,
                              }));
                              setStoreSearchQuery("");
                              setStoreSearchOpen(false);
                            }}
                            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                              draftFilters.storecode
                                ? "text-slate-700 hover:bg-slate-50"
                                : "bg-sky-50 text-sky-900"
                            }`}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              All
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-slate-900">전체</div>
                              <div className="console-mono truncate text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                all stores
                              </div>
                            </div>
                            {!draftFilters.storecode ? (
                              <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                Selected
                              </span>
                            ) : null}
                          </button>

                          {filteredStoreOptions.length ? (
                            filteredStoreOptions.map((item) => {
                              const storecode = String(item.storecode || "").trim();
                              const displayName = getStoreDisplayName(item);
                              const logoSrc = getStoreOptionLogoSrc(item);
                              const isSelected = storecode === draftFilters.storecode;

                              return (
                                <button
                                  key={storecode || displayName}
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
                                    isSelected
                                      ? "bg-sky-50 text-sky-900"
                                      : "text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  <img
                                    src={logoSrc}
                                    alt={displayName || storecode || "Store"}
                                    className="h-10 w-10 rounded-2xl border border-slate-200 bg-white object-cover"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-slate-900">
                                      {displayName || storecode || "Unnamed store"}
                                    </div>
                                    <div className="console-mono truncate text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                      {storecode || "storecode unavailable"}
                                    </div>
                                  </div>
                                  {isSelected ? (
                                    <span className="rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                      Selected
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                              검색 조건에 맞는 가맹점이 없습니다.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {selectedDraftStoreSummary ? (
                    <div className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/5 px-4 py-3">
                      <img
                        src={getStoreOptionLogoSrc(selectedDraftStoreSummary)}
                        alt={getStoreDisplayName(selectedDraftStoreSummary) || draftFilters.storecode}
                        className="h-11 w-11 rounded-2xl border border-white/10 bg-white object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {getStoreDisplayName(selectedDraftStoreSummary) || draftFilters.storecode}
                        </div>
                        <div className="console-mono truncate text-[11px] uppercase tracking-[0.14em] text-slate-400">
                          {draftFilters.storecode}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
                      현재는 전체 가맹점 범위입니다. 검색에서 가맹점을 선택하면 해당 storecode만 필터링됩니다.
                    </div>
                  )}
                </div>

                <label className="space-y-2 text-sm xl:col-span-2">
                  <span className="font-medium text-slate-200">Trade ID</span>
                  <input
                    value={draftFilters.searchTradeId}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        searchTradeId: event.target.value,
                        page: 1,
                      }))
                    }
                    placeholder="search tradeId"
                    className={fieldClassName}
                  />
                </label>

	                <label className="space-y-2 text-sm xl:col-span-2">
	                  <span className="font-medium text-slate-200">Buyer search</span>
	                  <input
                    value={draftFilters.searchBuyer}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        searchBuyer: event.target.value,
                        page: 1,
                      }))
                    }
                    placeholder="nickname or wallet"
                    className={fieldClassName}
	                  />
	                </label>

	                <div className="space-y-2 text-sm xl:col-span-2">
	                  <span className="font-medium text-slate-200">Date presets</span>
	                  <div className="flex flex-wrap gap-2">
	                    {[
	                      { label: "오늘", offset: 0 },
	                      { label: "어제", offset: -1 },
	                    ].map((item) => {
	                      const date = createInputDate(item.offset);
	                      const isSelected = draftFilters.fromDate === date && draftFilters.toDate === date;

	                      return (
	                        <button
	                          key={item.label}
	                          type="button"
	                          onClick={() => {
	                            setDraftFilters((prev) => ({
	                              ...prev,
	                              fromDate: date,
	                              toDate: date,
	                              page: 1,
	                            }));
	                          }}
	                          className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
	                            isSelected
	                              ? "border-sky-300 bg-sky-300/15 text-sky-100"
	                              : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
	                          }`}
	                        >
	                          {item.label}
	                        </button>
	                      );
	                    })}
	                  </div>
	                </div>

	                <label className="space-y-2 text-sm xl:col-span-2">
	                  <span className="font-medium text-slate-200">Date</span>
	                  <input
	                    type="date"
                    value={draftFilters.fromDate}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        fromDate: event.target.value,
                        toDate: event.target.value,
                        page: 1,
                      }))
                    }
                    className={fieldClassName}
                  />
                </label>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {[
                  {
                    label: "My orders",
                    value: draftFilters.searchMyOrders,
                    key: "searchMyOrders",
                  },
                  {
                    label: "Include cancelled",
                    value: draftFilters.searchOrderStatusCancelled,
                    key: "searchOrderStatusCancelled",
                  },
                  {
                    label: "Include completed",
                    value: draftFilters.searchOrderStatusCompleted,
                    key: "searchOrderStatusCompleted",
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        [item.key]: !item.value,
                        page: 1,
                      }))
                    }
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      item.value
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="console-panel rounded-[30px] p-5">
              <div>
                <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Queue snapshot
                </p>
                <h2 className="console-display mt-1 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  Live queue
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                {liveQueueCards.slice(0, 3).map((item) => (
                  <div key={item.label} className="console-panel-muted rounded-[24px] p-4">
                    <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {item.label}
                    </div>
                    <div className="console-display mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  미신청입금 live
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {NUMBER_FORMATTER.format(unmatchedTransfers.length)} / {NUMBER_FORMATTER.format(data?.unmatchedTotalCount || 0)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  {formatKrw(data?.unmatchedTotalAmount || 0)}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${liveTransportBadgeClassName}`}
                >
                  {liveTransportLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto px-4 py-4">
            {unmatchedTransfers.length === 0 ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                No unmatched deposits returned for the current filter.
              </div>
            ) : (
              <div className="flex min-w-full gap-3">
                {unmatchedTransfers.map((transfer, index) => {
                  const id = String(transfer._id || `unmatched-${index}`);
                  const isHighlighted = highlightedUnmatchedId && highlightedUnmatchedId === id;
                  const storeLabel =
                    transfer.storeInfo?.storeName || transfer.storeInfo?.storecode || filters.storecode || "admin";
                  const storeLogoSrc = getUnmatchedTransferStoreLogoSrc(transfer, stores);
                  const transactionDate =
                    transfer.transactionDateUtc || transfer.processingDate || transfer.regDate || "";

                  return (
                    <article
                      key={id}
                      className={`min-w-[260px] max-w-[300px] rounded-[24px] border px-4 py-3 shadow-sm transition ${
                        isHighlighted
                          ? "border-emerald-200 bg-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.16)]"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {transfer.transactionName || "-"}
                          </div>
                          <div className="mt-1 truncate text-sm text-slate-600">
                            {transfer.bankAccountNumber || "-"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xl font-semibold tracking-[-0.04em] text-rose-600">
                            {formatKrw(transfer.amount || 0)}
                          </div>
                          {isHighlighted ? (
                            <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                              live updated
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-6 w-6 shrink-0 rounded-xl border border-slate-200 bg-slate-100 bg-cover bg-center"
                            style={{ backgroundImage: `url(${storeLogoSrc})` }}
                            aria-hidden="true"
                          />
                          <span className="truncate">{storeLabel}</span>
                        </div>
                        <span className="shrink-0">{formatDateTime(transactionDate)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Signed feed
                </p>
                <h2 className="console-display mt-1 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  Buyorder stream
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Rows {NUMBER_FORMATTER.format(currentOrderRangeStart)}-
                  {NUMBER_FORMATTER.format(currentOrderRangeEnd)} /{" "}
                  {NUMBER_FORMATTER.format(totalOrderCount)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Page {NUMBER_FORMATTER.format(currentOrderPage)} / {NUMBER_FORMATTER.format(totalOrderPages)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{syncStatusLabel}</span>
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${liveTransportBadgeClassName}`}
                >
                  {liveTransportLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            {!isSignedIn ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm leading-7 text-slate-600">
                주문 목록은 관리자 지갑을 연결한 뒤 서명해야 불러올 수 있습니다. 위 영역에서
                지갑을 연결하면 현재 필터 기준으로 `getAllBuyOrders`가 로컬 BFF를 통해
                호출됩니다.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto px-2 pb-2">
            <table className="min-w-[1240px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="console-mono text-left text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  <th className="border-b border-slate-200 px-4 py-3">Trade / Created</th>
                  <th className="w-[156px] border-b border-slate-200 px-4 py-3">Status</th>
                  <th className="border-b border-slate-200 px-4 py-3">Store</th>
                  <th className="border-b border-slate-200 px-4 py-3">Buyer</th>
                  <th className="border-b border-slate-200 px-4 py-3">Seller</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-right">Amount</th>
                  <th className="border-b border-slate-200 px-4 py-3">입금처리</th>
                  <th className="border-b border-slate-200 px-4 py-3">Tx</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      {loading ? "Loading orders..." : "No orders returned for the current filter."}
                    </td>
                  </tr>
                ) : (
                  orders.map((order, index) => {
                    const status = String(order.status || "").trim();
                    const statusMeta = statusMetaMap[status] || {
                      label: status || "-",
                      className: "border border-slate-200 bg-slate-100 text-slate-700",
                    };
                    const statusRowTone = statusRowToneMap[status] || "";
                    const storeLabel =
                      order.store?.storeName
                      || order.store?.storecode
                      || order.storecode
                      || "-";
                    const storeLogoSrc = getStoreLogoSrc(order, stores);
                    const rowMatchKey = String(order.tradeId || order._id || "").trim();
                    const isRealtimeHighlighted = highlightedTradeId && rowMatchKey === highlightedTradeId;
                    const createdAtLabel = formatDateTime(order.createdAt);
                    const createdTimeAgoLabel = formatTimeAgo(order.createdAt);
                    const sellerBankSummary = getSellerBankSummary(order);
                    const depositProcessing = getDepositProcessingMeta(order);
                    const tradeId = String(order.tradeId || "").trim();
                    const isCopiedTradeId = Boolean(tradeId && copiedTradeId === tradeId);
                    const buyerLabel = getBuyerLabel(order);
                    const buyerDepositName = getBuyerDepositName(order);
                    const shouldShowBuyerLabel = !buyerDepositName || buyerDepositName !== buyerLabel;

                    return (
                      <tr
                        key={order._id || order.tradeId}
                        className={`text-sm text-slate-700 transition hover:bg-sky-50/70 ${
                          isRealtimeHighlighted
                            ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200"
                            : statusRowTone
                              ? statusRowTone
                            : index % 2 === 0
                              ? "bg-white"
                              : "bg-slate-50/60"
                        }`}
                      >
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          {tradeId ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyTradeId(tradeId);
                              }}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-left transition hover:border-sky-300 hover:bg-sky-50"
                              title="클릭해서 tradeId 복사"
                            >
                              <span className="font-semibold text-slate-950">{tradeId}</span>
                              <span
                                className={`console-mono text-[10px] uppercase tracking-[0.14em] ${
                                  isCopiedTradeId ? "text-emerald-600" : "text-slate-400"
                                }`}
                              >
                                {isCopiedTradeId ? "copied" : "copy"}
                              </span>
                            </button>
                          ) : (
                            <div className="font-semibold text-slate-950">-</div>
                          )}
                          <div className="mt-1 text-xs text-slate-500">
                            {createdAtLabel === "-"
                              ? "-"
                              : `${createdAtLabel} · ${createdTimeAgoLabel}`}
                          </div>
                        </td>
                        <td className="w-[156px] border-b border-slate-100 px-4 py-4 align-top">
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`inline-flex w-[108px] justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                            {isRealtimeHighlighted ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                live updated
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="flex items-center gap-3">
                            <img
                              src={storeLogoSrc}
                              alt={storeLabel}
                              className="h-10 w-10 rounded-2xl border border-slate-200 bg-slate-100 object-cover"
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-950">{storeLabel}</div>
                              <div className="mt-1 text-xs text-slate-500">{order.storecode || "-"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="truncate text-[15px] font-semibold text-slate-950">
                            {buyerDepositName || buyerLabel}
                          </div>
                          {buyerDepositName && shouldShowBuyerLabel ? (
                            <div className="mt-1 truncate text-sm font-medium text-slate-600">
                              {buyerLabel}
                            </div>
                          ) : null}
                          <div className="console-mono mt-1 text-xs text-slate-500">
                            {shortAddress(order.buyer?.walletAddress || order.walletAddress)}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="font-medium text-slate-950">{getSellerLabel(order)}</div>
                          <div className="mt-1 text-xs text-slate-600">
                            {sellerBankSummary.primary}
                          </div>
                          <div className="console-mono mt-1 text-xs text-slate-500">
                            {sellerBankSummary.secondary}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-right align-top font-medium tabular-nums text-slate-950">
                          <div className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                            {formatKrw(order.krwAmount)}
                          </div>
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            {formatUsdt(order.usdtAmount)}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${depositProcessing.className}`}
                            >
                              {depositProcessing.label}
                            </span>
                            {depositProcessing.detail ? (
                              <span className="text-xs text-slate-500">{depositProcessing.detail}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 align-top">
                          {order.transactionHash ? (
                            <span className="console-mono text-xs text-slate-600">
                              {shortAddress(order.transactionHash)}
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 px-6 py-5">
            <div className="text-sm text-slate-600">
              {orders.length === 0
                ? "현재 페이지에 표시할 주문이 없습니다."
                : `${NUMBER_FORMATTER.format(currentOrderRangeStart)}-${NUMBER_FORMATTER.format(currentOrderRangeEnd)} / ${NUMBER_FORMATTER.format(totalOrderCount)} rows`}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderPage(1)}
                disabled={currentOrderPage === 1 || loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                처음
              </button>
              <button
                type="button"
                onClick={() => setOrderPage(currentOrderPage - 1)}
                disabled={currentOrderPage === 1 || loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>

              {visibleOrderPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setOrderPage(page)}
                  disabled={loading && page === currentOrderPage}
                  className={`min-w-[42px] rounded-full px-3 py-2 text-sm font-medium transition ${
                    page === currentOrderPage
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  } ${loading && page === currentOrderPage ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setOrderPage(currentOrderPage + 1)}
                disabled={currentOrderPage === totalOrderPages || loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
              <button
                type="button"
                onClick={() => setOrderPage(totalOrderPages)}
                disabled={currentOrderPage === totalOrderPages || loading}
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                마지막
              </button>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
