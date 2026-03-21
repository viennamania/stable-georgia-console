"use client";

import * as Ably from "ably";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
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

type ClearanceActor = {
  walletAddress?: string | null;
  nickname?: string | null;
  role?: string | null;
  storecode?: string | null;
};

type ClearanceOrderSourceMeta = {
  route?: string | null;
  source?: string | null;
  transactionHashDummyReason?: string | null;
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
  paymentAmount?: number;
  autoConfirmPayment?: boolean | null;
  usdtAmount?: number;
  krwAmount?: number;
  rate?: number;
  userType?: string;
  transactionHash?: string;
  walletAddress?: string;
  storecode?: string;
  nickname?: string;
  source?: string | null;
  automationSource?: string | null;
  createdBy?: ClearanceOrderSourceMeta | null;
  clearanceSource?: ClearanceOrderSourceMeta | null;
  buyer?: {
    nickname?: string;
    depositName?: string;
    depositCompleted?: boolean;
    depositCompletedAt?: string;
    depositCompletedBy?: ClearanceActor | null;
    depositBankName?: string;
    depositBankAccountNumber?: string;
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
  storesError?: string;
  ordersError?: string;
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
  receivedAt: string;
  highlightUntil: number;
};

type ClearanceActionMode = "complete" | "cancel";

type ClearanceActionModalState = {
  mode: ClearanceActionMode;
  order: ClearanceOrder;
};

const EMPTY_STORES: StoreItem[] = [];
const EMPTY_ORDERS: ClearanceOrder[] = [];
const EMPTY_WITHDRAWALS: BankTransferDashboardEvent[] = [];
const BUY_ORDER_DEPOSIT_COMPLETED_SIGNING_PREFIX = "admin-buyorder-deposit-completed-v1";
const CANCEL_CLEARANCE_ORDER_SIGNING_PREFIX = "admin-cancel-clearance-order-v1";
const WITHDRAWAL_WEBHOOK_CLEARANCE_CREATED_BY_ROUTE =
  "/api/order/createClearanceOrderFromWithdrawalWebhook";
const WITHDRAWAL_WEBHOOK_CLEARANCE_SOURCE = "banktransfer_withdrawn_webhook";

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
const WITHDRAWAL_CLOCK_TICK_MS = 5000;

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

const createLoadSignature = (filters: FilterState) => {
  return [
    filters.storecode,
    String(filters.limit),
    String(filters.page),
    filters.fromDate,
    filters.toDate,
    filters.searchMyOrders ? "1" : "0",
  ].join("|");
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

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

const formatAdminActionDateTime = (value?: string | null) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString("ko-KR");
};

const toSafeTimestamp = (value?: string | null) => {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatRealtimeDateTime = (value?: string | null) => {
  const timestamp = toSafeTimestamp(value);
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatRealtimeRelative = (value: string | null | undefined, nowMs: number) => {
  const timestamp = toSafeTimestamp(value);
  if (!timestamp) {
    return "-";
  }

  const diffMs = Math.max(0, nowMs - timestamp);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return `${diffSeconds}초 전`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}일 전`;
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

const getStoreBankInfoCandidates = (store?: StoreItem | null) => {
  const seen = new Set<string>();
  const candidates = [
    store?.bankInfo,
    store?.bankInfoAAA,
    store?.bankInfoBBB,
    store?.bankInfoCCC,
    store?.bankInfoDDD,
  ].filter(Boolean) as BankInfo[];

  return candidates.filter((item) => {
    const key = [
      normalizeText(item.bankName),
      normalizeText(item.accountHolder),
      normalizeAccountNumber(item.realAccountNumber || item.accountNumber),
    ].join("|");

    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const getStoreConfiguredBankInfoByAccountNumber = (
  store: StoreItem | null | undefined,
  bankAccountNumber?: string | null,
) => {
  const normalizedTarget = normalizeAccountNumber(bankAccountNumber);
  if (!normalizedTarget) {
    return null;
  }

  return (
    getStoreBankInfoCandidates(store).find((item) => {
      const normalizedAccountNumber = normalizeAccountNumber(item.accountNumber);
      const normalizedRealAccountNumber = normalizeAccountNumber(item.realAccountNumber);
      return (
        normalizedAccountNumber === normalizedTarget
        || normalizedRealAccountNumber === normalizedTarget
      );
    }) || null
  );
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

const getBuyerDisplayName = (order: ClearanceOrder) => {
  return String(order.buyer?.depositName || order.buyer?.nickname || order.nickname || "").trim() || "-";
};

const getBuyerBankInfo = (order: ClearanceOrder) => {
  return order.buyer?.bankInfo || null;
};

const getBuyerBankSummary = (order: ClearanceOrder) => {
  const bankInfo = getBuyerBankInfo(order);
  const accountNumber =
    order.buyer?.depositBankAccountNumber || bankInfo?.realAccountNumber || bankInfo?.accountNumber || "";
  const bankName = order.buyer?.depositBankName || bankInfo?.bankName || "";
  const accountHolder = order.buyer?.depositName || bankInfo?.accountHolder || "";

  return {
    primary: accountHolder || "계좌정보 없음",
    secondary: [bankName, normalizeAccountNumber(accountNumber)].filter(Boolean).join(" · ") || "계좌정보 없음",
  };
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

const isWithdrawalWebhookGeneratedClearanceOrder = (order: ClearanceOrder) => {
  const route = normalizeText(order.createdBy?.route || order.clearanceSource?.route);
  const source = normalizeText(
    order.createdBy?.source
      || order.source
      || order.automationSource
      || order.clearanceSource?.source,
  );

  return (
    route === WITHDRAWAL_WEBHOOK_CLEARANCE_CREATED_BY_ROUTE
    || source === WITHDRAWAL_WEBHOOK_CLEARANCE_SOURCE
  );
};

const getClearanceOrderCreationMeta = (order: ClearanceOrder) => {
  if (isWithdrawalWebhookGeneratedClearanceOrder(order)) {
    return {
      label: "시스템 생성",
      className: "border border-amber-300 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "관리자 생성",
    className: "border border-sky-300 bg-sky-50 text-sky-700",
  };
};

const getDepositCompletedActorLabel = (buyer?: ClearanceOrder["buyer"] | null) => {
  const actor = buyer?.depositCompletedBy;
  return actor?.nickname || shortAddress(actor?.walletAddress);
};

const isSystemDepositCompletedActor = (buyer?: ClearanceOrder["buyer"] | null) => {
  const actor = buyer?.depositCompletedBy;
  const nickname = normalizeText(actor?.nickname).toLowerCase();
  const role = normalizeText(actor?.role).toLowerCase();

  if (!actor) {
    return false;
  }

  return role === "system" || nickname === "withdrawal webhook";
};

const getWithdrawalProcessingModeMeta = (order: ClearanceOrder) => {
  const isCompleted = order.buyer?.depositCompleted === true;
  const isSystemProcessed = isCompleted
    ? isSystemDepositCompletedActor(order.buyer)
    : order.autoConfirmPayment === true;

  if (isSystemProcessed) {
    return {
      label: "시스템 처리",
      className: "border border-amber-200 bg-amber-50 text-amber-700",
      isManual: false,
    };
  }

  return {
    label: "수동처리",
    className: "border border-rose-200 bg-rose-50 text-rose-700",
    isManual: true,
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

const getWithdrawalRealtimeStatusMeta = (event?: BankTransferDashboardEvent | null) => {
  const normalizedStatus = normalizeText(event?.status).toLowerCase();

  if (normalizedStatus === "stored") {
    return {
      label: "저장완료",
      className: "border border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "오류",
    className: "border border-amber-200 bg-amber-50 text-amber-700",
  };
};

export default function ClearanceManagementConsoleClient({ lang }: { lang: string }) {
  const activeAccount = useActiveAccount();
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [storeSearchQuery, setStoreSearchQuery] = useState("");
  const [storeSearchOpen, setStoreSearchOpen] = useState(false);
  const [data, setData] = useState<ClearanceDashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [withdrawalRealtimeItems, setWithdrawalRealtimeItems] = useState<WithdrawalRealtimeItem[]>([]);
  const [connectionState, setConnectionState] = useState<Ably.ConnectionState>("initialized");
  const [connectionError, setConnectionError] = useState("");
  const [withdrawalRealtimeNowMs, setWithdrawalRealtimeNowMs] = useState(() => Date.now());
  const [actionModalState, setActionModalState] = useState<ClearanceActionModalState | null>(null);
  const [actionModalSubmitting, setActionModalSubmitting] = useState(false);
  const [actionModalError, setActionModalError] = useState("");
  const [processingOrderId, setProcessingOrderId] = useState("");

  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeSearchRef = useRef<HTMLDivElement | null>(null);
  const lastBuyorderEventIdRef = useRef("");
  const lastWithdrawalEventIdRef = useRef("");
  const ablyClientIdRef = useRef(`console-clearance-${Math.random().toString(36).slice(2, 10)}`);
  const desiredLoadSignatureRef = useRef("");

  desiredLoadSignatureRef.current = createLoadSignature(filters);

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      const loadSignature = createLoadSignature(filters);

      if (inflightLoadRef.current) {
        queuedSilentRefreshRef.current = true;
        return;
      }

      inflightLoadRef.current = true;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

    try {
      let signedOrdersBody: Record<string, unknown> | null = null;
      let ordersError = "";

      if (activeAccount) {
        try {
          signedOrdersBody = await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route: "/api/order/getAllBuyOrders",
            storecode: "admin",
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
          });
        } catch (signError) {
          ordersError = signError instanceof Error
            ? signError.message
            : "주문 조회 서명을 준비하지 못했습니다.";
        }
      }

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

        if (desiredLoadSignatureRef.current !== loadSignature) {
          queuedSilentRefreshRef.current = true;
          return;
        }

        const result = payload.result as ClearanceDashboardResult;
        const mergedOrdersError = ordersError || normalizeText(result?.ordersError);

        setData({
          ...result,
          ordersError: mergedOrdersError,
        });
        setWithdrawalRealtimeItems(
          Array.isArray(result?.withdrawalEvents)
            ? result.withdrawalEvents.map((event: BankTransferDashboardEvent) => ({
                id: String(event.eventId || event.traceId || Math.random().toString(36).slice(2)),
                data: event,
                receivedAt: new Date().toISOString(),
                highlightUntil: 0,
              }))
            : [],
        );
        setError(mergedOrdersError);
      } catch (loadError) {
        if (desiredLoadSignatureRef.current === loadSignature) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load clearance dashboard");
        }
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
    const timer = window.setInterval(() => {
      setWithdrawalRealtimeNowMs(Date.now());
    }, WITHDRAWAL_CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

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
      if (filters.storecode && storecode !== filters.storecode) {
        return;
      }

      requestRealtimeRefresh();
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
        || (filters.storecode && String(event.storecode || "").trim() !== filters.storecode)
      ) {
        return;
      }

      setWithdrawalRealtimeItems((current) => {
        const receivedAt = new Date().toISOString();
        const nextId = eventId || `${event.traceId || "withdraw"}-${event.publishedAt || Date.now()}`;
        const nextMap = new Map(current.map((item) => [item.id, item]));
        const existing = nextMap.get(nextId);
        nextMap.set(nextId, {
          id: nextId,
          data: event,
          receivedAt: existing?.receivedAt || receivedAt,
          highlightUntil: Date.now() + WITHDRAWAL_HIGHLIGHT_MS,
        });

        return Array.from(nextMap.values())
          .sort((left, right) => {
            const rightTimestamp = Math.max(
              toSafeTimestamp(right.data.processingDate),
              toSafeTimestamp(right.data.transactionDate),
              toSafeTimestamp(right.data.publishedAt),
              toSafeTimestamp(right.receivedAt),
            );
            const leftTimestamp = Math.max(
              toSafeTimestamp(left.data.processingDate),
              toSafeTimestamp(left.data.transactionDate),
              toSafeTimestamp(left.data.publishedAt),
              toSafeTimestamp(left.receivedAt),
            );
            return rightTimestamp - leftTimestamp;
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
  const storesError = normalizeText(data?.storesError);
  const ordersError = normalizeText(data?.ordersError);
  const orders = data?.orders || EMPTY_ORDERS;
  const selectedStore = useMemo(() => {
    if (!filters.storecode) {
      return null;
    }
    return stores.find((item) => String(item.storecode || "").trim() === filters.storecode) || data?.selectedStore || null;
  }, [data?.selectedStore, filters.storecode, stores]);
  const selectedStoreLabel = getStoreDisplayName(selectedStore) || filters.storecode || "전체 가맹점";
  const storeScopeLabel = filters.storecode || "all stores";
  const withdrawalRealtimeEventCount = withdrawalRealtimeItems.length;
  const withdrawalRealtimeAmountTotal = withdrawalRealtimeItems.reduce((sum, item) => {
    return sum + Number(item.data.amount || 0);
  }, 0);
  const latestWithdrawalRealtimeAt =
    withdrawalRealtimeItems[0]?.data.processingDate
    || withdrawalRealtimeItems[0]?.data.transactionDate
    || withdrawalRealtimeItems[0]?.data.publishedAt
    || withdrawalRealtimeItems[0]?.receivedAt
    || null;
  const connectionIndicatorClassName =
    connectionState === "connected"
      ? "bg-emerald-500"
      : connectionState === "connecting" || connectionState === "initialized"
        ? "bg-amber-400"
        : "bg-rose-500";
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
      });
  }, [storeSearchQuery, stores]);

  const applySelectedStorecode = useCallback(
    (storecode: string, store?: StoreItem | null) => {
      const normalizedStorecode = String(storecode || "").trim();
      const shouldResetStoreData = normalizedStorecode !== filters.storecode;

      setFilters((prev) => (
        prev.storecode === normalizedStorecode && prev.page === 1
          ? prev
          : {
              ...prev,
              storecode: normalizedStorecode,
              page: 1,
            }
      ));

      if (!shouldResetStoreData) {
        return;
      }

      setData((current) => {
        if (!current) {
          return current;
        }

        const nextSelectedStore =
          normalizedStorecode
            ? store
              || current.stores.find((item) => String(item.storecode || "").trim() === normalizedStorecode)
              || null
            : null;

        return {
          ...current,
          selectedStore: nextSelectedStore,
          orders: EMPTY_ORDERS,
          totalCount: 0,
          totalClearanceCount: 0,
          totalClearanceAmount: 0,
          totalClearanceAmountKRW: 0,
          withdrawalEvents: EMPTY_WITHDRAWALS,
        };
      });
      setWithdrawalRealtimeItems([]);
      setError("");
      setConnectionError("");
      setActionModalState(null);
      setActionModalError("");
    },
    [filters.storecode],
  );

  const patchOrderInDashboard = useCallback(
    (orderId: string, updater: (order: ClearanceOrder) => ClearanceOrder) => {
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          orders: current.orders.map((order) => {
            return String(order._id || "").trim() === orderId ? updater(order) : order;
          }),
        };
      });
    },
    [],
  );

  const openActionModal = useCallback(
    (mode: ClearanceActionMode, order: ClearanceOrder) => {
      const orderId = String(order._id || "").trim();
      if (!orderId) {
        setError("주문 식별 정보가 부족합니다.");
        return;
      }

      if (!activeAccount) {
        setError("관리자 지갑을 연결해야 출금 처리를 진행할 수 있습니다.");
        return;
      }

      setError("");
      setActionModalError("");
      setActionModalState({
        mode,
        order,
      });
    },
    [activeAccount],
  );

  const closeActionModal = useCallback(() => {
    if (actionModalSubmitting) {
      return;
    }

    setActionModalState(null);
    setActionModalError("");
  }, [actionModalSubmitting]);

  const canSubmitActionModal = useMemo(() => {
    if (!actionModalState) {
      return false;
    }

    const status = normalizeText(actionModalState.order.status);
    if (status === "cancelled") {
      return false;
    }

    return actionModalState.order.buyer?.depositCompleted !== true;
  }, [actionModalState]);

  const handleClearanceActionFromConsole = useCallback(async () => {
    if (!activeAccount || !actionModalState) {
      setActionModalError("처리 대상 주문이 없습니다.");
      return;
    }

    if (!canSubmitActionModal) {
      setActionModalError("주문 상태가 변경되어 더 이상 처리할 수 없습니다.");
      return;
    }

    const targetOrder = actionModalState.order;
    const orderId = String(targetOrder._id || "").trim();

    if (!orderId) {
      setActionModalError("주문 식별 정보가 부족합니다.");
      return;
    }

    const route =
      actionModalState.mode === "complete"
        ? "/api/order/buyOrderDepositCompleted"
        : "/api/order/cancelClearanceOrderByAdmin";
    const signingPrefix =
      actionModalState.mode === "complete"
        ? BUY_ORDER_DEPOSIT_COMPLETED_SIGNING_PREFIX
        : CANCEL_CLEARANCE_ORDER_SIGNING_PREFIX;
    const actionFields =
      actionModalState.mode === "complete"
        ? {
            orderId,
          }
        : {
            orderId,
            cancelReason: "cancelled_by_admin_clearance_management",
          };

    setActionModalSubmitting(true);
    setActionModalError("");
    setProcessingOrderId(orderId);

    try {
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route,
        signingPrefix,
        requesterWalletAddress: activeAccount.address,
        actionFields,
      });

      const response = await fetch("/api/bff/admin/signed-order-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route,
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "청산 처리에 실패했습니다.");
      }

      if (actionModalState.mode === "complete") {
        const nextBuyer = payload?.result?.buyer;
        patchOrderInDashboard(orderId, (order) => ({
          ...order,
          buyer: nextBuyer
            ? {
                ...(order.buyer || {}),
                ...nextBuyer,
              }
            : {
                ...(order.buyer || {}),
                depositCompleted: true,
                depositCompletedAt: new Date().toISOString(),
                depositCompletedBy: {
                  walletAddress: String(activeAccount.address || "").trim().toLowerCase(),
                },
              },
        }));
      } else {
        const nextOrder = payload?.result?.order;
        patchOrderInDashboard(orderId, (order) => ({
          ...order,
          ...(nextOrder || {}),
          status: String(nextOrder?.status || "cancelled").trim() || "cancelled",
          cancelledAt:
            normalizeText(nextOrder?.cancelledAt) || order.cancelledAt || new Date().toISOString(),
        }));
      }

      closeActionModal();
      void loadDashboard({ silent: true });
    } catch (actionError) {
      setActionModalError(
        actionError instanceof Error ? actionError.message : "청산 처리에 실패했습니다.",
      );
    } finally {
      setActionModalSubmitting(false);
      setProcessingOrderId("");
    }
  }, [
    activeAccount,
    actionModalState,
    canSubmitActionModal,
    closeActionModal,
    loadDashboard,
    patchOrderInDashboard,
  ]);

  const currentOrderPage = Math.max(1, filters.page);
  const totalOrderCount = Number(data?.totalCount || 0);
  const totalOrderPages = Math.max(1, Math.ceil(totalOrderCount / Math.max(1, filters.limit)));
  const currentOrderRangeStart = totalOrderCount === 0 ? 0 : (currentOrderPage - 1) * filters.limit + 1;
  const currentOrderRangeEnd = totalOrderCount === 0 ? 0 : Math.min(totalOrderCount, currentOrderPage * filters.limit);
  const actionModalBuyerBankSummary = actionModalState ? getBuyerBankSummary(actionModalState.order) : null;
  const actionModalSellerBankSummary = actionModalState ? getSellerBankSummary(actionModalState.order) : null;
  const actionModalWithdrawalStatusMeta = actionModalState
    ? getWithdrawalStatusMeta(actionModalState.order)
    : null;
  const actionModalProcessingModeMeta = actionModalState
    ? getWithdrawalProcessingModeMeta(actionModalState.order)
    : null;

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
                  <div className="mt-2 text-lg font-semibold text-white">{selectedStoreLabel}</div>
                  <div className="mt-1 text-xs text-slate-400">{storeScopeLabel}</div>
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
                  {!storeSearchOpen && !storeSearchQuery && selectedStore ? (
                    <div className="pointer-events-none absolute inset-x-4 inset-y-0 flex items-center gap-3">
                      <img
                        src={getStoreLogoSrc(selectedStore)}
                        alt={getStoreDisplayName(selectedStore) || filters.storecode}
                        className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {getStoreDisplayName(selectedStore) || filters.storecode}
                      </div>
                      <div className="console-mono truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        {filters.storecode}
                      </div>
                    </div>
                  ) : null}
                  {storeSearchOpen ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_22px_55px_rgba(15,23,42,0.18)]">
                      <div className="max-h-80 overflow-y-auto p-2">
                        <button
                          type="button"
                          onClick={() => {
                            applySelectedStorecode("");
                            setStoreSearchQuery("");
                            setStoreSearchOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                            filters.storecode
                              ? "text-slate-700 hover:bg-slate-50"
                              : "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
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
                          {!filters.storecode ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 16 16"
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                              </svg>
                              Selected
                            </span>
                          ) : null}
                        </button>

                        {filteredStoreOptions.length ? (
                          filteredStoreOptions.map((item) => {
                            const storecode = String(item.storecode || "").trim();
                            const active = storecode === filters.storecode;

                            return (
                              <button
                                key={storecode || getStoreDisplayName(item)}
                                type="button"
                                onClick={() => {
                                  applySelectedStorecode(storecode, item);
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
                                    {getStoreDisplayName(item) || storecode || "Unnamed store"}
                                  </div>
                                  <div className="console-mono truncate text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                    {storecode || "storecode unavailable"}
                                  </div>
                                </div>
                                {active ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 16 16"
                                      className="h-3 w-3"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                                    </svg>
                                    Selected
                                  </span>
                                ) : null}
                              </button>
                            );
                          })
                        ) : (
                          <div
                            className={`rounded-2xl border px-4 py-6 text-center text-sm ${
                              storesError
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-dashed border-slate-200 bg-slate-50 text-slate-500"
                            }`}
                          >
                            {loading
                              ? "가맹점 목록 불러오는 중..."
                              : storesError
                                ? `가맹점 목록을 불러오지 못했습니다. ${storesError}`
                                : "검색 조건에 맞는 가맹점이 없습니다."}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className={`text-xs ${storesError ? "text-rose-300" : "text-slate-400"}`}>
                  {storesError
                    ? `가맹점 목록 동기화 실패: ${storesError}`
                    : "가맹점 선택은 즉시 반영됩니다."}
                </div>
              </div>

              <label className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">날짜</span>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(event) => {
                    setFilters((prev) => ({
                      ...prev,
                      fromDate: event.target.value,
                      toDate: event.target.value,
                      page: 1,
                    }));
                  }}
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                />
              </label>

              <div className="space-y-2 text-sm xl:col-span-2">
                <span className="font-medium text-slate-200">빠른 날짜</span>
                <div className="flex h-12 items-center gap-2">
                  {[
                    { label: "오늘", offset: 0 },
                    { label: "어제", offset: -1 },
                  ].map((item) => {
                    const date = createInputDate(item.offset);
                    const active = filters.fromDate === date && filters.toDate === date;

                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            fromDate: date,
                            toDate: date,
                            page: 1,
                          }));
                        }}
                        className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                          active
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

              <div className="space-y-2 text-sm xl:col-span-3">
                <span className="font-medium text-slate-200">옵션</span>
                <div className="flex h-12 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({
                        ...prev,
                        searchMyOrders: !prev.searchMyOrders,
                        page: 1,
                      }));
                    }}
                    className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                      filters.searchMyOrders
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    내 주문
                  </button>
                </div>
                <div className="text-xs text-slate-400">날짜와 옵션 변경은 즉시 반영됩니다.</div>
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
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                    Live
                  </div>
                  <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                    webhook 통장출금 LIVE
                  </h2>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                    Ably
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {BANKTRANSFER_ABLY_EVENT_NAME}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    필터 {selectedStoreLabel}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                    최근 {latestWithdrawalRealtimeAt ? formatRealtimeRelative(latestWithdrawalRealtimeAt, withdrawalRealtimeNowMs) : "-"}
                  </span>
                  {refreshing ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                      silent refresh
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    Connection
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${connectionIndicatorClassName}`} />
                    {connectionState}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    Events
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {NUMBER_FORMATTER.format(withdrawalRealtimeEventCount)}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    Withdrawn
                  </div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-rose-600">
                    {formatKrwValue(withdrawalRealtimeAmountTotal)} KRW
                  </div>
                </div>
              </div>
            </div>

            {connectionError ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                연결 오류: {connectionError}
              </div>
            ) : null}
          </div>

          <div className="px-6 py-5">
            {withdrawalRealtimeEventCount === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                현재 조건에 맞는 통장출금 webhook 이벤트가 없습니다.
              </div>
            ) : (
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-full items-stretch gap-3">
                  {withdrawalRealtimeItems.map((item) => {
                    const event = item.data;
                    const isHighlighted = item.highlightUntil > withdrawalRealtimeNowMs;
                    const publishedAt =
                      event.processingDate || event.transactionDate || event.publishedAt || item.receivedAt;
                    const matchedStore =
                      stores.find((store) => {
                        return String(store.storecode || "").trim() === String(event.storecode || "").trim();
                      }) || null;
                    const configuredFromBankInfo = getStoreConfiguredBankInfoByAccountNumber(
                      matchedStore,
                      event.bankAccountNumber,
                    );
                    const isConfiguredAccountMatched = Boolean(configuredFromBankInfo);
                    const normalizedWebhookName = normalizeText(event.transactionName);
                    const normalizedConfiguredHolder = normalizeText(configuredFromBankInfo?.accountHolder);
                    const isConfiguredHolderMatched =
                      Boolean(normalizedWebhookName)
                      && Boolean(normalizedConfiguredHolder)
                      && normalizedWebhookName === normalizedConfiguredHolder;
                    const receiverAccountHolder =
                      normalizeText(event.receiver?.accountHolder) || normalizeText(event.receiver?.nickname) || "-";
                    const receiverBankName = normalizeText(event.receiver?.bankName) || "-";
                    const receiverAccountNumber =
                      normalizeAccountNumber(event.receiver?.accountNumber) || "-";
                    const eventStoreName =
                      normalizeText(event.store?.name)
                      || getStoreDisplayName(matchedStore)
                      || normalizeText(event.storecode)
                      || "미매칭";
                    const eventStoreLogo = normalizeText(event.store?.logo) || getStoreLogoSrc(matchedStore);
                    const eventStatusMeta = getWithdrawalRealtimeStatusMeta(event);

                    return (
                      <article
                        key={item.id}
                        className={`w-[322px] min-w-[322px] shrink-0 rounded-[26px] border px-4 py-4 transition-all ${
                          isHighlighted
                            ? "border-sky-300 bg-sky-50 shadow-[0_14px_30px_-20px_rgba(14,165,233,0.75)]"
                            : "border-slate-200 bg-white shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-rose-700">
                                출금
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${eventStatusMeta.className}`}>
                                {eventStatusMeta.label}
                              </span>
                              {isHighlighted ? (
                                <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                  NEW
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-rose-600">
                              {formatKrwValue(event.amount)} KRW
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {formatRealtimeDateTime(publishedAt)}
                            </div>
                          </div>

                          <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <img
                              src={eventStoreLogo}
                              alt={eventStoreName}
                              className="h-9 w-9 rounded-full border border-slate-200 bg-white object-cover"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-semibold text-slate-900">
                                {eventStoreName}
                              </div>
                              <div className="truncate text-[10px] text-slate-500">
                                {event.storecode || "-"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                송금인 통장
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  isConfiguredAccountMatched
                                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border border-amber-200 bg-amber-50 text-amber-700"
                                }`}
                              >
                                {isConfiguredAccountMatched ? "계좌 일치" : "계좌 미일치"}
                              </span>
                              {isConfiguredAccountMatched ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                    isConfiguredHolderMatched
                                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                      : "border border-slate-200 bg-slate-50 text-slate-600"
                                  }`}
                                >
                                  {isConfiguredHolderMatched ? "예금주 일치" : "예금주 상이"}
                                </span>
                              ) : null}
                            </div>

                            {isConfiguredAccountMatched ? (
                              <div className="mt-1.5 space-y-1">
                                <div className="text-xs font-semibold text-slate-900">
                                  {normalizeText(configuredFromBankInfo?.bankName) || "-"}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  {(normalizeText(configuredFromBankInfo?.accountHolder) || "-")
                                    + " · "
                                    + (normalizeAccountNumber(
                                      configuredFromBankInfo?.realAccountNumber || configuredFromBankInfo?.accountNumber,
                                    ) || "-")}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-1.5 text-[11px] text-slate-500">
                                해당 가맹점의 송금인 통장을 찾지 못했습니다.
                              </div>
                            )}

                            <div className="mt-2 text-[11px] text-slate-500">
                              거래명 {normalizedWebhookName || "-"}
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              계좌 {normalizeAccountNumber(event.bankAccountNumber) || "-"}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">수취인 통장</div>
                            <div className="mt-1 text-xs font-semibold text-slate-900">{receiverBankName}</div>
                            <div className="mt-1 text-[11px] text-slate-600">
                              {receiverAccountHolder} · {receiverAccountNumber}
                            </div>
                            {normalizeText(event.receiver?.walletAddress) ? (
                              <div className="console-mono mt-1 text-[10px] text-slate-500">
                                {shortAddress(event.receiver?.walletAddress)}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                            TID {event.tradeId || "-"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                            매칭 {event.match || "-"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                            {formatRealtimeRelative(publishedAt, withdrawalRealtimeNowMs)}
                          </span>
                        </div>

                        {normalizeText(event.errorMessage) ? (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                            {event.errorMessage}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
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
            {error || ordersError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error || ordersError}
              </div>
            ) : null}
          </div>

          <div className="px-2 pb-2">
            <table className="w-full table-fixed border-separate border-spacing-0">
              <thead>
                <tr className="console-mono text-left text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  <th className="w-[20%] border-b border-slate-200 px-3 py-3">Trade / Created</th>
                  <th className="w-[10%] border-b border-slate-200 px-3 py-3">Status</th>
                  <th className="w-[16%] border-b border-slate-200 px-3 py-3">Buyer</th>
                  <th className="w-[18%] border-b border-slate-200 px-3 py-3">Seller / 입금계좌</th>
                  <th className="w-[12%] border-b border-slate-200 px-3 py-3 text-right">Amount</th>
                  <th className="w-[15%] border-b border-slate-200 px-3 py-3">출금상태</th>
                  <th className="w-[9%] border-b border-slate-200 px-3 py-3">USDT 전송</th>
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
                    const orderId = String(order._id || "").trim();
                    const statusMeta = getStatusMeta(order.status);
                    const withdrawalStatusMeta = getWithdrawalStatusMeta(order);
                    const creationMeta = getClearanceOrderCreationMeta(order);
                    const processingModeMeta = getWithdrawalProcessingModeMeta(order);
                    const buyerLabel = getBuyerDisplayName(order);
                    const buyerBankSummary = getBuyerBankSummary(order);
                    const sellerBankSummary = getSellerBankSummary(order);
                    const createdAtLabel = formatDateTime(order.createdAt);
                    const createdTimeAgoLabel = formatTimeAgo(order.createdAt);
                    const transactionHash = String(order.transactionHash || "").trim();
                    const depositCompletedActorLabel = getDepositCompletedActorLabel(order.buyer);
                    const isWithdrawalCompleted = order.buyer?.depositCompleted === true;
                    const isCancelled = String(order.status || "").trim() === "cancelled";
                    const canManageWithdrawal = !isWithdrawalCompleted && !isCancelled;
                    const isProcessingThisOrder = processingOrderId === orderId;

                    return (
                      <tr
                        key={order._id || order.tradeId}
                        className={index % 2 === 0 ? "bg-white text-sm text-slate-700" : "bg-slate-50/60 text-sm text-slate-700"}
                      >
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <div className="flex items-start gap-3">
                            <img
                              src={getStoreLogoSrc(order.store)}
                              alt={getStoreDisplayName(order.store) || order.storecode || "Store"}
                              className="h-10 w-10 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
                            />
                            <div className="min-w-0 break-words">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-0 break-words font-semibold text-slate-950">
                                  {getStoreDisplayName(order.store) || order.storecode || "-"}
                                </div>
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${creationMeta.className}`}>
                                  {creationMeta.label}
                                </span>
                              </div>
                              <div className="mt-2 break-all font-semibold text-slate-900">
                                {order.tradeId || "-"}
                              </div>
                              <div className="mt-1 break-words text-xs text-slate-500">
                                {createdAtLabel === "-" ? "-" : `${createdAtLabel} · ${createdTimeAgoLabel}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <div className="space-y-1.5 break-words">
                            <div className="break-words font-medium text-slate-950">{buyerLabel}</div>
                            <div className="break-all text-xs text-slate-600">{buyerBankSummary.secondary}</div>
                            <div className="break-words text-xs text-slate-500">{buyerBankSummary.primary}</div>
                            <div className="console-mono break-all text-xs text-slate-500">
                              {shortAddress(order.buyer?.walletAddress || order.walletAddress)}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <div className="space-y-1.5 break-words">
                            <div className="break-words font-medium text-slate-950">
                              {order.seller?.nickname || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)}
                            </div>
                            <div className="break-words text-xs text-slate-600">{sellerBankSummary.primary}</div>
                            <div className="break-all text-xs text-slate-500">{sellerBankSummary.secondary}</div>
                            <div className="console-mono break-all text-xs text-slate-500">
                              {shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 text-right align-top">
                          <div className="text-[1.05rem] font-semibold tracking-[-0.03em] text-slate-950">
                            {formatKrwValue(order.krwAmount)} KRW
                          </div>
                          <div className="mt-1 text-xs font-semibold text-emerald-600">
                            {formatUsdtValue(order.usdtAmount)} USDT
                          </div>
                          <div className="mt-1 text-xs text-amber-700">
                            입금액 {formatKrwValue(order.paymentAmount)} KRW
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <div className="flex min-h-[136px] min-w-0 flex-col items-start gap-2 break-words">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${withdrawalStatusMeta.className}`}>
                              {withdrawalStatusMeta.label}
                            </span>
                            <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${processingModeMeta.className}`}>
                              {processingModeMeta.label}
                            </span>

                            {isWithdrawalCompleted ? (
                              <div className="space-y-1 text-xs text-slate-500">
                                {processingModeMeta.isManual && depositCompletedActorLabel && depositCompletedActorLabel !== "-" ? (
                                  <div>처리자 {depositCompletedActorLabel}</div>
                                ) : null}
                                {order.buyer?.depositCompletedAt ? (
                                  <div>{formatAdminActionDateTime(order.buyer.depositCompletedAt)}</div>
                                ) : null}
                              </div>
                            ) : isCancelled ? (
                              <div className="break-words text-xs text-slate-500">
                                취소된 주문으로 출금이 완료되지 않았습니다.
                              </div>
                            ) : (
                              <div className="flex w-full flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => openActionModal("complete", order)}
                                  disabled={isProcessingThisOrder || actionModalSubmitting}
                                  className={`rounded-full px-3 py-2 text-xs font-semibold text-white transition ${
                                    isProcessingThisOrder || actionModalSubmitting
                                      ? "cursor-not-allowed bg-emerald-300"
                                      : "bg-emerald-600 hover:bg-emerald-700"
                                  }`}
                                >
                                  {isProcessingThisOrder && actionModalState?.mode === "complete"
                                    ? "처리중..."
                                    : "완료하기"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openActionModal("cancel", order)}
                                  disabled={isProcessingThisOrder || actionModalSubmitting}
                                  className={`rounded-full px-3 py-2 text-xs font-semibold text-white transition ${
                                    isProcessingThisOrder || actionModalSubmitting
                                      ? "cursor-not-allowed bg-rose-300"
                                      : "bg-rose-600 hover:bg-rose-700"
                                  }`}
                                >
                                  {isProcessingThisOrder && actionModalState?.mode === "cancel"
                                    ? "취소중..."
                                    : "취소하기"}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          {transactionHash && transactionHash !== "0x" ? (
                            <div className="min-w-0 break-words">
                              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                전송완료
                              </div>
                              <div className="console-mono mt-2 break-all text-xs text-slate-500">{shortAddress(transactionHash)}</div>
                              <div className="mt-1 break-words text-xs text-slate-500">
                                {formatDateTime(order.paymentConfirmedAt || order.updatedAt)}
                              </div>
                            </div>
                          ) : (
                            <div className="min-w-0 break-words">
                              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                전송대기
                              </div>
                              <div className="mt-2 break-words text-xs text-slate-500">
                                출금완료 처리 후 반영됩니다.
                              </div>
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

        {actionModalState ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {actionModalState.mode === "complete" ? "출금완료 확인" : "청산취소 확인"}
                    </div>
                    <h3 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                      {actionModalState.mode === "complete"
                        ? "이 주문을 출금완료 처리하시겠습니까?"
                        : "이 청산주문을 취소하시겠습니까?"}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {actionModalState.mode === "complete"
                        ? "관리자 서명으로 `buyer.depositCompleted=true`를 기록합니다."
                        : "관리자 서명으로 주문 상태를 `cancelled`로 변경하고 연결된 입금 매칭을 해제합니다."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeActionModal}
                    disabled={actionModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Trade ID</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {actionModalState.order.tradeId || "-"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Store</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {getStoreDisplayName(actionModalState.order.store) || actionModalState.order.storecode || "-"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Buyer</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {getBuyerDisplayName(actionModalState.order)}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {actionModalBuyerBankSummary?.secondary || "계좌정보 없음"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Seller account</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {actionModalSellerBankSummary?.primary || "계좌정보 없음"}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {actionModalSellerBankSummary?.secondary || "-"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Order KRW</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {formatKrwValue(actionModalState.order.krwAmount)} KRW
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Order USDT</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {formatUsdtValue(actionModalState.order.usdtAmount)} USDT
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-3 py-1.5 font-semibold ${actionModalWithdrawalStatusMeta?.className || "border border-slate-200 bg-slate-50 text-slate-700"}`}>
                    현재 상태 {actionModalWithdrawalStatusMeta?.label || "-"}
                  </span>
                  <span className={`rounded-full px-3 py-1.5 font-semibold ${actionModalProcessingModeMeta?.className || "border border-slate-200 bg-slate-50 text-slate-700"}`}>
                    {actionModalProcessingModeMeta?.label || "-"}
                  </span>
                  {!canSubmitActionModal ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                      상태가 변경되어 더 이상 처리할 수 없습니다.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="px-6 py-5">
                <div
                  className={`rounded-[20px] border px-4 py-3 text-sm ${
                    actionModalState.mode === "complete"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800"
                  }`}
                >
                  {actionModalState.mode === "complete"
                    ? "이미 발생한 온체인 전송과 별개로, 관리자 출금완료 기록만 갱신합니다."
                    : "취소 후 주문 상태는 cancelled로 바뀌며, 이미 발생한 온체인 전송은 되돌릴 수 없습니다."}
                </div>

                {actionModalError ? (
                  <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {actionModalError}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-200 px-6 py-4">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeActionModal}
                    disabled={actionModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleClearanceActionFromConsole();
                    }}
                    disabled={actionModalSubmitting || !canSubmitActionModal}
                    className={`rounded-full px-5 py-2 text-sm font-semibold text-white transition ${
                      actionModalSubmitting || !canSubmitActionModal
                        ? "cursor-not-allowed bg-slate-300"
                        : actionModalState.mode === "complete"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {actionModalSubmitting
                      ? actionModalState.mode === "complete"
                        ? "출금완료 처리중..."
                        : "청산취소 처리중..."
                      : actionModalState.mode === "complete"
                        ? "출금완료 처리"
                        : "청산주문 취소"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
