"use client";

import * as Ably from "ably";
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

type SettlementInfo = {
  txid?: string;
  status?: string;
  createdAt?: string;
  settledAt?: string;
  settlementAt?: string;
  settlementAmount?: number | string;
  settlementAmountKRW?: number | string;
  settlementWalletAddress?: string;
  settlementWalletBalance?: number | string;
  feeAmount?: number | string;
  feeAmountKRW?: number | string;
  feeWalletAddress?: string;
  agentFeeAmount?: number | string;
  agentFeeAmountKRW?: number | string;
  agentFeeWalletAddress?: string;
};

type BuyOrder = {
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
  transactionHash?: string;
  storecode?: string;
  nickname?: string;
  walletAddress?: string;
  autoConfirmPayment?: boolean | null;
  matchedByAdmin?: boolean | null;
  userType?: string;
  paymentMethod?: string;
  settlement?: SettlementInfo | null;
  escrowWallet?: {
    transactionHash?: string;
  } | null;
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

type DepositOption = {
  _id?: string;
  amount?: number;
  transactionName?: string;
  bankName?: string;
  bankAccountNumber?: string;
  transactionDateUtc?: string;
  processingDate?: string;
  regDate?: string;
  tradeId?: string;
  userId?: string;
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
  tradeSummary: {
    totalCount: number;
    totalUsdtAmount: number;
    totalKrwAmount: number;
    totalSettlementCount: number;
    totalSettlementAmount: number;
    totalSettlementAmountKRW: number;
    totalFeeAmount: number;
    totalFeeAmountKRW: number;
    totalAgentFeeAmount: number;
    totalAgentFeeAmountKRW: number;
  };
  banktransferTodaySummary: {
    dateKst: string;
    depositedAmount: number;
    withdrawnAmount: number;
    depositedCount: number;
    withdrawnCount: number;
    totalCount: number;
    updatedAt: string;
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

const EMPTY_TRADE_SUMMARY: DashboardResult["tradeSummary"] = {
  totalCount: 0,
  totalUsdtAmount: 0,
  totalKrwAmount: 0,
  totalSettlementCount: 0,
  totalSettlementAmount: 0,
  totalSettlementAmountKRW: 0,
  totalFeeAmount: 0,
  totalFeeAmountKRW: 0,
  totalAgentFeeAmount: 0,
  totalAgentFeeAmountKRW: 0,
};

const EMPTY_BANKTRANSFER_TODAY_SUMMARY: DashboardResult["banktransferTodaySummary"] = {
  dateKst: "",
  depositedAmount: 0,
  withdrawnAmount: 0,
  depositedCount: 0,
  withdrawnCount: 0,
  totalCount: 0,
  updatedAt: "",
};

const SECTION_LOADING_BADGE_CLASS_NAME =
  "inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700";

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

const RATE_FORMATTER = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const USDT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const COUNTDOWN_TICK_MS = 1000;
const NEW_ORDER_HIGHLIGHT_MS = 6500;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
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

const getKstDateLabel = (referenceDate: Date) => {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(referenceDate);
};

const getRemainingKstMs = (referenceMs: number) => {
  const shifted = new Date(referenceMs + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const nextMidnightShiftedMs = Date.UTC(year, month, day + 1, 0, 0, 0, 0);
  return Math.max(0, nextMidnightShiftedMs - shifted.getTime());
};

const formatCountdownHms = (totalMs: number) => {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatElapsedTimer = (value: string | null | undefined, referenceMs: number) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  const startedAtMs = parsed.getTime();
  if (Number.isNaN(startedAtMs)) {
    return "";
  }

  return formatCountdownHms(Math.max(0, referenceMs - startedAtMs));
};

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

const getOrderMatchKey = (order?: BuyOrder | null) => {
  return String(order?.tradeId || order?._id || "").trim();
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

const formatUsdtValue = (value?: number | null) => {
  const numeric = Number(value || 0);
  return USDT_FORMATTER.format(numeric);
};

const formatKrw = (value?: number | null) => {
  const numeric = Number(value || 0);
  return `${KRW_FORMATTER.format(numeric)} KRW`;
};

const formatKrwValue = (value?: number | null) => {
  const numeric = Number(value || 0);
  return KRW_FORMATTER.format(numeric);
};

const formatRateValue = (value?: number | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "-";
  }
  return RATE_FORMATTER.format(numeric);
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

const getActorDisplayLabel = (value: unknown) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const candidate = value as Record<string, unknown>;
  const namedKeys = ["name", "nickname", "displayName", "fullName", "email"];
  for (const key of namedKeys) {
    const next = String(candidate[key] || "").trim();
    if (next) {
      return next;
    }
  }

  const walletValue = String(candidate.walletAddress || candidate.address || "").trim();
  if (walletValue) {
    return shortAddress(walletValue);
  }

  const idValue = String(candidate.userId || candidate.id || "").trim();
  return idValue;
};

const getDepositProcessedByLabel = (order: BuyOrder) => {
  const rawOrder = order as Record<string, unknown>;
  const objectCandidates = [
    rawOrder.paymentConfirmedBy,
    rawOrder.confirmedBy,
    rawOrder.processedBy,
    rawOrder.updatedBy,
    rawOrder.matchedByAdminUser,
    rawOrder.adminUser,
    rawOrder.operator,
    rawOrder.manager,
    rawOrder.staff,
  ];

  for (const candidate of objectCandidates) {
    const label = getActorDisplayLabel(candidate);
    if (label) {
      return label;
    }
  }

  const stringKeys = [
    "paymentConfirmedByName",
    "confirmedByName",
    "processedByName",
    "updatedByName",
    "matchedByAdminName",
    "adminName",
    "operatorName",
    "managerName",
    "staffName",
    "paymentConfirmedByWalletAddress",
    "confirmedByWalletAddress",
    "processedByWalletAddress",
    "updatedByWalletAddress",
    "adminWalletAddress",
  ];

  for (const key of stringKeys) {
    const next = String(rawOrder[key] || "").trim();
    if (next) {
      return key.toLowerCase().includes("wallet") ? shortAddress(next) : next;
    }
  }

  return "";
};

const getDepositProcessingMeta = (order: BuyOrder) => {
  const processedByLabel = getDepositProcessedByLabel(order);

  if (order.autoConfirmPayment === true) {
    return {
      label: "자동",
      className: "bg-sky-100 text-sky-700",
      detail: "자동입금확인",
      actor: "",
    };
  }

  if (order.autoConfirmPayment === false) {
    return {
      label: "수동",
      className: "bg-amber-100 text-amber-800",
      detail: "",
      actor: processedByLabel || "관리자",
    };
  }

  if (order.matchedByAdmin === true) {
    return {
      label: "수동",
      className: "bg-amber-100 text-amber-800",
      detail: "관리자 확인",
      actor: processedByLabel || "관리자",
    };
  }

  if (order.matchedByAdmin === false) {
    return {
      label: "자동",
      className: "bg-sky-100 text-sky-700",
      detail: "자동 매칭",
      actor: "",
    };
  }

  if (order.status === "paymentConfirmed" || order.status === "paymentSettled") {
    return {
      label: "수동",
      className: "bg-amber-100 text-amber-800",
      detail: "",
      actor: processedByLabel || "관리자",
    };
  }

  if (order.status === "paymentRequested") {
    return {
      label: "확인중",
      className: "bg-slate-100 text-slate-700",
      detail: "",
      actor: "",
    };
  }

  return {
    label: "-",
    className: "bg-slate-100 text-slate-500",
    detail: "",
    actor: "",
  };
};

const hasSettlementCompleted = (order: BuyOrder) => {
  const rawOrder = order as Record<string, unknown>;

  if (order.status === "paymentSettled") {
    return true;
  }

  const booleanKeys = [
    "paymentSettled",
    "settled",
    "isSettled",
    "settlementCompleted",
    "isSettlementCompleted",
    "settlementConfirmed",
    "isSettlementConfirmed",
  ];

  for (const key of booleanKeys) {
    if (rawOrder[key] === true) {
      return true;
    }
  }

  const statusKeys = [
    "settlementStatus",
    "paymentSettlementStatus",
    "settlementState",
    "paymentSettlementState",
  ];

  for (const key of statusKeys) {
    const value = String(rawOrder[key] || "").trim().toLowerCase();
    if (["settled", "completed", "complete", "confirmed", "done", "success", "paymentsettled"].includes(value)) {
      return true;
    }
  }

  const timestampKeys = [
    "paymentSettledAt",
    "settledAt",
    "settlementAt",
    "settlementCompletedAt",
    "settlementConfirmedAt",
  ];

  for (const key of timestampKeys) {
    if (String(rawOrder[key] || "").trim()) {
      return true;
    }
  }

  const nestedKeys = ["settlement", "paymentSettlement", "settlementInfo"];

  for (const key of nestedKeys) {
    const candidate = rawOrder[key];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const nested = candidate as Record<string, unknown>;
    const statusValue = String(nested.status || nested.state || "").trim().toLowerCase();
    if (["settled", "completed", "complete", "confirmed", "done", "success", "paymentsettled"].includes(statusValue)) {
      return true;
    }

    if (
      String(nested.settledAt || nested.completedAt || nested.confirmedAt || nested.settlementAt || "").trim()
    ) {
      return true;
    }
  }

  return false;
};

const getSettlementActorLabel = (order: BuyOrder) => {
  const rawOrder = order as Record<string, unknown>;
  const objectCandidates = [
    rawOrder.paymentSettledBy,
    rawOrder.settledBy,
    rawOrder.settlementConfirmedBy,
    rawOrder.settlementProcessedBy,
    rawOrder.paymentSettlementBy,
    rawOrder.settlement?.["processedBy" as keyof typeof rawOrder.settlement],
    rawOrder.paymentSettlement?.["processedBy" as keyof typeof rawOrder.paymentSettlement],
  ];

  for (const candidate of objectCandidates) {
    const label = getActorDisplayLabel(candidate);
    if (label) {
      return label;
    }
  }

  const stringKeys = [
    "paymentSettledByName",
    "settledByName",
    "settlementConfirmedByName",
    "settlementProcessedByName",
    "paymentSettlementByName",
    "paymentSettledByWalletAddress",
    "settledByWalletAddress",
    "settlementProcessedByWalletAddress",
  ];

  for (const key of stringKeys) {
    const next = String(rawOrder[key] || "").trim();
    if (next) {
      return key.toLowerCase().includes("wallet") ? shortAddress(next) : next;
    }
  }

  const nestedCandidates = [
    rawOrder.settlement,
    rawOrder.paymentSettlement,
    rawOrder.settlementInfo,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const nested = candidate as Record<string, unknown>;
    const label =
      getActorDisplayLabel(nested.processedBy)
      || getActorDisplayLabel(nested.confirmedBy)
      || getActorDisplayLabel(nested.settledBy)
      || String(nested.processedByName || nested.confirmedByName || nested.settledByName || "").trim();

    if (label) {
      return label;
    }
  }

  return "";
};

const getSettlementTimestamp = (order: BuyOrder) => {
  const rawOrder = order as Record<string, unknown>;
  const directKeys = [
    "paymentSettledAt",
    "settledAt",
    "settlementAt",
    "settlementCompletedAt",
    "settlementConfirmedAt",
  ];

  for (const key of directKeys) {
    const next = String(rawOrder[key] || "").trim();
    if (next) {
      return next;
    }
  }

  const nestedCandidates = [
    rawOrder.settlement,
    rawOrder.paymentSettlement,
    rawOrder.settlementInfo,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const nested = candidate as Record<string, unknown>;
    const next = String(
      nested.settledAt
      || nested.completedAt
      || nested.confirmedAt
      || nested.settlementAt
      || "",
    ).trim();

    if (next) {
      return next;
    }
  }

  return "";
};

const getSettlementStateLabel = (order: BuyOrder) => {
  const rawOrder = order as Record<string, unknown>;
  const statusKeys = [
    "settlementStatus",
    "paymentSettlementStatus",
    "settlementState",
    "paymentSettlementState",
  ];

  for (const key of statusKeys) {
    const value = String(rawOrder[key] || "").trim().toLowerCase();
    if (!value) {
      continue;
    }

    if (["settled", "completed", "complete", "confirmed", "done", "success", "paymentsettled"].includes(value)) {
      return "결제완료";
    }
    if (["pending", "waiting", "queued"].includes(value)) {
      return "대기중";
    }
    if (["processing", "progress", "inprogress", "running"].includes(value)) {
      return "처리중";
    }
    if (["failed", "error", "rejected"].includes(value)) {
      return "실패";
    }
    if (["cancelled", "canceled"].includes(value)) {
      return "취소";
    }
  }

  const nestedCandidates = [
    rawOrder.settlement,
    rawOrder.paymentSettlement,
    rawOrder.settlementInfo,
  ];

  for (const candidate of nestedCandidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const nested = candidate as Record<string, unknown>;
    const value = String(nested.status || nested.state || "").trim().toLowerCase();
    if (!value) {
      continue;
    }

    if (["settled", "completed", "complete", "confirmed", "done", "success", "paymentsettled"].includes(value)) {
      return "결제완료";
    }
    if (["pending", "waiting", "queued"].includes(value)) {
      return "대기중";
    }
    if (["processing", "progress", "inprogress", "running"].includes(value)) {
      return "처리중";
    }
    if (["failed", "error", "rejected"].includes(value)) {
      return "실패";
    }
    if (["cancelled", "canceled"].includes(value)) {
      return "취소";
    }
  }

  return "";
};

const getSettlementMeta = (order: BuyOrder) => {
  const actor = getSettlementActorLabel(order);
  const timestamp = getSettlementTimestamp(order);
  const stateLabel = getSettlementStateLabel(order);
  const completed = hasSettlementCompleted(order);

  if (completed) {
    return {
      label: "결제완료",
      className: "bg-sky-100 text-sky-700",
      detail: timestamp ? formatDateTime(timestamp) : stateLabel || "가맹점 결제 완료",
      actor,
    };
  }

  if (stateLabel === "처리중") {
    return {
      label: "처리중",
      className: "bg-violet-100 text-violet-700",
      detail: timestamp ? formatDateTime(timestamp) : "가맹점 결제 처리중",
      actor,
    };
  }

  if (stateLabel === "실패") {
    return {
      label: "실패",
      className: "bg-rose-100 text-rose-700",
      detail: timestamp ? formatDateTime(timestamp) : "가맹점 결제 실패",
      actor,
    };
  }

  if (stateLabel === "취소") {
    return {
      label: "취소",
      className: "bg-slate-100 text-slate-700",
      detail: timestamp ? formatDateTime(timestamp) : "가맹점 결제 취소",
      actor,
    };
  }

  if (order.status === "paymentConfirmed" || stateLabel === "대기중") {
    return {
      label: "대기중",
      className: "bg-slate-100 text-slate-700",
      detail: timestamp ? formatDateTime(timestamp) : "가맹점 결제 대기",
      actor,
    };
  }

  return {
    label: "-",
    className: "bg-slate-100 text-slate-500",
    detail: "",
    actor,
  };
};

const getSettlementInfo = (order: BuyOrder): SettlementInfo | null => {
  const candidates = [
    order.settlement,
    (order as Record<string, unknown>).paymentSettlement,
    (order as Record<string, unknown>).settlementInfo,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    return candidate as SettlementInfo;
  }

  return null;
};

const getSettlementTxHash = (order: BuyOrder) => {
  const settlement = getSettlementInfo(order);
  const txid = String(settlement?.txid || "").trim();
  return txid && txid !== "0x" ? txid : "";
};

const getBscscanTxUrl = (txHash: string) => {
  return `https://bscscan.com/tx/${txHash}`;
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
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [depositModalLoading, setDepositModalLoading] = useState(false);
  const [depositModalSubmitting, setDepositModalSubmitting] = useState(false);
  const [depositModalError, setDepositModalError] = useState("");
  const [depositOptions, setDepositOptions] = useState<DepositOption[]>([]);
  const [selectedDepositIds, setSelectedDepositIds] = useState<string[]>([]);
  const [targetConfirmOrder, setTargetConfirmOrder] = useState<BuyOrder | null>(null);
  const [confirmingTradeId, setConfirmingTradeId] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelModalSubmitting, setCancelModalSubmitting] = useState(false);
  const [cancelModalError, setCancelModalError] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [targetCancelOrder, setTargetCancelOrder] = useState<BuyOrder | null>(null);
  const [cancellingTradeId, setCancellingTradeId] = useState("");
  const [data, setData] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [connectionState, setConnectionState] = useState<Ably.ConnectionState>("initialized");
  const [connectionError, setConnectionError] = useState("");
  const [lastRealtimeEventAt, setLastRealtimeEventAt] = useState("");
  const [lastUnmatchedEventAt, setLastUnmatchedEventAt] = useState("");
  const [highlightedTradeId, setHighlightedTradeId] = useState("");
  const [newRealtimeTradeIds, setNewRealtimeTradeIds] = useState<string[]>([]);
  const [highlightedUnmatchedId, setHighlightedUnmatchedId] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");
  const [countdownNowMs, setCountdownNowMs] = useState(() => Date.now());
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newOrderHighlightTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const unmatchedHighlightResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRealtimeEventIdRef = useRef("");
  const lastUnmatchedRealtimeEventIdRef = useRef("");
  const ablyClientIdRef = useRef(`console-buyorder-${Math.random().toString(36).slice(2, 10)}`);
  const storeSearchRef = useRef<HTMLDivElement | null>(null);
  const selectedDepositTotal = useMemo(() => {
    return depositOptions.reduce((sum, item) => {
      const itemId = String(item._id || "");
      if (!selectedDepositIds.includes(itemId)) {
        return sum;
      }
      return sum + (Number(item.amount) || 0);
    }, 0);
  }, [depositOptions, selectedDepositIds]);
  const depositAmountMatches = useMemo(() => {
    if (!targetConfirmOrder || selectedDepositIds.length === 0) {
      return true;
    }

    return (Number(targetConfirmOrder.krwAmount) || 0) === selectedDepositTotal;
  }, [selectedDepositIds.length, selectedDepositTotal, targetConfirmOrder]);
  const currentConfirmOrderStatus = String(targetConfirmOrder?.status || "").trim();
  const currentCancelOrderStatus = String(targetCancelOrder?.status || "").trim();
  const confirmOrderStatusMeta = statusMetaMap[currentConfirmOrderStatus] || {
    label: currentConfirmOrderStatus || "-",
    className: "border border-slate-200 bg-slate-100 text-slate-700",
  };
  const cancelOrderStatusMeta = statusMetaMap[currentCancelOrderStatus] || {
    label: currentCancelOrderStatus || "-",
    className: "border border-slate-200 bg-slate-100 text-slate-700",
  };
  const canSubmitConfirmModal = currentConfirmOrderStatus === "paymentRequested";
  const canSubmitCancelModal = currentCancelOrderStatus === "accepted" || currentCancelOrderStatus === "paymentRequested";

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

  const queueNewOrderHighlight = useCallback((matchKey: string) => {
    const safeMatchKey = String(matchKey || "").trim();
    if (!safeMatchKey) {
      return;
    }

    setNewRealtimeTradeIds((current) => {
      return current.includes(safeMatchKey) ? current : [...current, safeMatchKey];
    });

    if (newOrderHighlightTimersRef.current[safeMatchKey]) {
      clearTimeout(newOrderHighlightTimersRef.current[safeMatchKey]);
    }

    newOrderHighlightTimersRef.current[safeMatchKey] = setTimeout(() => {
      setNewRealtimeTradeIds((current) => current.filter((item) => item !== safeMatchKey));
      delete newOrderHighlightTimersRef.current[safeMatchKey];
    }, NEW_ORDER_HIGHLIGHT_MS);
  }, []);

  const applyRealtimeEventToDashboard = useCallback((event: BuyOrderStatusRealtimeEvent) => {
    const matchKey = String(event.tradeId || event.orderId || "").trim();
    if (!matchKey) {
      return;
    }

    let shouldAnimateAsNewOrder = false;
    const nextStatus = String(event.statusTo || "").trim();

    setData((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      let hasMatchingOrder = false;
      const patchOrder = (order: BuyOrder) => {
        const orderTradeId = String(order.tradeId || order._id || "").trim();
        if (orderTradeId !== matchKey) {
          return order;
        }

        hasMatchingOrder = true;
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

      if (!hasMatchingOrder && nextStatus === "ordered") {
        shouldAnimateAsNewOrder = true;
      }

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
    if (shouldAnimateAsNewOrder) {
      queueNewOrderHighlight(matchKey);
    }
    setHighlightedTradeId(matchKey);
    if (highlightResetTimerRef.current) {
      clearTimeout(highlightResetTimerRef.current);
    }
    highlightResetTimerRef.current = setTimeout(() => {
      setHighlightedTradeId("");
    }, 4000);
  }, [queueNewOrderHighlight]);

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

  const patchOrderInDashboard = useCallback((matchKey: string, patch: Partial<BuyOrder>) => {
    if (!matchKey) {
      return;
    }

    setData((current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const patchOrder = (order: BuyOrder) => {
        const orderMatchKey = String(order.tradeId || order._id || "").trim();
        if (orderMatchKey !== matchKey) {
          return order;
        }

        changed = true;
        return {
          ...order,
          ...patch,
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
        orders: nextOrders,
        processingBuyOrders: nextProcessingBuyOrders,
        processingClearanceOrders: nextProcessingClearanceOrders,
      };
    });
  }, []);

  useEffect(() => {
    if (!data || !targetConfirmOrder) {
      return;
    }

    const matchKey = getOrderMatchKey(targetConfirmOrder);
    if (!matchKey) {
      return;
    }

    const candidates = [
      ...(data.orders || []),
      ...(data.processingBuyOrders || []),
      ...(data.processingClearanceOrders || []),
    ];
    const nextOrder = candidates.find((order) => getOrderMatchKey(order) === matchKey);

    if (nextOrder && nextOrder !== targetConfirmOrder) {
      setTargetConfirmOrder(nextOrder);
    }
  }, [data, targetConfirmOrder]);

  useEffect(() => {
    if (!data || !targetCancelOrder) {
      return;
    }

    const matchKey = getOrderMatchKey(targetCancelOrder);
    if (!matchKey) {
      return;
    }

    const candidates = [
      ...(data.orders || []),
      ...(data.processingBuyOrders || []),
      ...(data.processingClearanceOrders || []),
    ];
    const nextOrder = candidates.find((order) => getOrderMatchKey(order) === matchKey);

    if (nextOrder && nextOrder !== targetCancelOrder) {
      setTargetCancelOrder(nextOrder);
    }
  }, [data, targetCancelOrder]);

  const fetchDepositsForOrder = useCallback(async (order: BuyOrder | null) => {
    if (!order) {
      return;
    }

    const sellerAccountNumber = String(order.seller?.bankInfo?.accountNumber || "").trim();
    if (!sellerAccountNumber) {
      throw new Error("판매자 계좌번호가 없습니다.");
    }

    setDepositModalLoading(true);
    setDepositModalError("");

    try {
      const response = await fetch("/api/bff/admin/bank-transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountNumber: sellerAccountNumber,
          transactionType: "deposited",
          matchStatus: "unmatched",
          page: 1,
          limit: 50,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `입금내역 조회 실패 (${response.status})`);
      }

      const nextOptions = ((payload?.result?.transfers || []) as DepositOption[])
        .filter((item) => {
          const transactionType = String((item as any)?.transactionType || "").trim().toLowerCase();
          return !transactionType || transactionType === "deposited" || transactionType === "deposit";
        })
        .sort((left, right) => {
          const leftTime = new Date(left.transactionDateUtc || left.regDate || 0).getTime();
          const rightTime = new Date(right.transactionDateUtc || right.regDate || 0).getTime();
          return rightTime - leftTime;
        });

      setDepositOptions(nextOptions);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "입금내역을 불러오지 못했습니다.";
      setDepositModalError(message);
      setDepositOptions([]);
    } finally {
      setDepositModalLoading(false);
    }
  }, [filters.fromDate, filters.toDate]);

  const openDepositModalForOrder = useCallback(async (order: BuyOrder) => {
    if (!activeAccount) {
      setError("관리자 지갑을 연결해야 완료 처리할 수 있습니다.");
      return;
    }

    const sellerAccountNumber = String(order.seller?.bankInfo?.accountNumber || "").trim();
    if (!sellerAccountNumber) {
      setError("판매자 계좌번호가 없습니다.");
      return;
    }

    setError("");
    setTargetConfirmOrder(order);
    setSelectedDepositIds([]);
    setDepositOptions([]);
    setDepositModalError("");
    setDepositModalOpen(true);
    await fetchDepositsForOrder(order);
  }, [activeAccount, fetchDepositsForOrder]);

  const closeDepositModal = useCallback(() => {
    if (depositModalSubmitting) {
      return;
    }

    setDepositModalOpen(false);
    setDepositModalError("");
    setDepositOptions([]);
    setSelectedDepositIds([]);
    setTargetConfirmOrder(null);
  }, [depositModalSubmitting]);

  const handleConfirmPaymentFromConsole = useCallback(async () => {
    if (!activeAccount || !targetConfirmOrder) {
      setDepositModalError("완료 처리 대상 주문이 없습니다.");
      return;
    }

    if (String(targetConfirmOrder.status || "").trim() !== "paymentRequested") {
      setDepositModalError("주문 상태가 변경되어 더 이상 완료 처리할 수 없습니다.");
      return;
    }

    const matchKey = getOrderMatchKey(targetConfirmOrder);
    const storecode = String(targetConfirmOrder.storecode || targetConfirmOrder.store?.storecode || "").trim();
    const orderId = String(targetConfirmOrder._id || "").trim();

    if (!storecode || !orderId) {
      setDepositModalError("주문 식별 정보가 부족합니다.");
      return;
    }

    if (selectedDepositIds.length > 0 && !depositAmountMatches) {
      setDepositModalError("선택한 입금 합계와 주문 금액이 일치하지 않습니다.");
      return;
    }

    const route =
      String(targetConfirmOrder.paymentMethod || "").trim() === "mkrw"
        ? "/api/order/buyOrderConfirmPaymentWithEscrow"
        : "/api/order/buyOrderConfirmPaymentWithoutEscrow";

    const bankTransferIds = selectedDepositIds.length ? selectedDepositIds : ["000000000"];
    const bankTransferAmount = selectedDepositIds.length ? selectedDepositTotal : 0;

    setDepositModalSubmitting(true);
    setDepositModalError("");
    setConfirmingTradeId(matchKey);

    try {
      const signedBody = await createCenterStoreAdminSignedBody({
        account: activeAccount,
        route,
        storecode,
        requesterWalletAddress: activeAccount.address,
        body: {
          lang,
          storecode,
          orderId,
          paymentAmount: Number(targetConfirmOrder.krwAmount) || 0,
          transactionHash: "0x",
          bankTransferId: bankTransferIds[0],
          bankTransferIds,
          bankTransferAmount,
          isSmartAccount: false,
        },
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
        throw new Error(payload?.error || "완료 처리에 실패했습니다.");
      }

      patchOrderInDashboard(matchKey, {
        status: "paymentConfirmed",
        transactionHash: "0x",
        matchedByAdmin: true,
        updatedAt: new Date().toISOString(),
      });
      closeDepositModal();
      void loadDashboard({ silent: true });
    } catch (confirmError) {
      setDepositModalError(
        confirmError instanceof Error ? confirmError.message : "완료 처리에 실패했습니다.",
      );
    } finally {
      setDepositModalSubmitting(false);
      setConfirmingTradeId("");
    }
  }, [
    activeAccount,
    closeDepositModal,
    depositAmountMatches,
    lang,
    loadDashboard,
    patchOrderInDashboard,
    selectedDepositIds,
    selectedDepositTotal,
    targetConfirmOrder,
  ]);

  const openCancelModalForOrder = useCallback((order: BuyOrder) => {
    if (!activeAccount) {
      setError("관리자 지갑을 연결해야 거래취소를 처리할 수 있습니다.");
      return;
    }

    setError("");
    setCancelModalError("");
    setCancelReason("");
    setTargetCancelOrder(order);
    setCancelModalOpen(true);
  }, [activeAccount]);

  const closeCancelModal = useCallback(() => {
    if (cancelModalSubmitting) {
      return;
    }

    setCancelModalOpen(false);
    setCancelModalError("");
    setCancelReason("");
    setTargetCancelOrder(null);
  }, [cancelModalSubmitting]);

  const handleCancelTradeFromConsole = useCallback(async () => {
    if (!activeAccount || !targetCancelOrder) {
      setCancelModalError("취소 대상 주문이 없습니다.");
      return;
    }

    const currentStatus = String(targetCancelOrder.status || "").trim();
    if (currentStatus !== "accepted" && currentStatus !== "paymentRequested") {
      setCancelModalError("주문 상태가 변경되어 더 이상 취소할 수 없습니다.");
      return;
    }

    const matchKey = getOrderMatchKey(targetCancelOrder);
    const orderId = String(targetCancelOrder._id || "").trim();
    const walletAddress = String(activeAccount.address || "").trim().toLowerCase();
    const hasEscrowWallet = Boolean(String(targetCancelOrder.escrowWallet?.transactionHash || "").trim());

    if (!orderId) {
      setCancelModalError("주문 식별 정보가 부족합니다.");
      return;
    }

    setCancelModalSubmitting(true);
    setCancelModalError("");
    setCancellingTradeId(matchKey);

    try {
      if (hasEscrowWallet) {
        const response = await fetch("/api/bff/admin/order-action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route: "/api/order/cancelTradeBySellerWithEscrow",
            body: {
              orderId,
              storecode: "admin",
              walletAddress,
              cancelTradeReason: cancelReason,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "거래취소에 실패했습니다.");
        }
      } else {
        const signedBody = await createCenterStoreAdminSignedBody({
          account: activeAccount,
          route: "/api/order/cancelTradeBySeller",
          storecode: "admin",
          requesterWalletAddress: activeAccount.address,
          body: {
            orderId,
            storecode: "admin",
            walletAddress,
            cancelTradeReason: cancelReason,
          },
        });

        const response = await fetch("/api/bff/admin/signed-order-action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route: "/api/order/cancelTradeBySeller",
            signedBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "거래취소에 실패했습니다.");
        }
      }

      patchOrderInDashboard(matchKey, {
        status: "cancelled",
        updatedAt: new Date().toISOString(),
      });
      closeCancelModal();
      void loadDashboard({ silent: true });
    } catch (cancelError) {
      setCancelModalError(
        cancelError instanceof Error ? cancelError.message : "거래취소에 실패했습니다.",
      );
    } finally {
      setCancelModalSubmitting(false);
      setCancellingTradeId("");
    }
  }, [activeAccount, cancelReason, closeCancelModal, loadDashboard, patchOrderInDashboard, targetCancelOrder]);

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
    const interval = setInterval(() => {
      setCountdownNowMs(Date.now());
    }, COUNTDOWN_TICK_MS);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const newOrderHighlightTimers = newOrderHighlightTimersRef.current;
    return () => {
      for (const timer of Object.values(newOrderHighlightTimers)) {
        clearTimeout(timer);
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

    return results;
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

  const isSignedIn = Boolean(activeAccount);
  const tradeSummary = data?.tradeSummary || EMPTY_TRADE_SUMMARY;
  const banktransferTodaySummary = data?.banktransferTodaySummary || EMPTY_BANKTRANSFER_TODAY_SUMMARY;
  const todayDateLabelKst = useMemo(() => getKstDateLabel(new Date(countdownNowMs)), [countdownNowMs]);
  const remainingMsToday = useMemo(() => getRemainingKstMs(countdownNowMs), [countdownNowMs]);
  const countdownLabel = useMemo(() => formatCountdownHms(remainingMsToday), [remainingMsToday]);
  const remainingDayRatio = useMemo(() => {
    return Math.max(0, Math.min(100, (remainingMsToday / ONE_DAY_MS) * 100));
  }, [remainingMsToday]);
  const banktransferBarBaseAmount = useMemo(() => {
    return Math.max(
      banktransferTodaySummary.depositedAmount,
      banktransferTodaySummary.withdrawnAmount,
      1,
    );
  }, [banktransferTodaySummary.depositedAmount, banktransferTodaySummary.withdrawnAmount]);
  const pendingUsdtTransferCount = useMemo(() => {
    return orders.filter((order) => {
      const status = String(order.status || "").trim();
      const transactionHash = String(order.transactionHash || "").trim();
      return status === "paymentConfirmed" && (!transactionHash || transactionHash === "0x");
    }).length;
  }, [orders]);
  const pendingSettlementCount = useMemo(() => {
    return orders.filter((order) => {
      const status = String(order.status || "").trim();
      return status === "paymentConfirmed" && !hasSettlementCompleted(order);
    }).length;
  }, [orders]);
  const depositedRatio = useMemo(() => {
    if (banktransferTodaySummary.depositedAmount <= 0) {
      return 0;
    }
    return Math.max(12, Math.min(100, (banktransferTodaySummary.depositedAmount / banktransferBarBaseAmount) * 100));
  }, [banktransferBarBaseAmount, banktransferTodaySummary.depositedAmount]);
  const withdrawnRatio = useMemo(() => {
    if (banktransferTodaySummary.withdrawnAmount <= 0) {
      return 0;
    }
    return Math.max(12, Math.min(100, (banktransferTodaySummary.withdrawnAmount / banktransferBarBaseAmount) * 100));
  }, [banktransferBarBaseAmount, banktransferTodaySummary.withdrawnAmount]);
  const fieldClassName =
    "h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100";
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
  ];
  const syncStatusLabel = loading
    ? "Loading dashboard"
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
      ? connectionState === "connected"
        ? "text-emerald-300"
        : connectionState === "connecting" || connectionState === "initialized"
          ? "text-sky-300"
          : "text-amber-300"
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
  const showUnmatchedLoadingOverlay = loading && unmatchedTransfers.length > 0;
  const showOrdersLoadingOverlay = loading && orders.length > 0;
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
                    </h1>
                  </div>

                  <div className="max-w-xl">
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

                <div className="console-dark-card rounded-[28px] p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
                    Live command deck
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {liveQueueCards.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[18px] border border-white/10 bg-white/6 px-3 py-3"
                      >
                        <div className="console-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                          {item.label}
                        </div>
                        <div className="console-display mt-1.5 text-[1.6rem] font-semibold tracking-[-0.05em] text-white">
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
              </div>
            </div>

            <div className="mt-6 rounded-[28px] bg-slate-950 px-4 py-4 text-white md:px-5 md:py-5">
              <div className="grid gap-3 xl:grid-cols-12">
                <div className="space-y-2 text-sm xl:col-span-4">
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
                      className={fieldClassName}
                    />
                    {!storeSearchOpen && !storeSearchQuery && selectedDraftStoreSummary ? (
                      <div className="pointer-events-none absolute inset-x-4 inset-y-0 flex items-center gap-3">
                        <img
                          src={getStoreOptionLogoSrc(selectedDraftStoreSummary)}
                          alt={getStoreDisplayName(selectedDraftStoreSummary) || draftFilters.storecode}
                          className="h-7 w-7 rounded-full border border-slate-200 bg-white object-cover"
                        />
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                          {getStoreDisplayName(selectedDraftStoreSummary) || draftFilters.storecode}
                        </div>
                        <div className="console-mono truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          {draftFilters.storecode}
                        </div>
                      </div>
                    ) : null}
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
                            {!draftFilters.storecode ? (
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
                                      ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
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
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                              검색 조건에 맞는 가맹점이 없습니다.
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <label className="space-y-2 text-sm xl:col-span-3">
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
                    placeholder="tradeId 검색"
                    className={fieldClassName}
                  />
                </label>

                <label className="space-y-2 text-sm xl:col-span-3">
                  <span className="font-medium text-slate-200">구매자 검색</span>
                  <input
                    value={draftFilters.searchBuyer}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        searchBuyer: event.target.value,
                        page: 1,
                      }))
                    }
                    placeholder="닉네임 / wallet"
                    className={fieldClassName}
                  />
                </label>

                <label className="space-y-2 text-sm xl:col-span-2">
                  <span className="font-medium text-slate-200">날짜</span>
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

                <div className="space-y-2 text-sm xl:col-span-4">
                  <span className="font-medium text-slate-200">빠른 날짜</span>
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

                <div className="space-y-2 text-sm xl:col-span-8">
                  <span className="font-medium text-slate-200">표시 옵션</span>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      {
                        label: "내 주문",
                        value: draftFilters.searchMyOrders,
                        key: "searchMyOrders",
                      },
                      {
                        label: "취소 포함",
                        value: draftFilters.searchOrderStatusCancelled,
                        key: "searchOrderStatusCancelled",
                      },
                      {
                        label: "완료 포함",
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
                        className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
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

        <section className="grid gap-3 xl:grid-cols-[0.92fr_1.04fr_1.04fr]">
          <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(241,245,249,0.92))] px-4 py-3.5 text-slate-950 shadow-sm">
            <div className="console-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">오늘 날짜 (KST)</div>
            <div className="mt-1.5 text-[1.15rem] font-semibold tracking-[-0.05em] text-slate-950">
              {todayDateLabelKst}
            </div>
            <div className="mt-3.5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[8px] uppercase tracking-[0.14em] text-slate-500">오늘 남은 시간</div>
                <div className="mt-1 font-mono text-[1.25rem] font-semibold leading-none tabular-nums text-slate-950">
                  {countdownLabel}
                </div>
              </div>
              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Count
              </span>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-violet-400 transition-all duration-700"
                style={{ width: `${remainingDayRatio}%` }}
              />
            </div>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-emerald-200 bg-[linear-gradient(180deg,_rgba(236,253,245,0.92),_rgba(255,255,255,0.98))] px-4 py-3.5 text-slate-950 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="console-mono text-[8px] uppercase tracking-[0.16em] text-emerald-700">오늘 입금 (KST)</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  누적 {NUMBER_FORMATTER.format(banktransferTodaySummary.depositedCount)}건
                </div>
              </div>
              <span className="inline-flex rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                Live
              </span>
            </div>
            <div className="mt-2.5 text-right">
              <div className="flex justify-end gap-2">
                <span className="text-[1.45rem] font-bold leading-none tracking-[-0.05em] tabular-nums text-emerald-700">
                  {formatKrwValue(banktransferTodaySummary.depositedAmount)}
                </span>
                <span className="console-mono pt-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-700">KRW</span>
              </div>
              <div className="mt-1.5 text-[10px] text-slate-500">
                {banktransferTodaySummary.updatedAt
                  ? `updated ${formatTimeAgo(banktransferTodaySummary.updatedAt)}`
                  : "updated -"}
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                style={{ width: `${depositedRatio}%` }}
              />
            </div>
          </article>

          <article className="overflow-hidden rounded-[24px] border border-rose-200 bg-[linear-gradient(180deg,_rgba(255,241,242,0.9),_rgba(255,255,255,0.98))] px-4 py-3.5 text-slate-950 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="console-mono text-[8px] uppercase tracking-[0.16em] text-rose-700">오늘 출금 (KST)</div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  누적 {NUMBER_FORMATTER.format(banktransferTodaySummary.withdrawnCount)}건
                </div>
              </div>
              <span className="inline-flex rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                Live
              </span>
            </div>
            <div className="mt-2.5 text-right">
              <div className="flex justify-end gap-2">
                <span className="text-[1.45rem] font-bold leading-none tracking-[-0.05em] tabular-nums text-rose-700">
                  {formatKrwValue(banktransferTodaySummary.withdrawnAmount)}
                </span>
                <span className="console-mono pt-0.5 text-[9px] uppercase tracking-[0.14em] text-rose-700">KRW</span>
              </div>
              <div className="mt-1.5 text-[10px] text-slate-500">
                {banktransferTodaySummary.updatedAt
                  ? `updated ${formatTimeAgo(banktransferTodaySummary.updatedAt)}`
                  : "updated -"}
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-rose-100">
              <div
                className="h-full rounded-full bg-rose-400 transition-all duration-500"
                style={{ width: `${withdrawnRatio}%` }}
              />
            </div>
          </article>
        </section>

        <section className="grid gap-3 lg:grid-cols-[0.82fr_1.18fr]">
          <article className="console-panel rounded-[24px] border border-slate-200 px-4 py-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">P2P</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">P2P 거래수</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Count</div>
                <div className="mt-1 text-[1.7rem] font-semibold leading-none tracking-[-0.05em] text-slate-950">
                  {NUMBER_FORMATTER.format(tradeSummary.totalCount)}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">거래량</div>
                <div className="mt-2 flex items-end justify-end gap-3 text-right">
                  <span className="text-[1.4rem] font-bold leading-none text-emerald-600" style={{ fontFamily: "monospace" }}>
                    {formatUsdtValue(tradeSummary.totalUsdtAmount)}
                  </span>
                  <span className="console-mono text-[10px] uppercase tracking-[0.14em] text-emerald-600">USDT</span>
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">거래금액</div>
                <div className="mt-2 flex items-end justify-end gap-3 text-right">
                  <span className="text-[1.4rem] font-bold leading-none text-amber-600" style={{ fontFamily: "monospace" }}>
                    {formatKrwValue(tradeSummary.totalKrwAmount)}
                  </span>
                  <span className="console-mono text-[10px] uppercase tracking-[0.14em] text-amber-600">KRW</span>
                </div>
              </div>
            </div>
          </article>

          <article className="console-panel rounded-[24px] border border-slate-200 px-4 py-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">Settlement</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">가맹점 결제수</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Count</div>
                <div className="mt-1 text-[1.7rem] font-semibold leading-none tracking-[-0.05em] text-slate-950">
                  {NUMBER_FORMATTER.format(tradeSummary.totalSettlementCount)}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">결제량</div>
                <div className="mt-2 flex items-end justify-end gap-2 text-right">
                  <span className="text-[1.25rem] font-bold leading-none text-emerald-600" style={{ fontFamily: "monospace" }}>
                    {formatUsdtValue(tradeSummary.totalSettlementAmount)}
                  </span>
                  <span className="console-mono text-[10px] uppercase tracking-[0.14em] text-emerald-600">USDT</span>
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">결제금액</div>
                <div className="mt-2 flex items-end justify-end gap-2 text-right">
                  <span className="text-[1.25rem] font-bold leading-none text-amber-600" style={{ fontFamily: "monospace" }}>
                    {formatKrwValue(tradeSummary.totalSettlementAmountKRW)}
                  </span>
                  <span className="console-mono text-[10px] uppercase tracking-[0.14em] text-amber-600">KRW</span>
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">수수료량</div>
                <div className="mt-2 flex items-end justify-end gap-2 text-right">
                  <span className="text-[1.25rem] font-bold leading-none text-emerald-600" style={{ fontFamily: "monospace" }}>
                    {formatUsdtValue(tradeSummary.totalFeeAmount)}
                  </span>
                  <span className="console-mono text-[10px] uppercase tracking-[0.14em] text-emerald-600">USDT</span>
                </div>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">수수료금액</div>
                <div className="mt-2 flex items-end justify-end gap-2 text-right">
                  <span className="text-[1.25rem] font-bold leading-none text-amber-600" style={{ fontFamily: "monospace" }}>
                    {formatKrwValue(tradeSummary.totalFeeAmountKRW)}
                  </span>
                  <span className="console-mono text-[10px] uppercase tracking-[0.14em] text-amber-600">KRW</span>
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="console-display text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  미신청입금 live
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                {loading ? (
                  <span className={SECTION_LOADING_BADGE_CLASS_NAME}>
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" aria-hidden="true" />
                    로딩중
                  </span>
                ) : null}
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

          <div className="relative px-4 py-4">
            <div className={`overflow-x-auto transition ${showUnmatchedLoadingOverlay ? "pointer-events-none opacity-45" : ""}`}>
              {loading && unmatchedTransfers.length === 0 ? (
                <div className="flex min-w-full gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`unmatched-loading-${index}`}
                      className="min-w-[260px] max-w-[300px] animate-pulse rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="h-4 w-24 rounded-full bg-slate-200" />
                          <div className="mt-2 h-3 w-32 rounded-full bg-slate-200" />
                        </div>
                        <div className="h-6 w-20 rounded-full bg-slate-200" />
                      </div>
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-xl bg-slate-200" />
                          <div className="h-3 w-20 rounded-full bg-slate-200" />
                        </div>
                        <div className="h-3 w-24 rounded-full bg-slate-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : unmatchedTransfers.length === 0 ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                  현재 필터에 해당하는 미신청입금이 없습니다.
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
            {showUnmatchedLoadingOverlay ? (
              <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-[24px] border border-slate-200/80 bg-white/85 backdrop-blur-sm">
                <div className="inline-flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 shadow-sm">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" aria-hidden="true" />
                  미신청입금 내역 불러오는 중...
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="border-b border-slate-200/80 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="console-display text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  구매주문
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                {loading ? (
                  <span className={SECTION_LOADING_BADGE_CLASS_NAME}>
                    <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" aria-hidden="true" />
                    로딩중
                  </span>
                ) : null}
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

          <div className="relative px-2 pb-2">
            <div className={`overflow-x-auto transition ${showOrdersLoadingOverlay ? "pointer-events-none opacity-45" : ""}`}>
              <table className="min-w-[1420px] w-full border-separate border-spacing-0">
              <thead>
                <tr className="console-mono text-left text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  <th className="border-b border-slate-200 px-4 py-3">거래번호</th>
                  <th className="w-[156px] border-b border-slate-200 px-4 py-3">상태</th>
                  <th className="w-[196px] border-b border-slate-200 px-4 py-3">가맹점</th>
                  <th className="border-b border-slate-200 px-4 py-3">구매자</th>
                  <th className="w-[220px] border-b border-slate-200 px-4 py-3">판매자</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-right">구매금액 / 구매량</th>
                  <th className="w-[208px] border-b border-slate-200 px-4 py-3">입금처리</th>
                  <th className="border-b border-slate-200 px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>USDT 전송</span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {NUMBER_FORMATTER.format(pendingUsdtTransferCount)}
                      </span>
                    </div>
                  </th>
                  <th className="w-[188px] border-b border-slate-200 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>가맹점 결제</span>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {NUMBER_FORMATTER.format(pendingSettlementCount)}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                      {loading ? (
                        <span className="inline-flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" aria-hidden="true" />
                          주문 목록 불러오는 중...
                        </span>
                      ) : "현재 필터에 해당하는 주문이 없습니다."}
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
                    const isNewRealtimeOrder = newRealtimeTradeIds.includes(rowMatchKey);
                    const createdAtLabel = formatDateTime(order.createdAt);
                    const createdTimeAgoLabel = formatTimeAgo(order.createdAt);
                    const sellerBankSummary = getSellerBankSummary(order);
                    const isSellerMatching = status === "ordered";
                    const sellerMatchingElapsedLabel = formatElapsedTimer(order.createdAt, countdownNowMs);
                    const depositProcessing = getDepositProcessingMeta(order);
                    const isDepositPending = status === "paymentRequested";
                    const depositPendingElapsedLabel = formatElapsedTimer(
                      order.paymentRequestedAt || order.updatedAt || order.createdAt,
                      countdownNowMs,
                    );
                    const tradeId = String(order.tradeId || "").trim();
                    const isCopiedTradeId = Boolean(tradeId && copiedTradeId === tradeId);
                    const buyerLabel = getBuyerLabel(order);
                    const buyerDepositName = getBuyerDepositName(order);
                    const shouldShowBuyerLabel = !buyerDepositName || buyerDepositName !== buyerLabel;
                    const canCompleteOrder = isSignedIn && status === "paymentRequested";
                    const isConfirmingThisOrder = Boolean(confirmingTradeId && rowMatchKey === confirmingTradeId);
                    const canCancelOrder = isSignedIn && (status === "accepted" || status === "paymentRequested");
                    const isCancellingThisOrder = Boolean(cancellingTradeId && rowMatchKey === cancellingTradeId);
                    const shouldHighlightSellerBankInfo = status === "paymentRequested";
                    const transactionHash = String(order.transactionHash || "").trim();
                    const isUsdtTransferCompleted =
                      status === "paymentConfirmed" && Boolean(transactionHash && transactionHash !== "0x");
                    const isSettlementCompleted =
                      status === "paymentConfirmed" && hasSettlementCompleted(order);
                    const settlement = getSettlementInfo(order);
                    const settlementTxHash = getSettlementTxHash(order);
                    const isSettlementPending = isUsdtTransferCompleted && !hasSettlementCompleted(order);
                    const settlementPendingElapsedLabel = formatElapsedTimer(
                      order.updatedAt || settlement?.createdAt || order.paymentConfirmedAt || order.createdAt,
                      countdownNowMs,
                    );
                    const shouldShowUsdtTransferAmount = status === "paymentConfirmed";
                    const isUsdtTransferPending =
                      status === "paymentConfirmed" && (!transactionHash || transactionHash === "0x");

                    return (
                      <tr
                        key={order._id || order.tradeId}
                        className={`h-28 text-sm text-slate-700 transition hover:bg-sky-50/70 ${
                          isNewRealtimeOrder ? "console-new-order-row " : ""
                        }${
                          isRealtimeHighlighted || isNewRealtimeOrder
                            ? "bg-emerald-50 ring-1 ring-inset ring-emerald-200"
                            : statusRowTone
                              ? statusRowTone
                            : index % 2 === 0
                              ? "bg-white"
                              : "bg-slate-50/60"
                        }`}
                      >
                        <td className="w-[196px] border-b border-slate-100 px-4 py-4 align-top">
                          <div className="flex flex-wrap items-center gap-2">
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
                            {isNewRealtimeOrder ? (
                              <span className="console-new-order-badge">신규주문</span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-col items-start gap-0.5 text-xs">
                            <span className="text-slate-500">{createdAtLabel}</span>
                            {createdAtLabel === "-" ? null : (
                              <span className="text-slate-400">{createdTimeAgoLabel}</span>
                            )}
                          </div>
                        </td>
                        <td className="w-[156px] border-b border-slate-100 px-4 py-4 align-top">
                          <div className="flex flex-col items-start gap-2">
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`inline-flex w-[108px] justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}
                              >
                                {statusMeta.label}
                              </span>
                              {isSettlementCompleted ? (
                                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
                                  결제완료
                                </span>
                              ) : null}
                            </div>
                            {canCancelOrder ? (
                              <button
                                type="button"
                                onClick={() => {
                                  openCancelModalForOrder(order);
                                }}
                                disabled={isCancellingThisOrder || cancelModalSubmitting}
                                className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                                  isCancellingThisOrder || cancelModalSubmitting
                                    ? "cursor-not-allowed border border-rose-200 bg-rose-50 text-rose-500 opacity-60"
                                    : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                                }`}
                              >
                                {isCancellingThisOrder ? "거래취소중..." : "거래취소하기"}
                              </button>
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
                        <td className="w-[220px] border-b border-slate-100 px-4 py-4 align-top">
                          {isSellerMatching ? (
                            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                              <div className="text-sm font-semibold text-slate-950">판매자 매칭중</div>
                              <div className="console-mono mt-2 text-sm font-semibold text-sky-700">
                                {sellerMatchingElapsedLabel || "--:--:--"}
                              </div>
                            </div>
                          ) : shouldHighlightSellerBankInfo ? (
                            <>
                              <div className="font-medium text-slate-950">{getSellerLabel(order)}</div>
                              <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700">
                                    입금계좌
                                  </div>
                                  <div
                                    className="min-w-0 flex-1 truncate text-right text-xs font-medium text-slate-700"
                                    title={sellerBankSummary.primary}
                                  >
                                    {sellerBankSummary.primary}
                                  </div>
                                </div>
                                <div className="console-mono mt-1 text-sm font-semibold tracking-[-0.01em] text-slate-950">
                                  {sellerBankSummary.secondary}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="font-medium text-slate-950">{getSellerLabel(order)}</div>
                              <div className="mt-1 text-xs text-slate-600">
                                {sellerBankSummary.primary}
                              </div>
                              <div className="console-mono mt-1 text-xs text-slate-500">
                                {sellerBankSummary.secondary}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-right align-top font-medium tabular-nums text-slate-950">
                          <div className="flex justify-end gap-2">
                            <span className="text-[1.15rem] font-bold tracking-[-0.03em] text-slate-950">
                              {formatKrwValue(order.krwAmount)}
                            </span>
                            <span className="console-mono pt-1 text-[11px] uppercase tracking-[0.14em] text-amber-600">
                              KRW
                            </span>
                          </div>
                          <div className="mt-1.5 flex justify-end gap-2">
                            <span className="text-[13px] font-semibold tracking-[-0.01em] text-slate-500">
                              {formatUsdtValue(order.usdtAmount)}
                            </span>
                            <span className="console-mono pt-0.5 text-[10px] uppercase tracking-[0.14em] text-slate-400">
                              USDT
                            </span>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            환율 {formatRateValue(order.rate)}
                          </div>
                        </td>
                        <td className="w-[208px] border-b border-slate-100 px-4 py-4 align-top">
                          <div className="flex flex-col gap-2">
                            {isDepositPending ? (
                              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="pt-1 text-sm font-semibold text-slate-950">확인중</div>
                                  {canCompleteOrder ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void openDepositModalForOrder(order);
                                      }}
                                      disabled={isConfirmingThisOrder || depositModalSubmitting}
                                      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                                        isConfirmingThisOrder || depositModalSubmitting
                                          ? "cursor-not-allowed border border-emerald-500 bg-emerald-400 text-white opacity-60"
                                          : "border border-emerald-600 bg-emerald-600 text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.95)] hover:border-emerald-500 hover:bg-emerald-500"
                                      }`}
                                    >
                                      {isConfirmingThisOrder ? "처리중..." : "처리하기"}
                                    </button>
                                  ) : null}
                                </div>
                                <div className="console-mono mt-2 text-sm font-semibold text-sky-700">
                                  {depositPendingElapsedLabel || "--:--:--"}
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${depositProcessing.className}`}
                                >
                                  {depositProcessing.label}
                                </span>
                              </div>
                            )}
                            {depositProcessing.detail ? (
                              <span className="text-xs text-slate-500">{depositProcessing.detail}</span>
                            ) : null}
                            {depositProcessing.actor ? (
                              <span className="text-xs font-medium text-slate-700">
                                처리자 {depositProcessing.actor}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-4 py-4 text-right align-top">
                          {shouldShowUsdtTransferAmount ? (
                            <div className="flex justify-end gap-2">
                              <span className="text-[1.15rem] font-bold tracking-[-0.03em] text-emerald-600">
                                {formatUsdtValue(order.usdtAmount)}
                              </span>
                              <span className="console-mono pt-1 text-[11px] uppercase tracking-[0.14em] text-emerald-600">
                                USDT
                              </span>
                            </div>
                          ) : null}
                          {isUsdtTransferPending ? (
                            <div className="mt-1">
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                전송중
                              </span>
                            </div>
                          ) : transactionHash ? (
                      <a
                        href={getBscscanTxUrl(transactionHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-medium text-sky-700 transition hover:bg-sky-50"
                      >
                        <span className="console-mono">{shortAddress(transactionHash)}</span>
                      </a>
                          ) : (
                            <div className="mt-1 text-[11px] text-slate-400">-</div>
                          )}
                        </td>
                        <td className="w-[188px] border-b border-slate-100 px-4 py-4 align-top">
                          {isSettlementPending ? (
                            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3">
                              <div className="text-sm font-semibold text-slate-950">결제중</div>
                              <div className="console-mono mt-2 text-sm font-semibold text-sky-700">
                                {settlementPendingElapsedLabel || "--:--:--"}
                              </div>
                            </div>
                          ) : settlementTxHash ? (
                    <a
                      href={getBscscanTxUrl(settlementTxHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-medium text-sky-700 transition hover:bg-sky-50"
                    >
                      <span className="console-mono">{shortAddress(settlementTxHash)}</span>
                    </a>
                          ) : (
                            <div className="text-[11px] text-slate-400">-</div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
            {showOrdersLoadingOverlay ? (
              <div className="pointer-events-none absolute inset-x-2 top-0 bottom-2 flex items-center justify-center rounded-[24px] border border-slate-200/80 bg-white/85 backdrop-blur-sm">
                <div className="inline-flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 shadow-sm">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" aria-hidden="true" />
                  주문 목록 불러오는 중...
                </div>
              </div>
            ) : null}
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

        {depositModalOpen && targetConfirmOrder ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
            <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      결제 완료 처리
                    </div>
                    <h3 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                      미신청입금 선택 후 완료하기
                    </h3>
                    <p className="text-sm text-slate-600">
                      판매자 계좌로 들어온 미신청입금을 선택하고, 관리자 서명으로 주문을 `paymentConfirmed`
                      상태로 넘깁니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDepositModal}
                    disabled={depositModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Trade ID</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {targetConfirmOrder.tradeId || "-"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Store</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {targetConfirmOrder.store?.storeName || targetConfirmOrder.storecode || "-"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Order KRW</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {formatKrw(targetConfirmOrder.krwAmount)}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Seller account</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {targetConfirmOrder.seller?.bankInfo?.accountNumber || "-"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-3 py-1.5 font-semibold ${confirmOrderStatusMeta.className}`}>
                    현재 상태 {confirmOrderStatusMeta.label}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
                    선택 {NUMBER_FORMATTER.format(selectedDepositIds.length)}건
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
                    합계 {formatKrw(selectedDepositTotal)}
                  </span>
                  {selectedDepositIds.length > 0 ? (
                    <span
                      className={`rounded-full border px-3 py-1.5 font-semibold ${
                        depositAmountMatches
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {depositAmountMatches ? "주문 금액과 일치" : "주문 금액과 불일치"}
                    </span>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-500">
                      선택 없이 완료하면 기본 sentinel 값으로 처리됩니다.
                    </span>
                  )}
                  {!canSubmitConfirmModal ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                      상태가 변경되어 완료 처리 불가
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="max-h-[48vh] overflow-y-auto px-6 py-5">
                {depositModalLoading ? (
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                    미신청입금 내역을 불러오는 중입니다.
                  </div>
                ) : depositOptions.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center text-sm text-slate-500">
                    선택 가능한 미신청입금이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {depositOptions.map((item, index) => {
                      const itemId = String(item._id || `deposit-${index}`);
                      const isSelected = selectedDepositIds.includes(itemId);

                      return (
                        <label
                          key={itemId}
                          className={`flex cursor-pointer items-start justify-between gap-4 rounded-[24px] border px-4 py-4 transition ${
                            isSelected
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setSelectedDepositIds((prev) =>
                                  prev.includes(itemId)
                                    ? prev.filter((value) => value !== itemId)
                                    : [...prev, itemId],
                                );
                              }}
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-950">
                                {item.transactionName || "-"}
                              </div>
                              <div className="mt-1 text-xs text-slate-600">
                                {item.bankName || "-"} · {item.bankAccountNumber || "-"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatDateTime(item.transactionDateUtc || item.processingDate || item.regDate)}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-base font-semibold tracking-[-0.03em] text-emerald-700">
                              {formatKrw(item.amount)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.tradeId ? `trade ${item.tradeId}` : item.userId ? `user ${item.userId}` : "unmatched"}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 px-6 py-4">
                {depositModalError ? (
                  <div className="mb-3 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {depositModalError}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void fetchDepositsForOrder(targetConfirmOrder);
                    }}
                    disabled={depositModalLoading || depositModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    새로고침
                  </button>
                  <button
                    type="button"
                    onClick={closeDepositModal}
                    disabled={depositModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleConfirmPaymentFromConsole();
                    }}
                    disabled={depositModalSubmitting || depositModalLoading || !canSubmitConfirmModal}
                    className={`rounded-full px-5 py-2 text-sm font-semibold text-white transition ${
                      depositModalSubmitting || depositModalLoading || !canSubmitConfirmModal
                        ? "cursor-not-allowed bg-emerald-300"
                        : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {depositModalSubmitting ? "처리중..." : "처리하기"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {cancelModalOpen && targetCancelOrder ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
              <div className="border-b border-slate-200 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      거래취소 확인
                    </div>
                    <h3 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                      이 주문을 취소하시겠습니까?
                    </h3>
                    <p className="text-sm text-slate-600">
                      취소 후 주문 상태는 `cancelled`로 변경됩니다. escrow 주문이면 escrow 취소 route를,
                      일반 주문이면 관리자 서명 취소 route를 사용합니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCancelModal}
                    disabled={cancelModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Trade ID</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {targetCancelOrder.tradeId || "-"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Store</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {targetCancelOrder.store?.storeName || targetCancelOrder.storecode || "-"}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Buyer</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {getBuyerDepositName(targetCancelOrder) || getBuyerLabel(targetCancelOrder)}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-500">Order KRW</div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {formatKrw(targetCancelOrder.krwAmount)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-3 py-1.5 font-semibold ${cancelOrderStatusMeta.className}`}>
                    현재 상태 {cancelOrderStatusMeta.label}
                  </span>
                  {!canSubmitCancelModal ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                      상태가 변경되어 거래취소 불가
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="px-6 py-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-700">취소 사유</span>
                  <textarea
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="거래취소 사유를 입력하세요"
                    rows={4}
                    className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100"
                  />
                </label>
                {cancelModalError ? (
                  <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {cancelModalError}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-slate-200 px-6 py-4">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCancelModal}
                    disabled={cancelModalSubmitting}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    닫기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCancelTradeFromConsole();
                    }}
                    disabled={cancelModalSubmitting || !canSubmitCancelModal}
                    className={`rounded-full px-5 py-2 text-sm font-semibold text-white transition ${
                      cancelModalSubmitting || !canSubmitCancelModal
                        ? "cursor-not-allowed bg-rose-300"
                        : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    {cancelModalSubmitting ? "취소 처리중..." : "거래취소하기"}
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
