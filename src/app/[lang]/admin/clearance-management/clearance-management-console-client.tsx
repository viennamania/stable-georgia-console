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

type ClearanceBaseResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  stores: StoreItem[];
  storeTotalCount: number;
  storesError?: string;
  withdrawalEvents: BankTransferDashboardEvent[];
  withdrawalNextCursor: string | null;
};

type ClearanceOrdersResult = {
  ordersError?: string;
  orders: ClearanceOrder[];
  totalCount: number;
  totalClearanceCount: number;
  totalClearanceAmount: number;
  totalClearanceAmountKRW: number;
};

type ClearanceDashboardResult = ClearanceBaseResult & ClearanceOrdersResult;

type ClearanceOrdersQueryMode = "buyOrders" | "collectOrdersForSeller";

type FilterState = {
  storecode: string;
  limit: number;
  page: number;
  fromDate: string;
  toDate: string;
  searchMyOrders: boolean;
};

type ClearanceManagementConsoleClientProps = {
  lang: string;
  embedded?: boolean;
  forcedStorecode?: string;
  hideStoreFilter?: boolean;
  hideWithdrawalLiveSection?: boolean;
  ordersQueryMode?: ClearanceOrdersQueryMode;
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

type PaginationItem = number | "start-ellipsis" | "end-ellipsis";

const EMPTY_STORES: StoreItem[] = [];
const EMPTY_ORDERS: ClearanceOrder[] = [];
const EMPTY_WITHDRAWALS: BankTransferDashboardEvent[] = [];
const EMPTY_CLEARANCE_DASHBOARD: ClearanceDashboardResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  stores: EMPTY_STORES,
  storeTotalCount: 0,
  storesError: "",
  withdrawalEvents: EMPTY_WITHDRAWALS,
  withdrawalNextCursor: null,
  ordersError: "",
  orders: EMPTY_ORDERS,
  totalCount: 0,
  totalClearanceCount: 0,
  totalClearanceAmount: 0,
  totalClearanceAmountKRW: 0,
};
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
const WITHDRAWAL_RESYNC_INTERVAL_MS = 10_000;
const WITHDRAWAL_RESYNC_LIMIT = 120;

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

const createBaseLoadSignature = (walletAddress?: string | null) => {
  return String(walletAddress || "").trim().toLowerCase() || "guest";
};

const createOrdersLoadSignature = (filters: FilterState, walletAddress?: string | null) => {
  return [
    String(walletAddress || "").trim().toLowerCase(),
    filters.storecode,
    String(filters.limit),
    String(filters.page),
    filters.fromDate,
    filters.toDate,
    filters.searchMyOrders ? "1" : "0",
  ].join("|");
};

const getBscscanTxUrl = (txHash: string) => {
  return `https://bscscan.com/tx/${txHash}`;
};

const buildPaginationItems = (
  currentPage: number,
  totalPages: number,
  maxVisiblePages = 7,
): PaginationItem[] => {
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.max(1, Math.min(currentPage, safeTotalPages));

  if (safeTotalPages <= maxVisiblePages) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1);
  }

  const visibleInnerPages = Math.max(1, maxVisiblePages - 2);
  let startPage = Math.max(2, safeCurrentPage - Math.floor((visibleInnerPages - 1) / 2));
  let endPage = Math.min(safeTotalPages - 1, startPage + visibleInnerPages - 1);

  startPage = Math.max(2, endPage - visibleInnerPages + 1);

  const items: PaginationItem[] = [1];

  if (startPage > 2) {
    items.push("start-ellipsis");
  }

  for (let page = startPage; page <= endPage; page += 1) {
    items.push(page);
  }

  if (endPage < safeTotalPages - 1) {
    items.push("end-ellipsis");
  }

  items.push(safeTotalPages);

  return items;
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

export default function ClearanceManagementConsoleClient({
  lang,
  embedded = false,
  forcedStorecode = "",
  hideStoreFilter = false,
  hideWithdrawalLiveSection = false,
  ordersQueryMode = "buyOrders",
}: ClearanceManagementConsoleClientProps) {
  const activeAccount = useActiveAccount();
  const normalizedForcedStorecode = normalizeText(forcedStorecode);
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [data, setData] = useState<ClearanceDashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [withdrawalRealtimeItems, setWithdrawalRealtimeItems] = useState<WithdrawalRealtimeItem[]>([]);
  const [connectionState, setConnectionState] = useState<Ably.ConnectionState>("initialized");
  const [connectionError, setConnectionError] = useState("");
  const [withdrawalSyncError, setWithdrawalSyncError] = useState("");
  const [withdrawalRealtimeNowMs, setWithdrawalRealtimeNowMs] = useState(() => Date.now());
  const [actionModalState, setActionModalState] = useState<ClearanceActionModalState | null>(null);
  const [actionModalSubmitting, setActionModalSubmitting] = useState(false);
  const [actionModalError, setActionModalError] = useState("");
  const [processingOrderId, setProcessingOrderId] = useState("");

  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const inflightOrdersLoadRef = useRef(false);
  const queuedSilentOrdersRefreshRef = useRef(false);
  const ordersRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBuyorderEventIdRef = useRef("");
  const lastWithdrawalEventIdRef = useRef("");
  const withdrawalRealtimeCursorRef = useRef<string | null>(null);
  const ablyClientIdRef = useRef(`console-clearance-${Math.random().toString(36).slice(2, 10)}`);
  const desiredBaseLoadSignatureRef = useRef("");
  const desiredOrdersLoadSignatureRef = useRef("");

  desiredBaseLoadSignatureRef.current = createBaseLoadSignature(activeAccount?.address);
  desiredOrdersLoadSignatureRef.current = createOrdersLoadSignature(filters, activeAccount?.address);

  const sortWithdrawalRealtimeItems = useCallback((items: WithdrawalRealtimeItem[]) => {
    return [...items]
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
  }, []);

  const replaceWithdrawalRealtimeItems = useCallback((
    events: BankTransferDashboardEvent[],
  ) => {
    setWithdrawalRealtimeItems(
      sortWithdrawalRealtimeItems(
        events.map((event) => ({
          id: String(event.eventId || event.traceId || Math.random().toString(36).slice(2)),
          data: event,
          receivedAt: new Date().toISOString(),
          highlightUntil: 0,
        })),
      ),
    );
  }, [sortWithdrawalRealtimeItems]);

  const upsertWithdrawalRealtimeEvents = useCallback((
    incomingEvents: BankTransferDashboardEvent[],
    options?: { highlightNew?: boolean },
  ) => {
    if (incomingEvents.length === 0) {
      return;
    }

    const now = Date.now();
    const highlightNew = options?.highlightNew ?? true;

    setWithdrawalRealtimeItems((current) => {
      const nextMap = new Map(current.map((item) => [item.id, item]));

      for (const event of incomingEvents) {
        const nextId =
          String(event.eventId || "").trim()
          || `${event.traceId || "withdraw"}-${event.publishedAt || Date.now()}`;
        const existing = nextMap.get(nextId);

        if (existing) {
          nextMap.set(nextId, {
            ...existing,
            data: event,
          });
          continue;
        }

        nextMap.set(nextId, {
          id: nextId,
          data: event,
          receivedAt: new Date().toISOString(),
          highlightUntil: highlightNew ? now + WITHDRAWAL_HIGHLIGHT_MS : 0,
        });
      }

      return sortWithdrawalRealtimeItems(Array.from(nextMap.values()));
    });
  }, [sortWithdrawalRealtimeItems]);

  const syncWithdrawalRealtimeEvents = useCallback(
    async (options?: { sinceCursor?: string | null; highlightNew?: boolean }) => {
      const params = new URLSearchParams({
        limit: String(WITHDRAWAL_RESYNC_LIMIT),
      });

      const nextCursor = options?.sinceCursor ?? withdrawalRealtimeCursorRef.current;
      if (nextCursor) {
        params.set("since", nextCursor);
      }

      try {
        const response = await fetch(`/api/bff/realtime/banktransfer-events?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json().catch(() => ({}));
        const incomingEvents = Array.isArray(payload?.events)
          ? (payload.events as BankTransferDashboardEvent[]).filter((event) => {
            return normalizeBankTransferTransactionType(event?.transactionType) === "withdrawn";
          })
          : [];

        upsertWithdrawalRealtimeEvents(incomingEvents, {
          highlightNew: options?.highlightNew ?? Boolean(nextCursor),
        });

        if (typeof payload?.nextCursor === "string" && payload.nextCursor) {
          withdrawalRealtimeCursorRef.current = payload.nextCursor;
        }

        setWithdrawalSyncError("");
      } catch (error) {
        setWithdrawalSyncError(
          error instanceof Error ? error.message : "withdrawal realtime sync failed",
        );
      }
    },
    [upsertWithdrawalRealtimeEvents],
  );

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      const loadSignature = createBaseLoadSignature(activeAccount?.address);

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

        if (activeAccount) {
          try {
            signedStoreBody = await createCenterStoreAdminSignedBody({
              account: activeAccount,
              route: "/api/store/getAllStores",
              storecode: "admin",
              requesterWalletAddress: activeAccount.address,
              body: {
                limit: 300,
                page: 1,
                sortBy: "storeNameDesc",
              },
            });
          } catch {
            signedStoreBody = null;
          }
        }

        const response = await fetch("/api/bff/admin/clearance-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            storesLimit: 300,
            storesPage: 1,
            withdrawalLimit: 24,
            signedStoreBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load clearance dashboard");
        }

        if (desiredBaseLoadSignatureRef.current !== loadSignature) {
          if (silent) {
            queuedSilentRefreshRef.current = true;
          }
          return;
        }

        const result = payload.result as ClearanceBaseResult;
        setData((current) => ({
          ...(current || EMPTY_CLEARANCE_DASHBOARD),
          fetchedAt: result?.fetchedAt || "",
          remoteBackendBaseUrl: result?.remoteBackendBaseUrl || "",
          stores: Array.isArray(result?.stores) ? result.stores : EMPTY_STORES,
          storeTotalCount: Number(result?.storeTotalCount || 0),
          storesError: normalizeText(result?.storesError),
          withdrawalEvents: Array.isArray(result?.withdrawalEvents) ? result.withdrawalEvents : EMPTY_WITHDRAWALS,
          withdrawalNextCursor: typeof result?.withdrawalNextCursor === "string" ? result.withdrawalNextCursor : null,
        }));
        withdrawalRealtimeCursorRef.current =
          typeof result?.withdrawalNextCursor === "string" && result.withdrawalNextCursor
            ? result.withdrawalNextCursor
            : withdrawalRealtimeCursorRef.current;
        replaceWithdrawalRealtimeItems(
          Array.isArray(result?.withdrawalEvents) ? result.withdrawalEvents : EMPTY_WITHDRAWALS,
        );
        setWithdrawalSyncError("");
        setError("");
      } catch (loadError) {
        if (desiredBaseLoadSignatureRef.current === loadSignature) {
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
    [activeAccount, replaceWithdrawalRealtimeItems],
  );

  const loadOrdersDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);
      const loadSignature = createOrdersLoadSignature(filters, activeAccount?.address);

      if (inflightOrdersLoadRef.current) {
        if (silent) {
          queuedSilentOrdersRefreshRef.current = true;
        }
        return;
      }

      inflightOrdersLoadRef.current = true;
      if (silent) {
        setOrdersRefreshing(true);
      } else {
        setOrdersLoading(true);
      }

      try {
        if (!activeAccount) {
          if (desiredOrdersLoadSignatureRef.current !== loadSignature) {
            if (silent) {
              queuedSilentOrdersRefreshRef.current = true;
            }
            return;
          }

          setData((current) => ({
            ...(current || EMPTY_CLEARANCE_DASHBOARD),
            ordersError: "",
            orders: EMPTY_ORDERS,
            totalCount: 0,
            totalClearanceCount: 0,
            totalClearanceAmount: 0,
            totalClearanceAmountKRW: 0,
          }));
          setError("");
          return;
        }

        let signedOrdersBody: Record<string, unknown> | null = null;
        let nextOrdersError = "";
        const ordersRoute = ordersQueryMode === "collectOrdersForSeller"
          ? "/api/order/getAllCollectOrdersForSeller"
          : "/api/order/getAllBuyOrders";
        const signingStorecode = ordersQueryMode === "collectOrdersForSeller"
          ? filters.storecode
          : "admin";

        try {
          signedOrdersBody = await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route: ordersRoute,
            storecode: signingStorecode,
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
          nextOrdersError = signError instanceof Error
            ? signError.message
            : "주문 조회 서명을 준비하지 못했습니다.";
        }

        if (!signedOrdersBody) {
          if (desiredOrdersLoadSignatureRef.current !== loadSignature) {
            if (silent) {
              queuedSilentOrdersRefreshRef.current = true;
            }
            return;
          }

          setData((current) => ({
            ...(current || EMPTY_CLEARANCE_DASHBOARD),
            ordersError: nextOrdersError,
            orders: EMPTY_ORDERS,
            totalCount: 0,
            totalClearanceCount: 0,
            totalClearanceAmount: 0,
            totalClearanceAmountKRW: 0,
          }));
          setError("");
          return;
        }

        const response = await fetch("/api/bff/admin/clearance-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            signedOrdersBody,
            ordersQueryMode,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load clearance orders");
        }

        if (desiredOrdersLoadSignatureRef.current !== loadSignature) {
          if (silent) {
            queuedSilentOrdersRefreshRef.current = true;
          }
          return;
        }

        const result = payload.result as ClearanceOrdersResult;
        const mergedOrdersError = nextOrdersError || normalizeText(result?.ordersError);

        setData((current) => ({
          ...(current || EMPTY_CLEARANCE_DASHBOARD),
          ordersError: mergedOrdersError,
          orders: Array.isArray(result?.orders) ? result.orders : EMPTY_ORDERS,
          totalCount: Number(result?.totalCount || 0),
          totalClearanceCount: Number(result?.totalClearanceCount || 0),
          totalClearanceAmount: Number(result?.totalClearanceAmount || 0),
          totalClearanceAmountKRW: Number(result?.totalClearanceAmountKRW || 0),
        }));
        setError("");
      } catch (loadError) {
        if (desiredOrdersLoadSignatureRef.current === loadSignature) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load clearance orders");
        }
      } finally {
        inflightOrdersLoadRef.current = false;
        setOrdersLoading(false);
        setOrdersRefreshing(false);
        if (queuedSilentOrdersRefreshRef.current) {
          queuedSilentOrdersRefreshRef.current = false;
          queueMicrotask(() => {
            void loadOrdersDashboard({ silent: true });
          });
        }
      }
    },
    [activeAccount, filters, ordersQueryMode],
  );

  const requestRealtimeRefresh = useCallback(() => {
    if (ordersRefreshTimerRef.current) {
      clearTimeout(ordersRefreshTimerRef.current);
    }

    ordersRefreshTimerRef.current = setTimeout(() => {
      ordersRefreshTimerRef.current = null;
      void loadOrdersDashboard({ silent: true });
    }, 350);
  }, [loadOrdersDashboard]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadOrdersDashboard();
  }, [loadOrdersDashboard]);

  useEffect(() => {
    if (!hideStoreFilter && !normalizedForcedStorecode) {
      return;
    }

    setFilters((prev) => {
      if (prev.storecode === normalizedForcedStorecode) {
        return prev;
      }

      return {
        ...prev,
        storecode: normalizedForcedStorecode,
        page: 1,
      };
    });
  }, [hideStoreFilter, normalizedForcedStorecode]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadDashboard({ silent: true });
    }, 60000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    const interval = setInterval(() => {
      void loadOrdersDashboard({ silent: true });
    }, 60000);

    return () => clearInterval(interval);
  }, [loadOrdersDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWithdrawalRealtimeNowMs(Date.now());
    }, WITHDRAWAL_CLOCK_TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const realtime = new Ably.Realtime({
      authUrl: `/api/bff/realtime/ably-token?stream=ops-admin&clientId=${ablyClientIdRef.current}`,
    });
    const buyorderChannel = realtime.channels.get(BUYORDER_STATUS_ABLY_CHANNEL);
    const banktransferChannel = realtime.channels.get(BANKTRANSFER_ABLY_CHANNEL);
    const syncInterval = window.setInterval(() => {
      void syncWithdrawalRealtimeEvents();
    }, WITHDRAWAL_RESYNC_INTERVAL_MS);

    const onConnectionStateChange = (stateChange: Ably.ConnectionStateChange) => {
      setConnectionState(stateChange.current);
      if (stateChange.reason) {
        setConnectionError(stateChange.reason.message || "Ably connection error");
      } else if (stateChange.current === "connected") {
        setConnectionError("");
        void syncWithdrawalRealtimeEvents();
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
      ) {
        return;
      }

      upsertWithdrawalRealtimeEvents([event], { highlightNew: true });

      requestRealtimeRefresh();
    };

    realtime.connection.on(onConnectionStateChange);
    void buyorderChannel.subscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onBuyorderMessage);
    void banktransferChannel.subscribe(BANKTRANSFER_ABLY_EVENT_NAME, onBanktransferMessage);
    void syncWithdrawalRealtimeEvents({ sinceCursor: null, highlightNew: false });

    return () => {
      if (ordersRefreshTimerRef.current) {
        clearTimeout(ordersRefreshTimerRef.current);
      }
      window.clearInterval(syncInterval);
      buyorderChannel.unsubscribe(BUYORDER_STATUS_ABLY_EVENT_NAME, onBuyorderMessage);
      banktransferChannel.unsubscribe(BANKTRANSFER_ABLY_EVENT_NAME, onBanktransferMessage);
      realtime.connection.off(onConnectionStateChange);
      realtime.close();
    };
  }, [requestRealtimeRefresh, syncWithdrawalRealtimeEvents, upsertWithdrawalRealtimeEvents]);

  const stores = data?.stores || EMPTY_STORES;
  const storesError = normalizeText(data?.storesError);
  const ordersError = normalizeText(data?.ordersError);
  const orders = data?.orders || EMPTY_ORDERS;
  const selectedStoreSummary = useMemo(() => {
    if (!filters.storecode) {
      return null;
    }

    return (
      stores.find((store) => String(store.storecode || "").trim() === filters.storecode)
      || null
    );
  }, [filters.storecode, stores]);
  const storeCoverageLabel = filters.storecode
    ? getStoreDisplayName(selectedStoreSummary) || filters.storecode
    : "전체 가맹점";
  const storeCoverageCaption = filters.storecode
    ? `${filters.storecode} 기준 청산 주문 / 출금 webhook 흐름`
    : `${NUMBER_FORMATTER.format(data?.storeTotalCount || 0)}개 등록 가맹점`;
  const filteredWithdrawalRealtimeItems = useMemo(() => {
    if (!filters.storecode) {
      return withdrawalRealtimeItems;
    }

    return withdrawalRealtimeItems.filter((item) => {
      return String(item.data.storecode || "").trim() === filters.storecode;
    });
  }, [filters.storecode, withdrawalRealtimeItems]);
  const withdrawalRealtimeEventCount = filteredWithdrawalRealtimeItems.length;
  const withdrawalRealtimeAmountTotal = filteredWithdrawalRealtimeItems.reduce((sum, item) => {
    return sum + Number(item.data.amount || 0);
  }, 0);
  const latestWithdrawalRealtimeAt =
    filteredWithdrawalRealtimeItems[0]?.data.processingDate
    || filteredWithdrawalRealtimeItems[0]?.data.transactionDate
    || filteredWithdrawalRealtimeItems[0]?.data.publishedAt
    || filteredWithdrawalRealtimeItems[0]?.receivedAt
    || null;
  const connectionIndicatorClassName =
    connectionState === "connected"
      ? "bg-emerald-500"
      : connectionState === "connecting" || connectionState === "initialized"
        ? "bg-amber-400"
        : "bg-rose-500";
  const shellClassName = embedded
    ? "w-full"
    : "console-shell px-4 py-6 sm:px-6 lg:px-8";
  const shellInnerClassName = embedded
    ? "flex w-full flex-col gap-5"
    : "mx-auto flex w-full max-w-[1480px] flex-col gap-5";
  const filterGridClassName = hideStoreFilter ? "lg:grid-cols-3" : "lg:grid-cols-4";

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
      void loadOrdersDashboard({ silent: true });
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
    loadOrdersDashboard,
    patchOrderInDashboard,
  ]);

  const currentOrderPage = Math.max(1, filters.page);
  const totalOrderCount = Number(data?.totalCount || 0);
  const totalOrderPages = Math.max(1, Math.ceil(totalOrderCount / Math.max(1, filters.limit)));
  const currentOrderRangeStart = totalOrderCount === 0 ? 0 : (currentOrderPage - 1) * filters.limit + 1;
  const currentOrderRangeEnd = totalOrderCount === 0 ? 0 : Math.min(totalOrderCount, currentOrderPage * filters.limit);
  const orderPaginationItems = useMemo(
    () => buildPaginationItems(currentOrderPage, totalOrderPages),
    [currentOrderPage, totalOrderPages],
  );
  const canGoToPreviousOrderPage = currentOrderPage > 1;
  const canGoToNextOrderPage = currentOrderPage < totalOrderPages;
  const isOrderPaginationBusy = ordersLoading || ordersRefreshing;
  const updateOrderPage = useCallback((nextPage: number) => {
    const clampedPage = Math.max(1, Math.min(nextPage, totalOrderPages));
    setFilters((prev) => {
      if (prev.page === clampedPage) {
        return prev;
      }

      return {
        ...prev,
        page: clampedPage,
      };
    });
  }, [totalOrderPages]);
  const showOrdersLoadingState = ordersLoading && totalOrderCount === 0 && orders.length === 0 && !ordersError;
  const usesCollectOrdersSummary = ordersQueryMode === "collectOrdersForSeller";
  const actionModalBuyerBankSummary = actionModalState ? getBuyerBankSummary(actionModalState.order) : null;
  const actionModalSellerBankSummary = actionModalState ? getSellerBankSummary(actionModalState.order) : null;
  const actionModalWithdrawalStatusMeta = actionModalState
    ? getWithdrawalStatusMeta(actionModalState.order)
    : null;
  const actionModalProcessingModeMeta = actionModalState
    ? getWithdrawalProcessingModeMeta(actionModalState.order)
    : null;

  useEffect(() => {
    if (filters.page <= totalOrderPages) {
      return;
    }

    setFilters((prev) => {
      if (prev.page <= totalOrderPages) {
        return prev;
      }

      return {
        ...prev,
        page: totalOrderPages,
      };
    });
  }, [filters.page, totalOrderPages]);

  return (
    <div className={shellClassName}>
      <div className={shellInnerClassName}>
        {!embedded ? (
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
                  청산 주문 목록과 출금 webhook 흐름을 한 화면에서 확인합니다. 현재 선택한 가맹점
                  범위 기준으로 동작하며 주문 목록은 `buyorder.status.changed`, 출금 live는
                  `banktransfer.updated`를 구독합니다.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="console-dark-card rounded-[24px] p-4">
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Coverage
                  </div>
                  <div className="mt-2 text-lg font-semibold text-white">{storeCoverageLabel}</div>
                  <div className="mt-1 text-xs text-slate-400">{storeCoverageCaption}</div>
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
                    연결 전에는 live와 가맹점 메타만 보고, 주문 목록은 서명 후 조회됩니다.
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
        ) : null}

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
            {hideStoreFilter ? (
              <div className="mb-3 text-xs text-slate-400">
                현재 범위: {storeCoverageLabel}
              </div>
            ) : null}
            <div className={`grid gap-3 ${filterGridClassName}`}>
              {!hideStoreFilter ? (
              <label className="space-y-2 text-sm">
                <span className="font-medium text-slate-200">가맹점</span>
                <select
                  value={filters.storecode}
                  onChange={(event) => {
                    setFilters((prev) => ({
                      ...prev,
                      storecode: event.target.value,
                      page: 1,
                    }));
                  }}
                  className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                >
                  <option value="">전체 가맹점</option>
                  {stores.map((store) => {
                    const storecode = String(store.storecode || "").trim();
                    if (!storecode) {
                      return null;
                    }

                    return (
                      <option key={storecode} value={storecode}>
                        {getStoreDisplayName(store) || storecode}
                      </option>
                    );
                  })}
                </select>
              </label>
              ) : null}

              <label className="space-y-2 text-sm">
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

              <div className="space-y-2 text-sm">
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

              <div className="space-y-2 text-sm">
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
            <div className={`mt-3 text-xs ${storesError ? "text-rose-300" : "text-slate-400"}`}>
              {storesError
                ? `가맹점 메타 동기화 실패: ${storesError}`
                : "가맹점 메타는 로고와 계좌 매칭 보강에 사용됩니다."}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "전체 주문",
              value: showOrdersLoadingState ? "..." : NUMBER_FORMATTER.format(data?.totalCount || 0),
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "현재 필터 기준 전체 청산 주문 수"
                  : "현재 필터 기준 청산 주문 수",
            },
            {
              label: usesCollectOrdersSummary ? "청산주문" : "출금완료",
              value: showOrdersLoadingState ? "..." : NUMBER_FORMATTER.format(data?.totalClearanceCount || 0),
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "paymentRequested + paymentConfirmed 기준"
                  : "paymentConfirmed 기준 완료 건수",
            },
            {
              label: "청산량",
              value: showOrdersLoadingState ? "..." : `${formatUsdtValue(data?.totalClearanceAmount || 0)} USDT`,
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "청산 대상 물량"
                  : "완료된 청산 물량",
            },
            {
              label: "청산금액",
              value: showOrdersLoadingState ? "..." : `${formatKrwValue(data?.totalClearanceAmountKRW || 0)} KRW`,
              caption: showOrdersLoadingState
                ? "주문 집계 불러오는 중"
                : usesCollectOrdersSummary
                  ? "청산 대상 금액"
                  : "완료된 청산 금액",
            },
          ].map((item) => (
            <article key={item.label} className="console-panel rounded-[28px] p-5">
              <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {item.label}
              </div>
              <div className="console-display mt-3 text-right text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                {item.value}
              </div>
              <div className="mt-2 text-sm text-slate-600">{item.caption}</div>
            </article>
          ))}
        </section>

        {!hideWithdrawalLiveSection ? (
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
                    범위 {storeCoverageLabel}
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

            {connectionError || withdrawalSyncError ? (
              <div className="mt-4 space-y-2">
                {connectionError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    연결 오류: {connectionError}
                  </div>
                ) : null}
                {withdrawalSyncError ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    동기화 오류: {withdrawalSyncError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="px-6 py-5">
            {withdrawalRealtimeEventCount === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                아직 표시할 통장출금 webhook 이벤트가 없습니다.
              </div>
            ) : (
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-full items-start gap-3">
                  {filteredWithdrawalRealtimeItems.map((item) => {
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
                        className={`flex h-fit w-[322px] min-w-[322px] shrink-0 self-start flex-col rounded-[26px] border px-4 py-3.5 transition-all ${
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

                        <div className="mt-3 grid grid-cols-2 items-start gap-2">
                          <div className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                송금인
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
                              {isConfiguredAccountMatched && isConfiguredHolderMatched ? (
                                <span
                                  className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                                >
                                  예금주 일치
                                </span>
                              ) : null}
                            </div>

                            {isConfiguredAccountMatched ? (
                              <div className="mt-1.5 space-y-0.5 min-w-0">
                                <div className="truncate text-xs font-semibold text-slate-900">
                                  {normalizeText(configuredFromBankInfo?.bankName) || "-"}
                                </div>
                                <div className="truncate text-[11px] text-slate-600">
                                  {(normalizeText(configuredFromBankInfo?.accountHolder) || "-")
                                    + " · "
                                    + (normalizeAccountNumber(
                                      configuredFromBankInfo?.realAccountNumber || configuredFromBankInfo?.accountNumber,
                                    ) || "-")}
                                </div>
                              </div>
                            ) : null}

                          </div>

                          <div className="min-w-0 self-start rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">수취인</div>
                            <div className="mt-1 truncate text-xs font-semibold text-slate-900">{receiverBankName}</div>
                            <div className="mt-0.5 truncate text-[11px] text-slate-600">
                              {receiverAccountHolder} · {receiverAccountNumber}
                            </div>
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
        ) : null}

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  Clearance stream
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                {ordersLoading || ordersRefreshing ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                    {ordersLoading ? "주문 로딩중" : "주문 새로고침중"}
                  </span>
                ) : null}
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Rows {NUMBER_FORMATTER.format(currentOrderRangeStart)}-{NUMBER_FORMATTER.format(currentOrderRangeEnd)} / {NUMBER_FORMATTER.format(totalOrderCount)}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1">
                  Page {NUMBER_FORMATTER.format(currentOrderPage)} / {NUMBER_FORMATTER.format(totalOrderPages)}
                </span>
              </div>
            </div>
          </div>

          {error || ordersError ? (
            <div className="px-6 py-3">
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error || ordersError}
              </div>
            </div>
          ) : null}

          <div className="px-2 pb-2">
            <table className="w-full table-fixed border-separate border-spacing-0">
              <thead>
                <tr className="console-mono text-left text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  <th className="w-[21%] border-b border-slate-200 px-3 py-2.5">Trade / Created</th>
                  <th className="w-[10%] border-b border-slate-200 px-3 py-2.5">Status</th>
                  <th className="w-[15%] border-b border-slate-200 px-3 py-2.5">Buyer</th>
                  <th className="w-[16%] border-b border-slate-200 px-3 py-2.5">Seller / 입금계좌</th>
                  <th className="w-[12%] border-b border-slate-200 px-3 py-2.5 text-right">Amount</th>
                  <th className="w-[14%] border-b border-slate-200 px-3 py-2.5">출금상태</th>
                  <th className="w-[12%] border-b border-slate-200 px-3 py-2.5">USDT 전송</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      {!activeAccount
                        ? "관리자 지갑 연결 후 Clearance stream 을 조회할 수 있습니다."
                        : ordersLoading
                          ? "Loading clearance orders..."
                          : "No clearance orders returned for the current filter."}
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
                        <td className="border-b border-slate-100 px-3 py-3 align-top">
                          <div className="flex items-start gap-2.5">
                            <img
                              src={getStoreLogoSrc(order.store)}
                              alt={getStoreDisplayName(order.store) || order.storecode || "Store"}
                              className="h-9 w-9 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
                            />
                            <div className="min-w-0 break-words">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="min-w-0 break-words font-semibold text-slate-950">
                                  {getStoreDisplayName(order.store) || order.storecode || "-"}
                                </div>
                                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${creationMeta.className}`}>
                                  {creationMeta.label}
                                </span>
                              </div>
                              <div className="mt-1 break-all font-semibold text-slate-900">
                                {order.tradeId || "-"}
                              </div>
                              <div className="mt-0.5 break-words text-[11px] text-slate-500">
                                {createdAtLabel === "-" ? "-" : `${createdAtLabel} · ${createdTimeAgoLabel}`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 align-top">
                          <div className="space-y-1.5 break-words">
                            <div className="break-words font-medium text-slate-950">{buyerLabel}</div>
                            <div className="break-words text-[13px] font-bold leading-snug text-slate-950">
                              {buyerBankSummary.primary}
                            </div>
                            <div className="break-all text-[13px] font-semibold leading-snug text-slate-800">
                              {buyerBankSummary.secondary}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 align-top">
                          <div className="space-y-1.5 break-words">
                            <div className="break-words font-medium text-slate-950">
                              {order.seller?.nickname || shortAddress(order.seller?.walletAddress || order.seller?.signerAddress)}
                            </div>
                            <div className="break-words text-[13px] font-bold leading-snug text-slate-950">
                              {sellerBankSummary.primary}
                            </div>
                            <div className="break-all text-[13px] font-semibold leading-snug text-slate-800">
                              {sellerBankSummary.secondary}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 text-right align-top">
                          <div className="text-base font-semibold tracking-[-0.03em] text-slate-950">
                            {formatKrwValue(order.krwAmount)} KRW
                          </div>
                          <div className="mt-0.5 text-[11px] font-semibold text-emerald-600">
                            {formatUsdtValue(order.usdtAmount)} USDT
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-3 align-top">
                          <div className="flex min-w-0 flex-col items-start gap-1.5 break-words">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${withdrawalStatusMeta.className}`}>
                              {withdrawalStatusMeta.label}
                            </span>
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${processingModeMeta.className}`}>
                              {processingModeMeta.label}
                            </span>

                            {isWithdrawalCompleted ? (
                              <div className="space-y-0.5 text-[11px] text-slate-500">
                                {processingModeMeta.isManual && depositCompletedActorLabel && depositCompletedActorLabel !== "-" ? (
                                  <div>처리자 {depositCompletedActorLabel}</div>
                                ) : null}
                                {order.buyer?.depositCompletedAt ? (
                                  <div>{formatAdminActionDateTime(order.buyer.depositCompletedAt)}</div>
                                ) : null}
                              </div>
                            ) : isCancelled ? (
                              <div className="break-words text-[11px] text-slate-500">
                                취소된 주문으로 출금이 완료되지 않았습니다.
                              </div>
                            ) : (
                              <div className="flex w-full flex-col gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openActionModal("complete", order)}
                                  disabled={isProcessingThisOrder || actionModalSubmitting}
                                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition ${
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
                                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold text-white transition ${
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
                        <td className="border-b border-slate-100 px-3 py-3 align-top">
                          {transactionHash && transactionHash !== "0x" ? (
                            <div className="min-w-0 break-words">
                              <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                전송완료
                              </div>
                              <a
                                href={getBscscanTxUrl(transactionHash)}
                                target="_blank"
                                rel="noreferrer"
                                className="console-mono mt-1 inline-flex break-all text-[11px] text-slate-500 underline decoration-dotted underline-offset-2 transition hover:text-sky-700"
                              >
                                {shortAddress(transactionHash)}
                              </a>
                              <div className="mt-0.5 break-words text-[11px] text-slate-500">
                                {formatDateTime(order.paymentConfirmedAt || order.updatedAt)}
                              </div>
                            </div>
                          ) : (
                            <div className="min-w-0 break-words">
                              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                전송대기
                              </div>
                              <div className="mt-1 break-words text-[11px] text-slate-500">
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

          {totalOrderCount > 0 ? (
            <div className="border-t border-slate-200/80 px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs text-slate-500">
                  Rows {NUMBER_FORMATTER.format(currentOrderRangeStart)}-{NUMBER_FORMATTER.format(currentOrderRangeEnd)}
                  {" / "}
                  {NUMBER_FORMATTER.format(totalOrderCount)}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateOrderPage(1)}
                    disabled={!canGoToPreviousOrderPage || isOrderPaginationBusy}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    처음
                  </button>
                  <button
                    type="button"
                    onClick={() => updateOrderPage(currentOrderPage - 1)}
                    disabled={!canGoToPreviousOrderPage || isOrderPaginationBusy}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    이전
                  </button>

                  {orderPaginationItems.map((item, index) => {
                    if (typeof item !== "number") {
                      return (
                        <span
                          key={`${item}-${index}`}
                          className="px-1 text-xs font-medium text-slate-400"
                        >
                          ...
                        </span>
                      );
                    }

                    const isActive = item === currentOrderPage;

                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => updateOrderPage(item)}
                        disabled={isActive || isOrderPaginationBusy}
                        className={`min-w-[34px] rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          isActive
                            ? "border border-sky-200 bg-sky-50 text-sky-700"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {NUMBER_FORMATTER.format(item)}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => updateOrderPage(currentOrderPage + 1)}
                    disabled={!canGoToNextOrderPage || isOrderPaginationBusy}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    다음
                  </button>
                  <button
                    type="button"
                    onClick={() => updateOrderPage(totalOrderPages)}
                    disabled={!canGoToNextOrderPage || isOrderPaginationBusy}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    마지막
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
