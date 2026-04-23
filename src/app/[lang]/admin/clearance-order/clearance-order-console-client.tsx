"use client";

import * as Ably from "ably";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import {
  BANKTRANSFER_ABLY_CHANNEL,
  BANKTRANSFER_ABLY_EVENT_NAME,
  type BankTransferDashboardEvent,
} from "@/lib/realtime/banktransfer";
import { STORE_SETTINGS_MUTATION_SIGNING_PREFIX } from "@/lib/security/store-settings-admin";
import { thirdwebClient } from "@/lib/thirdweb-client";

const ClearanceOrderEmbeddedStream = dynamic(
  () => import("./clearance-order-embedded-stream"),
  {
    ssr: false,
    loading: () => (
      <div className="console-panel rounded-[30px] border border-slate-200/80 bg-white/95 px-6 py-8 text-sm text-slate-500">
        청산주문 스트림을 준비하는 중입니다...
      </div>
    ),
  },
);

type BankInfo = {
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  realAccountNumber?: string;
};

type StoreListItem = {
  storecode?: string;
  storeName?: string;
  companyName?: string;
  storeLogo?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
  favoriteOnAndOff?: boolean;
  clearanceSortOrder?: number;
};

type StoreDetail = StoreListItem & {
  bankInfo?: BankInfo;
  bankInfoAAA?: BankInfo;
  bankInfoBBB?: BankInfo;
  bankInfoCCC?: BankInfo;
  bankInfoDDD?: BankInfo;
  withdrawalBankInfo?: BankInfo;
  withdrawalBankInfoAAA?: BankInfo;
  withdrawalBankInfoBBB?: BankInfo;
  privateSaleWalletAddress?: string;
  sellerWalletAddress?: string;
  settlementWalletAddress?: string;
  adminWalletAddress?: string;
};

type SellerBankBalanceSummary = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  balance: number | null;
};

type StoreContextResult = {
  store: StoreDetail | null;
  storeError?: string;
  hasPrivilegedStoreRead?: boolean;
  storeReadMessage?: string;
  rate?: number;
};

const STORECODE_QUERY_KEY = "storecode";
const SET_BUY_ORDER_FOR_CLEARANCE_SIGNING_PREFIX =
  "stable-georgia:set-buy-order-for-clearance:v1";
const BUYER_BANK_BALANCE_POLL_INTERVAL_MS = 60_000;
const BUYER_BANK_BALANCE_FALLBACK_POLL_INTERVAL_MS = 15_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SUMMARY_VALUE_ANIMATION_MS = 700;
const EMPTY_STORES: StoreListItem[] = [];
const EMPTY_SELLER_BANK_BALANCES: SellerBankBalanceSummary[] = [];
const BANK_OPTION_TONE_STYLES = {
  sky: {
    selectedContainer:
      "border-sky-300/90 bg-[linear-gradient(180deg,rgba(224,242,254,0.92),rgba(255,255,255,0.98))] shadow-[0_18px_32px_-24px_rgba(14,165,233,0.72)]",
    idleContainer:
      "border-slate-200/80 bg-white/90 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))]",
    badgeSelected: "bg-sky-100 text-sky-700",
    badgeIdle: "border border-sky-100 bg-white/85 text-sky-700",
    dotSelected: "bg-sky-500",
    dotIdle: "bg-sky-200",
    label: "text-sky-700",
  },
  emerald: {
    selectedContainer:
      "border-emerald-300/90 bg-[linear-gradient(180deg,rgba(220,252,231,0.88),rgba(255,255,255,0.98))] shadow-[0_18px_32px_-24px_rgba(16,185,129,0.68)]",
    idleContainer:
      "border-slate-200/80 bg-white/90 hover:border-emerald-200 hover:bg-[linear-gradient(180deg,rgba(236,253,245,0.88),rgba(255,255,255,0.98))]",
    badgeSelected: "bg-emerald-100 text-emerald-700",
    badgeIdle: "border border-emerald-100 bg-white/85 text-emerald-700",
    dotSelected: "bg-emerald-500",
    dotIdle: "bg-emerald-200",
    label: "text-emerald-700",
  },
} as const;

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const USDT_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

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

const normalizeWalletAddress = (value: unknown) => {
  return normalizeText(value).toLowerCase();
};

const normalizeAccountNumber = (value: unknown) => {
  return normalizeText(value).replace(/[\s-]/g, "");
};

const shortAddress = (value: unknown) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "-";
  }

  if (normalized.length <= 14) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const formatKrwValue = (value: unknown) => {
  const safeValue = Number(value || 0);
  if (!Number.isFinite(safeValue)) {
    return NUMBER_FORMATTER.format(0);
  }
  return NUMBER_FORMATTER.format(Math.round(safeValue));
};

const easeOutQuart = (progress: number) => {
  return 1 - ((1 - progress) ** 4);
};

const useAnimatedNumber = (
  value: number | null | undefined,
  durationMs = SUMMARY_VALUE_ANIMATION_MS,
  options?: { initialValue?: number | null },
) => {
  const targetValue = Number(value || 0);
  const safeTargetValue = Number.isFinite(targetValue) ? targetValue : 0;
  const initialValue = Number(options?.initialValue);
  const safeInitialValue = Number.isFinite(initialValue) ? initialValue : safeTargetValue;
  const [animatedValue, setAnimatedValue] = useState(safeInitialValue);
  const animatedValueRef = useRef(safeInitialValue);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const startValue = animatedValueRef.current;
    if (Math.abs(startValue - safeTargetValue) < 0.0005) {
      animatedValueRef.current = safeTargetValue;
      setAnimatedValue(safeTargetValue);
      return;
    }

    if (
      typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      animatedValueRef.current = safeTargetValue;
      setAnimatedValue(safeTargetValue);
      return;
    }

    const startTime = performance.now();

    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startTime) / durationMs);
      const easedProgress = easeOutQuart(progress);
      const nextValue = startValue + ((safeTargetValue - startValue) * easedProgress);
      animatedValueRef.current = nextValue;
      setAnimatedValue(nextValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      animatedValueRef.current = safeTargetValue;
      setAnimatedValue(safeTargetValue);
      animationFrameRef.current = null;
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [durationMs, safeTargetValue]);

  return animatedValue;
};

const formatUsdtValue = (value: unknown) => {
  const safeValue = Number(value || 0);
  if (!Number.isFinite(safeValue)) {
    return USDT_FORMATTER.format(0);
  }
  return USDT_FORMATTER.format(safeValue);
};

const normalizeKrwInput = (value: unknown) => {
  return String(value || "").replace(/[^\d]/g, "");
};

const formatKrwInputValue = (value: unknown) => {
  const normalized = normalizeKrwInput(value);
  if (!normalized) {
    return "";
  }

  return NUMBER_FORMATTER.format(Number.parseInt(normalized, 10) || 0);
};

const formatBankLabel = (bankInfo: BankInfo | null | undefined) => {
  const bankName = normalizeText(bankInfo?.bankName);
  const accountHolder = normalizeText(bankInfo?.accountHolder);
  return [bankName, accountHolder].filter(Boolean).join(" · ") || "은행정보 없음";
};

const formatBankAccount = (bankInfo: BankInfo | null | undefined) => {
  return normalizeAccountNumber(bankInfo?.realAccountNumber || bankInfo?.accountNumber) || "-";
};

const getStoreDisplayName = (store: StoreListItem | StoreDetail | null | undefined) => {
  return normalizeText(store?.storeName)
    || normalizeText(store?.companyName)
    || normalizeText(store?.storecode)
    || "가맹점";
};

const getStoreLogoSrc = (store: StoreListItem | StoreDetail | null | undefined) => {
  return normalizeText(store?.storeLogo) || "/logo.png";
};

const getSortOrder = (store: StoreListItem) => {
  const value = Number(store.clearanceSortOrder);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return Number.MAX_SAFE_INTEGER;
};

const compareStoresForSidebar = (left: StoreListItem, right: StoreListItem) => {
  const orderDiff = getSortOrder(left) - getSortOrder(right);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  const favoriteDiff =
    Number(Boolean(right.favoriteOnAndOff)) - Number(Boolean(left.favoriteOnAndOff));
  if (favoriteDiff !== 0) {
    return favoriteDiff;
  }

  return getStoreDisplayName(left).localeCompare(getStoreDisplayName(right), "ko-KR", {
    sensitivity: "base",
  });
};

const getUniqueBankOptions = (
  candidates: Array<BankInfo | null | undefined>,
) => {
  const seen = new Set<string>();
  const next: BankInfo[] = [];

  for (const candidate of candidates) {
    const accountNumber = formatBankAccount(candidate);
    if (accountNumber === "-") {
      continue;
    }

    const key = [
      normalizeText(candidate?.bankName),
      normalizeText(candidate?.accountHolder),
      accountNumber,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    next.push({
      bankName: normalizeText(candidate?.bankName),
      accountHolder: normalizeText(candidate?.accountHolder),
      accountNumber: normalizeText(candidate?.accountNumber),
      realAccountNumber: normalizeText(candidate?.realAccountNumber),
    });
  }

  return next;
};

const getBuyerBankOptions = (store: StoreDetail | null) => {
  return getUniqueBankOptions([
    store?.bankInfo,
    store?.bankInfoAAA,
    store?.bankInfoBBB,
    store?.bankInfoCCC,
    store?.bankInfoDDD,
  ]);
};

const getSellerBankOptions = (store: StoreDetail | null) => {
  return getUniqueBankOptions([
    store?.withdrawalBankInfo,
    store?.withdrawalBankInfoAAA,
    store?.withdrawalBankInfoBBB,
  ]);
};

const hasSameBankAccount = (left: BankInfo | null | undefined, right: BankInfo | null | undefined) => {
  return formatBankAccount(left) === formatBankAccount(right);
};

const StoreLogo = ({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) => {
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{
        backgroundImage: `url(${src})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    />
  );
};

const BankOptionCard = ({
  bankInfo,
  selected,
  onClick,
  tone,
}: {
  bankInfo: BankInfo;
  selected: boolean;
  onClick: () => void;
  tone: keyof typeof BANK_OPTION_TONE_STYLES;
}) => {
  const toneStyle = BANK_OPTION_TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[20px] border px-3.5 py-3 text-left transition ${
        selected
          ? toneStyle.selectedContainer
          : toneStyle.idleContainer
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                selected ? toneStyle.dotSelected : toneStyle.dotIdle
              }`}
              aria-hidden="true"
            />
            <div className="truncate text-[13px] font-semibold tracking-[-0.03em] text-slate-950">
              {(normalizeText(bankInfo.bankName) || "은행명 없음")
                + " / "
                + (normalizeText(bankInfo.accountHolder) || "예금주 없음")}
            </div>
          </div>
          <div className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneStyle.label}`}>
            Payment account
          </div>
          <div className="console-mono mt-1 truncate text-[12px] font-semibold tracking-[-0.04em] text-slate-600">
            {formatBankAccount(bankInfo)}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
            selected
              ? toneStyle.badgeSelected
              : toneStyle.badgeIdle
          }`}
        >
          {selected ? "Selected" : "Select"}
        </span>
      </div>
    </button>
  );
};

const SellerBankBalanceCard = ({
  item,
}: {
  item: SellerBankBalanceSummary;
}) => {
  const animatedBalance = useAnimatedNumber(item.balance ?? 0, SUMMARY_VALUE_ANIMATION_MS, {
    initialValue: 0,
  });

  return (
    <article className="rounded-[16px] border border-emerald-100/90 bg-[linear-gradient(180deg,_rgba(244,253,249,0.98),_rgba(255,255,255,0.96))] px-2.5 py-2.5 shadow-[0_18px_36px_-30px_rgba(5,150,105,0.24)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Live
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <div className="truncate text-[13px] font-semibold tracking-[-0.02em] text-slate-950">
              {item.bankName}
            </div>
            <span className="shrink-0 text-[8px] text-slate-300">/</span>
            <div className="truncate text-[13px] font-semibold tracking-[-0.02em] text-slate-950">
              {item.accountHolder}
            </div>
          </div>
          <div className="console-mono mt-1 truncate text-[10px] font-semibold tracking-[-0.04em] text-slate-600">
            {item.accountNumber}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!item.accountNumber || item.accountNumber === "-") {
              return;
            }
            void navigator.clipboard?.writeText(item.accountNumber);
          }}
          className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!item.accountNumber || item.accountNumber === "-"}
        >
          복사
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] border border-emerald-100 bg-emerald-50/80 px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
          잔고
        </span>
        <span
          className="console-mono truncate text-right text-[15px] font-bold leading-none tracking-[-0.04em] text-emerald-700"
          style={{ fontFamily: "monospace" }}
          title={item.balance === null ? "잔고정보없음" : formatKrwValue(item.balance)}
        >
          {item.balance === null ? "잔고정보없음" : formatKrwValue(animatedBalance)}
        </span>
      </div>
    </article>
  );
};

export default function ClearanceOrderConsoleClient({ lang }: { lang: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeAccount = useActiveAccount();
  const selectedStorecodeFromQuery = searchParams?.get(STORECODE_QUERY_KEY) || "";
  const searchParamsString = searchParams?.toString() || "";

  const [stores, setStores] = useState<StoreListItem[]>(EMPTY_STORES);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedStorecode, setSelectedStorecode] = useState("");
  const [updatingOrderStorecode, setUpdatingOrderStorecode] = useState("");
  const [orderSaveError, setOrderSaveError] = useState("");
  const [storeContext, setStoreContext] = useState<StoreContextResult | null>(null);
  const [storeContextLoading, setStoreContextLoading] = useState(false);
  const [storeContextError, setStoreContextError] = useState("");
  const [sellerBankBalances, setSellerBankBalances] = useState<SellerBankBalanceSummary[]>(EMPTY_SELLER_BANK_BALANCES);
  const [sellerBankBalancesLoading, setSellerBankBalancesLoading] = useState(false);
  const [sellerBankBalancesError, setSellerBankBalancesError] = useState("");
  const [buyerBankInfo, setBuyerBankInfo] = useState<BankInfo | null>(null);
  const [sellerBankInfo, setSellerBankInfo] = useState<BankInfo | null>(null);
  const [krwAmountInput, setKrwAmountInput] = useState("");
  const [rate, setRate] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [createdTradeId, setCreatedTradeId] = useState("");
  const [copiedTradeId, setCopiedTradeId] = useState("");
  const [embeddedRefreshKey, setEmbeddedRefreshKey] = useState(0);
  const [buyerBankBalanceDate, setBuyerBankBalanceDate] = useState(createInputDate(0));
  const buyerBankBalanceAblyClientIdRef = useRef(`console-clearance-order-${Math.random().toString(36).slice(2, 10)}`);
  const lastBuyerBankBalanceEventIdRef = useRef("");
  const storeContextRequestIdRef = useRef(0);
  const sellerBankBalancesRequestIdRef = useRef(0);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSellerBankBalances = useMemo(
    () => sellerBankBalances.filter((item) => Number(item.balance || 0) > 0),
    [sellerBankBalances],
  );
  const visibleStores = useMemo(
    () => [...stores]
      .filter((store) => store.viewOnAndOff !== false)
      .sort(compareStoresForSidebar),
    [stores],
  );
  const filteredStores = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return visibleStores;
    }

    return visibleStores
      .filter((store) => {
        const searchable = [
          getStoreDisplayName(store),
          normalizeText(store.storecode),
        ].join(" ").toLowerCase();
        return searchable.includes(normalizedKeyword);
      });
  }, [searchKeyword, visibleStores]);
  const storePositionMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleStores.forEach((store, index) => {
      map.set(normalizeText(store.storecode), index);
    });
    return map;
  }, [visibleStores]);
  const isTodayBuyerBankBalanceDate = buyerBankBalanceDate === createInputDate(0);

  const fetchStores = useCallback(async () => {
    setStoresLoading(true);
    setStoresError("");

    try {
      const response = await fetch("/api/bff/admin/clearance-store-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          limit: 300,
          page: 1,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load stores");
      }

      const nextStores = Array.isArray(payload?.result?.stores)
        ? payload.result.stores
            .filter((item: StoreListItem) => Boolean(normalizeText(item.storecode)))
        : EMPTY_STORES;

      setStores(nextStores);
    } catch (error) {
      setStores([]);
      setStoresError(error instanceof Error ? error.message : "가맹점 목록을 불러오지 못했습니다.");
    } finally {
      setStoresLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    if (!stores.length) {
      setSelectedStorecode("");
      return;
    }

    const hasQueryStore = visibleStores.some((store) => normalizeText(store.storecode) === selectedStorecodeFromQuery);
    if (hasQueryStore) {
      setSelectedStorecode(selectedStorecodeFromQuery);
      return;
    }

    setSelectedStorecode((prev) => {
      if (prev && visibleStores.some((store) => normalizeText(store.storecode) === prev)) {
        return prev;
      }
      return "";
    });
  }, [selectedStorecodeFromQuery, stores.length, visibleStores]);

  useEffect(() => {
    if (!selectedStorecode) {
      return;
    }

    if (selectedStorecodeFromQuery === selectedStorecode) {
      return;
    }

    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.set(STORECODE_QUERY_KEY, selectedStorecode);
    nextParams.set("page", "1");
    router.replace(`/${lang}/admin/clearance-order?${nextParams.toString()}`);
  }, [lang, router, searchParamsString, selectedStorecode, selectedStorecodeFromQuery]);

  useEffect(() => {
    setActionError("");
    setActionSuccess("");
    setCreatedTradeId("");
    setCopiedTradeId("");
    setKrwAmountInput("");
  }, [selectedStorecode]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const loadStoreContext = useCallback(async () => {
    const requestId = ++storeContextRequestIdRef.current;

    if (!selectedStorecode) {
      setStoreContext(null);
      setStoreContextError("");
      setRate(0);
      setStoreContextLoading(false);
      return;
    }

    setStoreContextLoading(true);
    setStoreContextError("");

    try {
      let signedStoreBody: Record<string, unknown> | null = null;

      if (activeAccount?.address) {
        try {
          signedStoreBody = await createCenterStoreAdminSignedBody({
            account: activeAccount,
            route: "/api/store/getOneStore",
            storecode: selectedStorecode,
            requesterWalletAddress: activeAccount.address,
            body: {
              storecode: selectedStorecode,
            },
          });
        } catch {}
      }

      const response = await fetch("/api/bff/admin/clearance-order-store-context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          storecode: selectedStorecode,
          signedStoreBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load clearance store context");
      }

      if (requestId !== storeContextRequestIdRef.current) {
        return;
      }

      const result = (payload?.result || {}) as StoreContextResult;
      setStoreContext({
        store: result.store || null,
        storeError: normalizeText(result.storeError),
        hasPrivilegedStoreRead: result.hasPrivilegedStoreRead === true,
        storeReadMessage: normalizeText(result.storeReadMessage),
        rate: Number(result.rate || 0),
      });
      setRate(Number(result.rate || 0));
    } catch (error) {
      if (requestId !== storeContextRequestIdRef.current) {
        return;
      }

      setStoreContext(null);
      setRate(0);
      setStoreContextError(
        error instanceof Error ? error.message : "가맹점 청산 정보를 불러오지 못했습니다.",
      );
    } finally {
      if (requestId === storeContextRequestIdRef.current) {
        setStoreContextLoading(false);
      }
    }
  }, [activeAccount, selectedStorecode]);

  useEffect(() => {
    void loadStoreContext();
  }, [loadStoreContext]);

  const loadSellerBankBalances = useCallback(async () => {
    const requestId = ++sellerBankBalancesRequestIdRef.current;

    if (!activeAccount) {
      setSellerBankBalances(EMPTY_SELLER_BANK_BALANCES);
      setSellerBankBalancesError("");
      setSellerBankBalancesLoading(false);
      return;
    }

    setSellerBankBalancesLoading(true);
    setSellerBankBalancesError("");

    try {
      const signedBody = await createCenterStoreAdminSignedBody({
        account: activeAccount,
        route: "/api/order/getClearanceSellerBankBalanceSummary",
        storecode: "admin",
        requesterWalletAddress: activeAccount.address,
        body: {
          storecode: "",
          privateSale: false,
          fromDate: buyerBankBalanceDate,
          toDate: buyerBankBalanceDate,
        },
      });

      const response = await fetch("/api/bff/admin/clearance-seller-bank-balance-summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "구매자 통장 잔고를 불러오지 못했습니다.");
      }

      const nextBalances = Array.isArray(payload?.result?.items)
        ? payload.result.items.map((item: Record<string, unknown>) => ({
            bankName: normalizeText(item.bankName) || "은행명 없음",
            accountHolder: normalizeText(item.accountHolder) || "예금주 없음",
            accountNumber:
              normalizeText(item.accountNumber)
              || normalizeText(item.realAccountNumber)
              || normalizeText(item._id)
              || "-",
            balance: Number.isFinite(Number(item.balance)) ? Number(item.balance) : null,
          }))
        : EMPTY_SELLER_BANK_BALANCES;

      if (requestId !== sellerBankBalancesRequestIdRef.current) {
        return;
      }

      setSellerBankBalances(nextBalances);
    } catch (error) {
      if (requestId !== sellerBankBalancesRequestIdRef.current) {
        return;
      }

      setSellerBankBalances(EMPTY_SELLER_BANK_BALANCES);
      setSellerBankBalancesError(
        error instanceof Error ? error.message : "구매자 통장 잔고를 불러오지 못했습니다.",
      );
    } finally {
      if (requestId === sellerBankBalancesRequestIdRef.current) {
        setSellerBankBalancesLoading(false);
      }
    }
  }, [activeAccount, buyerBankBalanceDate]);

  useEffect(() => {
    void loadSellerBankBalances();
  }, [embeddedRefreshKey, loadSellerBankBalances]);

  useEffect(() => {
    if (!activeAccount) {
      return;
    }

    const interval = setInterval(() => {
      void loadSellerBankBalances();
    }, isTodayBuyerBankBalanceDate
      ? BUYER_BANK_BALANCE_POLL_INTERVAL_MS
      : BUYER_BANK_BALANCE_FALLBACK_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeAccount, isTodayBuyerBankBalanceDate, loadSellerBankBalances]);

  const applyRealtimeSellerBankBalance = useCallback((event: BankTransferDashboardEvent) => {
    const normalizedAccountNumber = normalizeAccountNumber(event.bankAccountNumber);
    const nextBalance = Number(event.balance);

    if (!normalizedAccountNumber || !Number.isFinite(nextBalance)) {
      return;
    }

    setSellerBankBalances((current) => {
      let changed = false;

      const next = current.map((item) => {
        if (normalizeAccountNumber(item.accountNumber) !== normalizedAccountNumber) {
          return item;
        }

        if (item.balance === nextBalance) {
          return item;
        }

        changed = true;
        return {
          ...item,
          balance: nextBalance,
        };
      });

      return changed ? next : current;
    });
  }, []);

  useEffect(() => {
    if (!activeAccount || !isTodayBuyerBankBalanceDate) {
      return;
    }

    const realtime = new Ably.Realtime({
      authUrl: `/api/bff/realtime/ably-token?stream=ops-admin&clientId=${buyerBankBalanceAblyClientIdRef.current}`,
    });
    const channel = realtime.channels.get(BANKTRANSFER_ABLY_CHANNEL);

    const onMessage = (message: Ably.Message) => {
      const event = (message.data || {}) as BankTransferDashboardEvent;
      const eventId = String(event.eventId || message.id || "").trim();
      if (eventId && lastBuyerBankBalanceEventIdRef.current === eventId) {
        return;
      }
      if (eventId) {
        lastBuyerBankBalanceEventIdRef.current = eventId;
      }

      applyRealtimeSellerBankBalance(event);
    };

    void channel.subscribe(BANKTRANSFER_ABLY_EVENT_NAME, onMessage);

    return () => {
      channel.unsubscribe(BANKTRANSFER_ABLY_EVENT_NAME, onMessage);
      realtime.close();
    };
  }, [activeAccount, applyRealtimeSellerBankBalance, isTodayBuyerBankBalanceDate]);

  const moveStoreOrder = useCallback(async (storecode: string, offset: -1 | 1) => {
    if (updatingOrderStorecode || searchKeyword.trim()) {
      return;
    }

    if (!activeAccount?.address) {
      setOrderSaveError("관리자 지갑을 연결해야 가맹점 순서를 저장할 수 있습니다.");
      return;
    }

    const currentOrder = [...visibleStores];
    const currentIndex = currentOrder.findIndex((store) => normalizeText(store.storecode) === storecode);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) {
      return;
    }

    const reordered = [...currentOrder];
    [reordered[currentIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[currentIndex],
    ];

    const reorderedWithOrder = reordered.map((store, index) => ({
      ...store,
      clearanceSortOrder: index + 1,
    }));

    const previousStores = stores;
    const nextOrderMap = new Map(
      reorderedWithOrder.map((store) => [normalizeText(store.storecode), store.clearanceSortOrder]),
    );

    setOrderSaveError("");
    setUpdatingOrderStorecode(storecode);
    setStores((prev) => prev.map((store) => ({
      ...store,
      clearanceSortOrder: nextOrderMap.get(normalizeText(store.storecode)) ?? store.clearanceSortOrder,
    })));

    try {
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route: "/api/store/updateClearanceSortOrders",
        signingPrefix: STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
        requesterStorecode: "admin",
        requesterWalletAddress: activeAccount.address,
        actionFields: {
          orders: reorderedWithOrder.map((store) => ({
            storecode: normalizeText(store.storecode),
            clearanceSortOrder: Number(store.clearanceSortOrder || 0),
          })),
        },
      });

      const response = await fetch("/api/bff/admin/signed-store-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "/api/store/updateClearanceSortOrders",
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "가맹점 순서 저장에 실패했습니다.");
      }

      setStores(reorderedWithOrder);
    } catch (error) {
      setStores(previousStores);
      setOrderSaveError(
        error instanceof Error ? error.message : "가맹점 순서 저장에 실패했습니다.",
      );
    } finally {
      setUpdatingOrderStorecode("");
    }
  }, [activeAccount, searchKeyword, stores, updatingOrderStorecode, visibleStores]);

  const selectedStore = storeContext?.store || null;
  const hasPrivilegedStoreRead = storeContext?.hasPrivilegedStoreRead === true;
  const storeSensitiveReadMessage = normalizeText(storeContext?.storeReadMessage)
    || "관리자 지갑 연결 후 구매자 계좌와 판매자 결제계좌 정보를 확인할 수 있습니다.";
  const buyerBankOptions = useMemo(
    () => (hasPrivilegedStoreRead ? getBuyerBankOptions(selectedStore) : []),
    [hasPrivilegedStoreRead, selectedStore],
  );
  const sellerBankOptions = useMemo(
    () => (hasPrivilegedStoreRead ? getSellerBankOptions(selectedStore) : []),
    [hasPrivilegedStoreRead, selectedStore],
  );
  const clearanceWalletAddress = normalizeText(
    selectedStore?.privateSaleWalletAddress || selectedStore?.sellerWalletAddress,
  );
  const buyerBankAccountKey = formatBankAccount(buyerBankInfo);
  const sellerBankAccountKey = formatBankAccount(sellerBankInfo);
  const requestedKrwAmount = Number.parseInt(normalizeKrwInput(krwAmountInput) || "0", 10) || 0;
  const requestedUsdtAmount = rate > 0 ? Number((requestedKrwAmount / rate).toFixed(3)) : 0;

  useEffect(() => {
    if (!buyerBankOptions.length) {
      setBuyerBankInfo(null);
      return;
    }

    setBuyerBankInfo((prev) => {
      if (prev && buyerBankOptions.some((item) => hasSameBankAccount(item, prev))) {
        return prev;
      }
      return buyerBankOptions[0];
    });
  }, [buyerBankOptions]);

  useEffect(() => {
    if (!sellerBankOptions.length) {
      setSellerBankInfo(null);
      return;
    }

    setSellerBankInfo((prev) => {
      if (prev && sellerBankOptions.some((item) => hasSameBankAccount(item, prev))) {
        return prev;
      }
      return sellerBankOptions[0];
    });
  }, [sellerBankOptions]);

  useEffect(() => {
    setActionError("");
  }, [
    selectedStorecode,
    rate,
    requestedKrwAmount,
    buyerBankAccountKey,
    sellerBankAccountKey,
  ]);

  const buildClearanceOrderBody = useCallback(() => {
    const normalizedWalletAddress = normalizeWalletAddress(clearanceWalletAddress);
    return {
      storecode: selectedStorecode,
      walletAddress: normalizedWalletAddress,
      sellerBankInfo: {
        bankName: normalizeText(sellerBankInfo?.bankName),
        accountNumber: formatBankAccount(sellerBankInfo),
        accountHolder: normalizeText(sellerBankInfo?.accountHolder),
      },
      usdtAmount: requestedUsdtAmount,
      krwAmount: requestedKrwAmount,
      rate: Number(rate || 0),
      privateSale: true,
      buyer: {
        bankInfo: {
          bankName: normalizeText(buyerBankInfo?.bankName),
          accountNumber: formatBankAccount(buyerBankInfo),
          accountHolder: normalizeText(buyerBankInfo?.accountHolder),
        },
      },
    };
  }, [
    buyerBankInfo,
    clearanceWalletAddress,
    rate,
    requestedKrwAmount,
    requestedUsdtAmount,
    selectedStorecode,
    sellerBankInfo,
  ]);

  const canPreviewOrder =
    Boolean(activeAccount?.address)
    && Boolean(selectedStorecode)
    && Boolean(clearanceWalletAddress)
    && requestedKrwAmount > 0
    && requestedUsdtAmount > 0
    && Boolean(buyerBankInfo)
    && Boolean(sellerBankInfo)
    && rate > 0;

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
      // Keep create-order interactions non-blocking when clipboard access fails.
    }
  }, []);

  const handleCreateOrder = useCallback(async () => {
    if (!activeAccount) {
      setActionError("관리자 지갑을 연결해야 청산주문을 생성할 수 있습니다.");
      return;
    }

    if (!canPreviewOrder) {
      setActionError("가맹점, 결제계좌, 금액을 먼저 확인해 주세요.");
      return;
    }

    setSubmitLoading(true);
    setActionError("");
    setActionSuccess("");
    setCreatedTradeId("");
    setCopiedTradeId("");

    try {
      const body = buildClearanceOrderBody();
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route: "/api/order/setBuyOrderForClearance",
        signingPrefix: SET_BUY_ORDER_FOR_CLEARANCE_SIGNING_PREFIX,
        requesterStorecode: "admin",
        requesterWalletAddress: activeAccount.address,
        actionFields: body,
      });

      const response = await fetch("/api/bff/admin/signed-order-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "/api/order/setBuyOrderForClearance",
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "청산주문 생성에 실패했습니다.");
      }

      const tradeId = normalizeText(payload?.result?.tradeId || payload?.result?.order?.tradeId);
      setCreatedTradeId(tradeId);
      setActionSuccess("청산주문이 생성되었습니다.");
      setKrwAmountInput("");
      setEmbeddedRefreshKey((prev) => prev + 1);
      void loadStoreContext();
    } catch (error) {
      setCreatedTradeId("");
      setActionError(
        error instanceof Error ? error.message : "청산주문 생성 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitLoading(false);
    }
  }, [activeAccount, buildClearanceOrderBody, canPreviewOrder, loadStoreContext]);

  return (
    <div className="console-shell relative bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_84%_12%,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#f6f9fc_0%,#edf4fb_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_12%_8%,rgba(59,130,246,0.18),transparent_22%),radial-gradient(circle_at_72%_16%,rgba(245,158,11,0.12),transparent_16%),radial-gradient(circle_at_92%_20%,rgba(16,185,129,0.14),transparent_18%)]" />
      <div className="relative mx-auto flex w-full max-w-[1520px] flex-col gap-5">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.9fr)_360px] lg:px-8 lg:py-8">
            <div className="space-y-5">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-sky-100">
                  Stable Georgia / Clearance Order Console
                </span>
                <span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-emerald-100">
                  Store scoped order workflow
                </span>
                <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-amber-100">
                  Live balance sync
                </span>
              </div>

              <div>
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  Clearance Order
                </h1>
              </div>
            </div>

            <div className="console-dark-card relative overflow-hidden rounded-[30px] p-5 text-white backdrop-blur">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_58%)]" />
              <div className="space-y-2">
                <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  Signed access
                </p>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-white">
                  Admin wallet
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
                    {activeAccount?.address
                      ? shortAddress(activeAccount.address)
                      : "지갑을 연결하면 민감정보 조회와 청산주문 생성이 열립니다."}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
          <aside className="console-panel rounded-[30px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(249,252,255,0.98),rgba(240,247,255,0.94))] p-4 lg:sticky lg:top-4 lg:h-fit lg:self-start">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  Stores
                </div>
                <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  가맹점 선택
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  void fetchStores();
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              >
                새로고침
              </button>
            </div>

            <div className="mt-4">
              <input
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
                placeholder="storecode / 가맹점명 검색"
                className="h-12 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[15px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
            </div>

            {searchKeyword.trim() ? (
              <div className="mt-3 text-xs text-amber-600">
                검색 중에는 순서 변경이 비활성화됩니다.
              </div>
            ) : null}

            {orderSaveError ? (
              <div className="mt-3 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {orderSaveError}
              </div>
            ) : null}

            <div className="mt-4 max-h-[66vh] space-y-2 overflow-y-auto pr-1">
              {storesLoading ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  가맹점 목록을 불러오는 중입니다...
                </div>
              ) : null}

              {!storesLoading && storesError ? (
                <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">
                  {storesError}
                </div>
              ) : null}

              {!storesLoading && !storesError && filteredStores.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  검색 결과가 없습니다.
                </div>
              ) : null}

              {filteredStores.map((store) => {
                const storecode = normalizeText(store.storecode);
                const selected = storecode === selectedStorecode;
                const storeLabel = getStoreDisplayName(store);
                const storeIndex = storePositionMap.get(storecode) ?? -1;
                const canMoveUp =
                  !searchKeyword.trim() && storeIndex > 0 && !updatingOrderStorecode;
                const canMoveDown =
                  !searchKeyword.trim()
                  && storeIndex >= 0
                  && storeIndex < stores.length - 1
                  && !updatingOrderStorecode;

                return (
                  <div
                    key={storecode || storeLabel}
                    className={`flex items-center gap-2 rounded-[22px] border px-3 py-3 transition ${
                      selected
                        ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                        : "border-slate-200/90 bg-white/90 text-slate-900 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(248,252,255,0.98),rgba(240,249,255,0.98))]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedStorecode(storecode)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <StoreLogo
                        src={getStoreLogoSrc(store)}
                        alt={storeLabel}
                        className={`h-12 w-12 shrink-0 rounded-2xl border ${
                          selected ? "border-white/15 bg-white/10" : "border-sky-100 bg-sky-50/70"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{storeLabel}</div>
                        <div className={`mt-1 truncate text-[11px] ${selected ? "text-slate-300" : "text-slate-500"}`}>
                          {storecode}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            store.viewOnAndOff === false
                              ? selected
                                ? "border-rose-200/40 bg-rose-400/10 text-rose-100"
                                : "border-rose-200 bg-rose-50 text-rose-700"
                              : selected
                                ? "border-emerald-200/40 bg-emerald-400/10 text-emerald-100"
                                : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}>
                            {store.viewOnAndOff === false ? "비노출" : "노출중"}
                          </span>
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                            store.liveOnAndOff === false
                              ? selected
                                ? "border-slate-300/30 bg-slate-200/10 text-slate-200"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                              : selected
                                ? "border-sky-200/40 bg-sky-400/10 text-sky-100"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                          }`}>
                            {store.liveOnAndOff === false ? "중지됨" : "운영중"}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void moveStoreOrder(storecode, -1);
                        }}
                        disabled={!canMoveUp}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-semibold transition ${
                          selected
                            ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                        } ${canMoveUp ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
                        aria-label={`${storeLabel} 위로 이동`}
                        title="위로 이동"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void moveStoreOrder(storecode, 1);
                        }}
                        disabled={!canMoveDown}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-semibold transition ${
                          selected
                            ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                        } ${canMoveDown ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}
                        aria-label={`${storeLabel} 아래로 이동`}
                        title="아래로 이동"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-[72vh] min-w-0 flex-col gap-5">
            <section className="console-panel overflow-hidden rounded-[30px] border border-emerald-100/80 bg-[linear-gradient(180deg,rgba(247,254,250,0.96),rgba(255,255,255,0.98))]">
              <div className="border-b border-emerald-100/80 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div>
                    <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
                      Buyer bank balance
                    </div>
                    <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                      구매자 통장 잔고
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    {sellerBankBalancesLoading ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-sky-700">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
                        로딩중
                      </span>
                    ) : null}
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                      {NUMBER_FORMATTER.format(visibleSellerBankBalances.length)} 계좌
                    </span>
                    <label className="flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs text-slate-600">
                      <span>날짜</span>
                      <input
                        type="date"
                        value={buyerBankBalanceDate}
                        onChange={(event) => {
                          setBuyerBankBalanceDate(event.target.value || createInputDate(0));
                        }}
                        className="rounded-md border-0 bg-transparent p-0 text-xs font-medium text-slate-700 outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        void loadSellerBankBalances();
                      }}
                      disabled={!activeAccount || sellerBankBalancesLoading}
                      className="rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      새로고침
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                {!activeAccount ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-sm leading-7 text-slate-600">
                    구매자 통장 잔고는 관리자 지갑을 연결한 뒤 서명해야 불러올 수 있습니다.
                  </div>
                ) : sellerBankBalancesLoading && visibleSellerBankBalances.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    {buyerBankBalanceDate} 거래 기준 구매자 통장 잔고를 불러오는 중입니다...
                  </div>
                ) : sellerBankBalancesError ? (
                  <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {sellerBankBalancesError}
                  </div>
                ) : !sellerBankBalancesLoading && visibleSellerBankBalances.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    {buyerBankBalanceDate} 거래 기준으로 표시할 구매자 통장 잔고가 없습니다.
                  </div>
                ) : (
                  <div className="grid justify-center gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(148px,158px))]">
                    {visibleSellerBankBalances.map((item) => (
                      <SellerBankBalanceCard
                        key={`${item.accountNumber}-${item.bankName}-${item.accountHolder}`}
                        item={item}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            {!selectedStorecode ? (
              <div className="console-panel flex min-h-[72vh] flex-col items-center justify-center rounded-[34px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(244,250,255,0.98),rgba(255,255,255,0.96))] px-6 py-10 text-center">
                <div className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                  가맹점을 선택하세요
                </div>
                <div className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
                  좌측 목록에서 가맹점을 선택하면 해당 가맹점 기준 청산주문 생성, 출금 live,
                  `Clearance stream`을 표시합니다.
                </div>
              </div>
            ) : (
              <>
                {storeContextError ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {storeContextError}
                  </div>
                ) : null}

                {storeContext?.storeError ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {storeContext.storeError}
                  </div>
                ) : null}

                {storeContext?.storeReadMessage ? (
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {storeContext.storeReadMessage}
                  </div>
                ) : null}

                <div className="space-y-4">
                  <section className="grid gap-4 xl:grid-cols-2">
                    <article className="console-panel rounded-[30px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.94),rgba(255,255,255,0.98))] p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-sky-700">
                            Buyer bank
                          </div>
                          <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                            구매자 계좌 정보
                          </h2>
                        </div>
                        {storeContextLoading ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                            불러오는 중...
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
                        {buyerBankOptions.length === 0 ? (
                          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            {hasPrivilegedStoreRead
                              ? "선택 가능한 구매자 계좌 정보가 없습니다."
                              : storeSensitiveReadMessage}
                          </div>
                        ) : (
                          buyerBankOptions.map((item) => (
                            <BankOptionCard
                              key={`buyer-${formatBankAccount(item)}`}
                              bankInfo={item}
                              selected={hasSameBankAccount(item, buyerBankInfo)}
                              onClick={() => setBuyerBankInfo(item)}
                              tone="sky"
                            />
                          ))
                        )}
                      </div>
                    </article>

                    <article className="console-panel rounded-[30px] border border-emerald-100/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.98))] p-5">
                      <div>
                        <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
                          Seller bank
                        </div>
                        <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                          판매자 결제계좌
                        </h2>
                      </div>
                      <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
                        {sellerBankOptions.length === 0 ? (
                          <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                            {hasPrivilegedStoreRead
                              ? "선택 가능한 판매자 결제계좌가 없습니다."
                              : storeSensitiveReadMessage}
                          </div>
                        ) : (
                          sellerBankOptions.map((item) => (
                            <BankOptionCard
                              key={`seller-${formatBankAccount(item)}`}
                              bankInfo={item}
                              selected={hasSameBankAccount(item, sellerBankInfo)}
                              onClick={() => setSellerBankInfo(item)}
                              tone="emerald"
                            />
                          ))
                        )}
                      </div>
                    </article>
                  </section>

                  <article className="console-panel rounded-[30px] border border-amber-100/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.92),rgba(255,255,255,0.98))] p-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">
                          Create order
                        </div>
                        <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                          청산주문 생성
                        </h2>
                      </div>
                      <div className="rounded-full border border-amber-200 bg-white/80 px-3 py-1.5 text-right text-lg font-semibold tracking-[-0.05em] text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        {rate > 0 ? `${formatKrwValue(rate)} KRW` : "Rate unavailable"}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                      <div className="grid gap-3">
                        <label className="space-y-2 text-sm">
                          <span className="font-medium text-slate-700">청산금액 (KRW)</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={krwAmountInput}
                            onChange={(event) => {
                              setKrwAmountInput(formatKrwInputValue(event.target.value));
                            }}
                            placeholder="예: 3,000,000"
                            className="h-12 w-full rounded-[18px] border border-amber-200/90 bg-white/90 px-4 text-right text-[17px] font-semibold text-slate-950 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-4 focus:ring-amber-100"
                          />
                        </label>

                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div className="rounded-[20px] border border-sky-100 bg-[linear-gradient(180deg,rgba(240,249,255,0.92),rgba(255,255,255,0.98))] px-3.5 py-3">
                            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-sky-700">
                              Buyer account
                            </div>
                            {hasPrivilegedStoreRead ? (
                              <>
                                <div className="mt-1.5 text-[13px] font-semibold tracking-[-0.03em] text-slate-950">
                                  {formatBankLabel(buyerBankInfo)}
                                </div>
                                <div className="console-mono mt-1 truncate text-[11px] font-semibold tracking-[-0.04em] text-slate-600">
                                  {formatBankAccount(buyerBankInfo)}
                                </div>
                              </>
                            ) : (
                              <div className="mt-2 text-[12px] font-medium leading-5 text-slate-500">
                                관리자 지갑 연결 후 확인 가능
                              </div>
                            )}
                          </div>
                          <div className="rounded-[20px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.9),rgba(255,255,255,0.98))] px-3.5 py-3">
                            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-700">
                              Seller account
                            </div>
                            {hasPrivilegedStoreRead ? (
                              <>
                                <div className="mt-1.5 text-[13px] font-semibold tracking-[-0.03em] text-slate-950">
                                  {formatBankLabel(sellerBankInfo)}
                                </div>
                                <div className="console-mono mt-1 truncate text-[11px] font-semibold tracking-[-0.04em] text-slate-600">
                                  {formatBankAccount(sellerBankInfo)}
                                </div>
                              </>
                            ) : (
                              <div className="mt-2 text-[12px] font-medium leading-5 text-slate-500">
                                관리자 지갑 연결 후 확인 가능
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="rounded-[22px] border border-slate-900/10 bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_60%,#0f766e_100%)] px-4 py-3.5 text-white shadow-[0_22px_48px_-26px_rgba(15,23,42,0.6)]">
                          <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-sky-100/85">
                                Estimated
                              </div>
                              <div className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-white">
                                {formatUsdtValue(requestedUsdtAmount)} USDT
                              </div>
                            </div>
                            <div className="text-right text-[13px] text-sky-50/90">
                              <div>{formatKrwValue(requestedKrwAmount)} KRW</div>
                              <div className="mt-1">청산지갑 {shortAddress(clearanceWalletAddress)}</div>
                            </div>
                          </div>
                        </div>

                        {actionError ? (
                          <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            {actionError}
                          </div>
                        ) : null}

                        {actionSuccess ? (
                          <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                            <div>{actionSuccess}</div>
                            {createdTradeId ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void copyTradeId(createdTradeId);
                                }}
                                className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-left transition hover:border-emerald-300 hover:bg-emerald-100/60"
                                title="클릭해서 청산 주문번호 복사"
                              >
                                <span className="font-semibold text-emerald-900">{createdTradeId}</span>
                                <span
                                  className={`console-mono text-[10px] uppercase tracking-[0.14em] ${
                                    copiedTradeId === createdTradeId ? "text-emerald-700" : "text-emerald-500"
                                  }`}
                                >
                                  {copiedTradeId === createdTradeId ? "copied" : "copy"}
                                </span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              void handleCreateOrder();
                            }}
                            disabled={!canPreviewOrder || submitLoading}
                            className={`clearance-order-cta rounded-full px-6 py-3 text-[15px] font-semibold text-white ${
                              !canPreviewOrder || submitLoading
                                ? "cursor-not-allowed bg-slate-300"
                                : "clearance-order-cta-ready bg-[linear-gradient(135deg,#059669_0%,#0f766e_52%,#0284c7_100%)] shadow-[0_18px_34px_-20px_rgba(5,150,105,0.6)]"
                            }`}
                          >
                            {submitLoading ? "생성중..." : "청산주문 생성"}
                          </button>
                        </div>
                      </div>
                    </div>

                  </article>
                </div>

                <ClearanceOrderEmbeddedStream
                  key={`${selectedStorecode}-${embeddedRefreshKey}`}
                  activeAccount={activeAccount}
                  storecode={selectedStorecode}
                  refreshKey={embeddedRefreshKey}
                />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
