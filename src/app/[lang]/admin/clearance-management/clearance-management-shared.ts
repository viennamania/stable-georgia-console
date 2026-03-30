import type { BankTransferDashboardEvent } from "@/lib/realtime/banktransfer";

export type BankInfo = {
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  realAccountNumber?: string;
};

export type ClearanceActor = {
  walletAddress?: string | null;
  nickname?: string | null;
  role?: string | null;
  storecode?: string | null;
};

export type ClearanceOrderSourceMeta = {
  route?: string | null;
  source?: string | null;
  transactionHashDummyReason?: string | null;
};

export type StoreItem = {
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

export type ClearanceOrder = {
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

export type ClearanceBaseResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  stores: StoreItem[];
  storeTotalCount: number;
  storesError?: string;
  selectedStore?: StoreItem | null;
  withdrawalEvents: BankTransferDashboardEvent[];
  withdrawalNextCursor: string | null;
};

export type ClearanceOrdersResult = {
  ordersAccessLevel?: string;
  ordersError?: string;
  orders: ClearanceOrder[];
  totalCount: number;
  totalClearanceCount: number;
  totalClearanceAmount: number;
  totalClearanceAmountKRW: number;
};

export type ClearanceDashboardResult = ClearanceBaseResult & ClearanceOrdersResult;

export type ClearanceOrdersQueryMode = "buyOrders" | "collectOrdersForSeller";

export type FilterState = {
  storecode: string;
  limit: number;
  page: number;
  fromDate: string;
  toDate: string;
  searchMyOrders: boolean;
};

export type ClearanceManagementConsoleClientProps = {
  lang: string;
  embedded?: boolean;
  forcedStorecode?: string;
  hideStoreFilter?: boolean;
  hideWithdrawalLiveSection?: boolean;
  ordersQueryMode?: ClearanceOrdersQueryMode;
  allowOrderActions?: boolean;
};

export type WithdrawalRealtimeItem = {
  id: string;
  data: BankTransferDashboardEvent;
  receivedAt: string;
  highlightUntil: number;
  sortOrder: number;
};

export type ClearanceActionMode = "complete" | "cancel";

export type ClearanceActionModalState = {
  mode: ClearanceActionMode;
  order: ClearanceOrder;
};

export type PaginationItem = number | "start-ellipsis" | "end-ellipsis";

export const EMPTY_STORES: StoreItem[] = [];
export const EMPTY_ORDERS: ClearanceOrder[] = [];
export const EMPTY_WITHDRAWALS: BankTransferDashboardEvent[] = [];
export const EMPTY_CLEARANCE_DASHBOARD: ClearanceDashboardResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  stores: EMPTY_STORES,
  storeTotalCount: 0,
  storesError: "",
  selectedStore: null,
  withdrawalEvents: EMPTY_WITHDRAWALS,
  withdrawalNextCursor: null,
  ordersAccessLevel: "public",
  ordersError: "",
  orders: EMPTY_ORDERS,
  totalCount: 0,
  totalClearanceCount: 0,
  totalClearanceAmount: 0,
  totalClearanceAmountKRW: 0,
};

export const BUY_ORDER_DEPOSIT_COMPLETED_SIGNING_PREFIX = "admin-buyorder-deposit-completed-v1";
export const CANCEL_CLEARANCE_ORDER_SIGNING_PREFIX = "admin-cancel-clearance-order-v1";
export const WITHDRAWAL_WEBHOOK_CLEARANCE_CREATED_BY_ROUTE =
  "/api/order/createClearanceOrderFromWithdrawalWebhook";
export const WITHDRAWAL_WEBHOOK_CLEARANCE_SOURCE = "banktransfer_withdrawn_webhook";

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

export const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const USDT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const WITHDRAWAL_HIGHLIGHT_MS = 4500;
export const WITHDRAWAL_CLOCK_TICK_MS = 5000;
export const WITHDRAWAL_RESYNC_INTERVAL_MS = 10_000;
export const WITHDRAWAL_RESYNC_LIMIT = 120;

export const createInputDate = (daysOffset = 0) => {
  const kstDate = new Date(Date.now() + KST_OFFSET_MS);
  kstDate.setUTCDate(kstDate.getUTCDate() + daysOffset);
  return kstDate.toISOString().slice(0, 10);
};

export const createDefaultFilters = (storecode = ""): FilterState => ({
  storecode,
  limit: 30,
  page: 1,
  fromDate: createInputDate(0),
  toDate: createInputDate(0),
  searchMyOrders: false,
});

export const createBaseLoadSignature = (
  walletAddress?: string | null,
  storecode?: string | null,
) => {
  return [
    String(walletAddress || "").trim().toLowerCase() || "guest",
    String(storecode || "").trim().toLowerCase() || "*",
  ].join("|");
};

export const createOrdersLoadSignature = (
  filters: FilterState,
  walletAddress?: string | null,
) => {
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

export const getBscscanTxUrl = (txHash: string) => {
  return `https://bscscan.com/tx/${txHash}`;
};

export const buildPaginationItems = (
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

export const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

export const normalizeBankTransferTransactionType = (value: unknown) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "withdrawn" || normalized === "withdrawal" || normalized === "출금") {
    return "withdrawn";
  }
  if (normalized === "deposited" || normalized === "deposit" || normalized === "입금") {
    return "deposited";
  }
  return normalized;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return DATE_FORMATTER.format(parsed);
};

export const formatAdminActionDateTime = (value?: string | null) => {
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

const toCursorTimestamp = (cursor?: string | null) => {
  const normalized = String(cursor || "").trim();
  if (!/^[a-fA-F0-9]{24}$/.test(normalized)) {
    return 0;
  }

  const seconds = Number.parseInt(normalized.slice(0, 8), 16);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }

  return seconds * 1000;
};

export const getWithdrawalRealtimePrimaryTimestamp = (
  event: {
    cursor?: string | null;
    publishedAt?: string | null;
    processingDate?: string | null;
    transactionDate?: string | null;
  },
  receivedAt?: string | null,
) => {
  return Math.max(
    toCursorTimestamp(event.cursor),
    toSafeTimestamp(event.publishedAt),
    toSafeTimestamp(receivedAt),
    toSafeTimestamp(event.processingDate),
    toSafeTimestamp(event.transactionDate),
  );
};

export const getWithdrawalRealtimePrimaryDateTime = (
  event: {
    cursor?: string | null;
    publishedAt?: string | null;
    processingDate?: string | null;
    transactionDate?: string | null;
  },
  receivedAt?: string | null,
) => {
  return (
    event.publishedAt
    || receivedAt
    || event.processingDate
    || event.transactionDate
    || null
  );
};

export const formatRealtimeDateTime = (value?: string | null) => {
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

export const formatRealtimeRelative = (value: string | null | undefined, nowMs: number) => {
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

export const formatTimeAgo = (value?: string | null) => {
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

export const formatKrwValue = (value?: number | string | null) => {
  return NUMBER_FORMATTER.format(Number(value || 0));
};

export const formatUsdtValue = (value?: number | string | null) => {
  return USDT_FORMATTER.format(Number(value || 0));
};

export const shortAddress = (value?: string | null) => {
  const safe = String(value || "").trim();
  if (!safe) {
    return "-";
  }
  if (safe.length <= 12) {
    return safe;
  }
  return `${safe.slice(0, 6)}...${safe.slice(-4)}`;
};

export const normalizeAccountNumber = (value?: string | null) =>
  String(value || "").replace(/[\s-]/g, "");

export const getStoreDisplayName = (store?: StoreItem | null) => {
  return String(store?.storeName || store?.companyName || store?.storecode || "").trim();
};

export const getStoreLogoSrc = (store?: StoreItem | null) => {
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

export const getStoreConfiguredBankInfoByAccountNumber = (
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

export const getBuyerDisplayName = (order: ClearanceOrder) => {
  return String(order.buyer?.depositName || order.buyer?.nickname || order.nickname || "").trim() || "-";
};

const getBuyerBankInfo = (order: ClearanceOrder) => {
  return order.buyer?.bankInfo || null;
};

export const getBuyerBankSummary = (order: ClearanceOrder) => {
  const bankInfo = getBuyerBankInfo(order);
  if (!bankInfo && !order.buyer?.depositBankName && !order.buyer?.depositBankAccountNumber) {
    return {
      primary: "계좌정보 없음",
      secondary: shortAddress(order.buyer?.walletAddress || order.walletAddress),
    };
  }

  const accountNumber =
    order.buyer?.depositBankAccountNumber || bankInfo?.realAccountNumber || bankInfo?.accountNumber || "";
  const bankName = order.buyer?.depositBankName || bankInfo?.bankName || "";
  const accountHolder = order.buyer?.depositName || bankInfo?.accountHolder || "";

  return {
    primary: [bankName, accountHolder].filter(Boolean).join(" / ") || "계좌정보 없음",
    secondary: normalizeAccountNumber(accountNumber) || shortAddress(order.buyer?.walletAddress || order.walletAddress),
  };
};

export const getSellerBankSummary = (order: ClearanceOrder) => {
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

export const getClearanceOrderCreationMeta = (order: ClearanceOrder) => {
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

export const getDepositCompletedActorLabel = (buyer?: ClearanceOrder["buyer"] | null) => {
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

export const getWithdrawalProcessingModeMeta = (order: ClearanceOrder) => {
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

export const getStatusMeta = (status?: string | null) => {
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

export const getWithdrawalStatusMeta = (order: ClearanceOrder) => {
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

export const getWithdrawalRealtimeStatusMeta = (event?: BankTransferDashboardEvent | null) => {
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
