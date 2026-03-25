"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import ClearanceManagementConsoleClient from "@/app/[lang]/admin/clearance-management/clearance-management-console-client";
import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import { thirdwebClient } from "@/lib/thirdweb-client";

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

type SellerBalanceItem = {
  nickname?: string;
  walletAddress?: string;
  currentUsdtBalance?: number;
  pendingTransferCount?: number;
  pendingTransferUsdtAmount?: number;
};

type ClearanceOrderPreview = {
  requestedKrwAmount?: number;
  requestedUsdtAmount?: number;
  rate?: number;
  kstDayLabel?: string;
  withinPerOrderLimit?: boolean;
  withinDailyLimit?: boolean;
  requesterIsAuthorizedAdmin?: boolean;
  clearanceWalletIsServerWallet?: boolean;
  currentDailyOrderCount?: number;
  currentDailyKrwAmount?: number;
  projectedDailyKrwAmount?: number;
  remainingDailyKrwAmount?: number;
  maxDailyKrwAmount?: number;
  maxKrwAmount?: number;
  canSubmit?: boolean;
  blockingReasons?: string[];
  existingActiveOrder?: {
    tradeId?: string;
    status?: string;
  } | null;
};

type StoreContextResult = {
  store: StoreDetail | null;
  storeError?: string;
  hasPrivilegedStoreRead?: boolean;
  storeReadMessage?: string;
  sellersBalance: SellerBalanceItem[];
  sellersBalanceError?: string;
  rate?: number;
  rateError?: string;
};

const STORECODE_QUERY_KEY = "storecode";
const STORE_SETTINGS_MUTATION_SIGNING_PREFIX =
  "stable-georgia:store-settings-mutation:v1";
const GET_CLEARANCE_ORDER_PREVIEW_SIGNING_PREFIX =
  "stable-georgia:get-clearance-order-preview:v1";
const SET_BUY_ORDER_FOR_CLEARANCE_SIGNING_PREFIX =
  "stable-georgia:set-buy-order-for-clearance:v1";
const EMPTY_STORES: StoreListItem[] = [];
const EMPTY_SELLER_BALANCES: SellerBalanceItem[] = [];

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
}: {
  bankInfo: BankInfo;
  selected: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
        selected
          ? "border-sky-300 bg-sky-50 shadow-[0_16px_30px_-24px_rgba(14,165,233,0.9)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            {normalizeText(bankInfo.bankName) || "은행명 없음"}
          </div>
          <div className="mt-1 break-all text-sm font-semibold text-slate-950">
            {formatBankAccount(bankInfo)}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {normalizeText(bankInfo.accountHolder) || "예금주 없음"}
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            selected
              ? "bg-sky-100 text-sky-700"
              : "border border-slate-200 bg-white text-slate-500"
          }`}
        >
          {selected ? "Selected" : "Select"}
        </span>
      </div>
    </button>
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
  const [buyerBankInfo, setBuyerBankInfo] = useState<BankInfo | null>(null);
  const [sellerBankInfo, setSellerBankInfo] = useState<BankInfo | null>(null);
  const [krwAmountInput, setKrwAmountInput] = useState("");
  const [rate, setRate] = useState(0);
  const [preview, setPreview] = useState<ClearanceOrderPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [embeddedRefreshKey, setEmbeddedRefreshKey] = useState(0);

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

    const hasQueryStore = stores.some((store) => normalizeText(store.storecode) === selectedStorecodeFromQuery);
    if (hasQueryStore) {
      setSelectedStorecode(selectedStorecodeFromQuery);
      return;
    }

    setSelectedStorecode((prev) => {
      if (prev && stores.some((store) => normalizeText(store.storecode) === prev)) {
        return prev;
      }
      return "";
    });
  }, [selectedStorecodeFromQuery, stores]);

  useEffect(() => {
    if (!selectedStorecode) {
      return;
    }

    if (selectedStorecodeFromQuery === selectedStorecode) {
      return;
    }

    const nextParams = new URLSearchParams(searchParamsString);
    nextParams.set(STORECODE_QUERY_KEY, selectedStorecode);
    router.replace(`/${lang}/admin/clearance-order?${nextParams.toString()}`);
  }, [lang, router, searchParamsString, selectedStorecode, selectedStorecodeFromQuery]);

  useEffect(() => {
    setActionError("");
    setActionSuccess("");
    setPreview(null);
    setKrwAmountInput("");
  }, [selectedStorecode]);

  const loadStoreContext = useCallback(async () => {
    if (!selectedStorecode) {
      setStoreContext(null);
      setStoreContextError("");
      setRate(0);
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

      const result = (payload?.result || {}) as StoreContextResult;
      setStoreContext({
        store: result.store || null,
        storeError: normalizeText(result.storeError),
        hasPrivilegedStoreRead: Boolean(result.hasPrivilegedStoreRead),
        storeReadMessage: normalizeText(result.storeReadMessage),
        sellersBalance: Array.isArray(result.sellersBalance) ? result.sellersBalance : EMPTY_SELLER_BALANCES,
        sellersBalanceError: normalizeText(result.sellersBalanceError),
        rate: Number(result.rate || 0),
        rateError: normalizeText(result.rateError),
      });
      setRate(Number(result.rate || 0));
    } catch (error) {
      setStoreContext(null);
      setRate(0);
      setStoreContextError(
        error instanceof Error ? error.message : "가맹점 청산 정보를 불러오지 못했습니다.",
      );
    } finally {
      setStoreContextLoading(false);
    }
  }, [activeAccount, selectedStorecode]);

  useEffect(() => {
    void loadStoreContext();
  }, [loadStoreContext]);

  const moveStoreOrder = useCallback(async (storecode: string, offset: -1 | 1) => {
    if (updatingOrderStorecode || searchKeyword.trim()) {
      return;
    }

    if (!activeAccount?.address) {
      setOrderSaveError("관리자 지갑을 연결해야 가맹점 순서를 저장할 수 있습니다.");
      return;
    }

    const currentOrder = [...stores].sort(compareStoresForSidebar);
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
  }, [activeAccount, searchKeyword, stores, updatingOrderStorecode]);

  const selectedStoreSummary = useMemo(() => {
    return stores.find((store) => normalizeText(store.storecode) === selectedStorecode) || null;
  }, [selectedStorecode, stores]);

  const selectedStore = storeContext?.store || null;
  const buyerBankOptions = useMemo(() => getBuyerBankOptions(selectedStore), [selectedStore]);
  const sellerBankOptions = useMemo(() => getSellerBankOptions(selectedStore), [selectedStore]);
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
    setPreview(null);
    setActionError("");
  }, [
    selectedStorecode,
    rate,
    requestedKrwAmount,
    buyerBankAccountKey,
    sellerBankAccountKey,
  ]);

  const filteredStores = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return [...stores].sort(compareStoresForSidebar);
    }

    return [...stores]
      .sort(compareStoresForSidebar)
      .filter((store) => {
      const searchable = [
        getStoreDisplayName(store),
        normalizeText(store.storecode),
      ].join(" ").toLowerCase();
      return searchable.includes(normalizedKeyword);
      });
  }, [searchKeyword, stores]);

  const storePositionMap = useMemo(() => {
    const map = new Map<string, number>();
    [...stores].sort(compareStoresForSidebar).forEach((store, index) => {
      map.set(normalizeText(store.storecode), index);
    });
    return map;
  }, [stores]);

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

  const handlePreview = useCallback(async () => {
    if (!activeAccount) {
      setActionError("관리자 지갑을 연결해야 청산주문을 미리 계산할 수 있습니다.");
      return;
    }

    if (!canPreviewOrder) {
      setActionError("가맹점, 결제계좌, 금액을 먼저 확인해 주세요.");
      return;
    }

    setPreviewLoading(true);
    setActionError("");
    setActionSuccess("");

    try {
      const body = buildClearanceOrderBody();
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route: "/api/order/getClearanceOrderPreview",
        signingPrefix: GET_CLEARANCE_ORDER_PREVIEW_SIGNING_PREFIX,
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
          route: "/api/order/getClearanceOrderPreview",
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "청산주문 미리보기를 불러오지 못했습니다.");
      }

      setPreview((payload?.result || null) as ClearanceOrderPreview | null);
    } catch (error) {
      setPreview(null);
      setActionError(
        error instanceof Error ? error.message : "청산주문 미리보기 중 오류가 발생했습니다.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [activeAccount, buildClearanceOrderBody, canPreviewOrder]);

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
      setActionSuccess(
        tradeId
          ? `청산주문이 생성되었습니다. tradeId ${tradeId}`
          : "청산주문이 생성되었습니다.",
      );
      setKrwAmountInput("");
      setPreview(null);
      setEmbeddedRefreshKey((prev) => prev + 1);
      void loadStoreContext();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "청산주문 생성 중 오류가 발생했습니다.",
      );
    } finally {
      setSubmitLoading(false);
    }
  }, [activeAccount, buildClearanceOrderBody, canPreviewOrder, loadStoreContext]);

  const previewBlockingReasons = Array.isArray(preview?.blockingReasons)
    ? preview?.blockingReasons.filter(Boolean)
    : [];

  return (
    <div className="console-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.9fr)_360px] lg:px-8 lg:py-8">
            <div className="space-y-5">
              <div className="console-mono flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  Stable Georgia / Clearance Order Console
                </span>
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1">
                  Store scoped order workflow
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] sm:text-6xl">
                  Clearance Order
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                  메인 `가맹점 청산관리` 흐름을 콘솔에 맞춰 옮겼습니다. 가맹점을 선택하고,
                  구매자/판매자 결제계좌를 고른 뒤 청산주문 미리보기와 생성, 출금 live,
                  `Clearance stream`까지 한 화면에서 확인할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-slate-950/66 p-5 text-white backdrop-blur">
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

        <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
          <aside className="console-panel sticky top-4 rounded-[30px] p-4">
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
                    key={storecode}
                    className={`flex items-center gap-2 rounded-[22px] border px-3 py-3 transition ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_18px_34px_-24px_rgba(15,23,42,0.75)]"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedStorecode(storecode)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <StoreLogo
                        src={getStoreLogoSrc(store)}
                        alt={storeLabel}
                        className={`h-12 w-12 shrink-0 rounded-2xl border ${
                          selected ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{storeLabel}</div>
                        <div className={`mt-1 truncate text-[11px] ${selected ? "text-slate-300" : "text-slate-500"}`}>
                          {storecode}
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
            {!selectedStorecode ? (
              <div className="console-panel flex min-h-[72vh] flex-col items-center justify-center rounded-[34px] px-6 py-10 text-center">
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
                <section className="console-panel rounded-[30px] p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                      <StoreLogo
                        src={getStoreLogoSrc(selectedStore || selectedStoreSummary)}
                        alt={getStoreDisplayName(selectedStore || selectedStoreSummary)}
                        className="h-16 w-16 shrink-0 rounded-[24px] border border-slate-200 bg-slate-50"
                      />
                      <div className="min-w-0">
                        <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                          Selected store
                        </div>
                        <div className="mt-2 truncate text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                          {getStoreDisplayName(selectedStore || selectedStoreSummary)}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {selectedStorecode}
                          </span>
                          {clearanceWalletAddress ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                              청산지갑 {shortAddress(clearanceWalletAddress)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void loadStoreContext();
                        }}
                        className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                      >
                        컨텍스트 새로고침
                      </button>
                    </div>
                  </div>

                  {storeContextError ? (
                    <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {storeContextError}
                    </div>
                  ) : null}

                  {storeContext?.storeError ? (
                    <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {storeContext.storeError}
                    </div>
                  ) : null}

                  {storeContext?.storeReadMessage ? (
                    <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      {storeContext.storeReadMessage}
                    </div>
                  ) : null}
                </section>

                <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                  <div className="space-y-5">
                    <article className="console-panel rounded-[30px] p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                            Buyer bank
                          </div>
                          <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                            구매자 계좌 정보
                          </h2>
                        </div>
                        {storeContextLoading ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                            불러오는 중...
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {buyerBankOptions.length === 0 ? (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            선택 가능한 구매자 계좌 정보가 없습니다.
                          </div>
                        ) : (
                          buyerBankOptions.map((item) => (
                            <BankOptionCard
                              key={`buyer-${formatBankAccount(item)}`}
                              bankInfo={item}
                              selected={hasSameBankAccount(item, buyerBankInfo)}
                              onClick={() => setBuyerBankInfo(item)}
                            />
                          ))
                        )}
                      </div>
                    </article>

                    <article className="console-panel rounded-[30px] p-6">
                      <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                        Seller bank
                      </div>
                      <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                        판매자 결제계좌
                      </h2>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {sellerBankOptions.length === 0 ? (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            선택 가능한 판매자 결제계좌가 없습니다.
                          </div>
                        ) : (
                          sellerBankOptions.map((item) => (
                            <BankOptionCard
                              key={`seller-${formatBankAccount(item)}`}
                              bankInfo={item}
                              selected={hasSameBankAccount(item, sellerBankInfo)}
                              onClick={() => setSellerBankInfo(item)}
                            />
                          ))
                        )}
                      </div>
                    </article>

                    <article className="console-panel rounded-[30px] p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                            Seller balance
                          </div>
                          <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                            판매자 지갑 잔고 현황
                          </h2>
                        </div>
                        {storeContext?.sellersBalanceError ? (
                          <span className="text-xs text-rose-600">{storeContext.sellersBalanceError}</span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 xl:grid-cols-2">
                        {storeContextLoading && storeContext?.sellersBalance?.length === 0 ? (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            판매자 지갑 잔고를 불러오는 중입니다...
                          </div>
                        ) : null}

                        {!storeContextLoading && (storeContext?.sellersBalance || []).length === 0 ? (
                          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                            표시할 판매자 지갑 잔고가 없습니다.
                          </div>
                        ) : null}

                        {(storeContext?.sellersBalance || []).map((item) => (
                          <div
                            key={`${normalizeText(item.walletAddress)}-${normalizeText(item.nickname)}`}
                            className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-950">
                                  {normalizeText(item.nickname) || "seller"}
                                </div>
                                <div className="console-mono mt-1 break-all text-[11px] text-slate-500">
                                  {shortAddress(item.walletAddress)}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                  USDT
                                </div>
                                <div className="mt-1 text-lg font-semibold tracking-[-0.04em] text-emerald-600">
                                  {formatUsdtValue(item.currentUsdtBalance)}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                                미전송 {formatKrwValue(item.pendingTransferCount)}건
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                                {formatUsdtValue(item.pendingTransferUsdtAmount)} USDT
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  <article className="console-panel rounded-[30px] p-6">
                    <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                      Create order
                    </div>
                    <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                      청산주문 생성
                    </h2>

                    <div className="mt-5 grid gap-4">
                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                          Rate
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                          {rate > 0 ? `${formatKrwValue(rate)} KRW` : "Rate unavailable"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          1 USDT 기준 판매 환율
                        </div>
                      </div>

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
                          className="h-14 w-full rounded-[20px] border border-slate-200 bg-slate-50 px-4 text-[18px] font-semibold text-slate-950 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                        />
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                            Buyer account
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-950">
                            {formatBankLabel(buyerBankInfo)}
                          </div>
                          <div className="mt-1 break-all text-[12px] text-slate-500">
                            {formatBankAccount(buyerBankInfo)}
                          </div>
                        </div>
                        <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                            Seller account
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-950">
                            {formatBankLabel(sellerBankInfo)}
                          </div>
                          <div className="mt-1 break-all text-[12px] text-slate-500">
                            {formatBankAccount(sellerBankInfo)}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                          <div>
                            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                              Estimated
                            </div>
                            <div className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                              {formatUsdtValue(requestedUsdtAmount)} USDT
                            </div>
                          </div>
                          <div className="text-right text-sm text-slate-500">
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
                          {actionSuccess}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            void handlePreview();
                          }}
                          disabled={!canPreviewOrder || previewLoading || submitLoading}
                          className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition ${
                            !canPreviewOrder || previewLoading || submitLoading
                              ? "cursor-not-allowed bg-slate-300"
                              : "bg-sky-600 hover:bg-sky-700"
                          }`}
                        >
                          {previewLoading ? "미리 계산중..." : "미리보기"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleCreateOrder();
                          }}
                          disabled={!canPreviewOrder || submitLoading || (preview ? preview.canSubmit === false : false)}
                          className={`rounded-full px-5 py-3 text-sm font-semibold text-white transition ${
                            !canPreviewOrder || submitLoading || (preview ? preview.canSubmit === false : false)
                              ? "cursor-not-allowed bg-slate-300"
                              : "bg-emerald-600 hover:bg-emerald-700"
                          }`}
                        >
                          {submitLoading ? "생성중..." : "청산주문 생성"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                      <div className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                        Preview
                      </div>
                      {preview ? (
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                신청금액
                              </div>
                              <div className="mt-2 text-lg font-semibold text-slate-950">
                                {formatKrwValue(preview.requestedKrwAmount)} KRW
                              </div>
                              <div className="mt-1 text-sm text-emerald-600">
                                {formatUsdtValue(preview.requestedUsdtAmount)} USDT
                              </div>
                            </div>
                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                                환율 / KST
                              </div>
                              <div className="mt-2 text-lg font-semibold text-slate-950">
                                {formatKrwValue(preview.rate)} KRW
                              </div>
                              <div className="mt-1 text-sm text-slate-500">
                                {normalizeText(preview.kstDayLabel) || "-"}
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                              <div>건별 한도 {formatKrwValue(preview.maxKrwAmount)} KRW</div>
                              <div className="mt-1">
                                상태 {preview.withinPerOrderLimit ? "통과" : "초과"}
                              </div>
                            </div>
                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                              <div>일별 잔여 {formatKrwValue(preview.remainingDailyKrwAmount)} KRW</div>
                              <div className="mt-1">
                                상태 {preview.withinDailyLimit ? "통과" : "초과"}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full px-3 py-1 ${preview.requesterIsAuthorizedAdmin ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {preview.requesterIsAuthorizedAdmin ? "admin 권한 확인" : "admin 권한 확인 실패"}
                            </span>
                            <span className={`rounded-full px-3 py-1 ${preview.clearanceWalletIsServerWallet ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                              {preview.clearanceWalletIsServerWallet ? "server wallet 확인" : "server wallet 확인 실패"}
                            </span>
                            <span className={`rounded-full px-3 py-1 ${preview.canSubmit ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>
                              {preview.canSubmit ? "제출 가능" : "제출 차단"}
                            </span>
                          </div>

                          {preview.existingActiveOrder?.tradeId ? (
                            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                              기존 활성 주문 #{preview.existingActiveOrder.tradeId} ({preview.existingActiveOrder.status || "-"})
                            </div>
                          ) : null}

                          {previewBlockingReasons.length > 0 ? (
                            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3">
                              <div className="text-sm font-semibold text-rose-800">
                                현재 상태로는 주문 제출이 차단됩니다.
                              </div>
                              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
                                {previewBlockingReasons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                              현재 조건에서는 청산주문 생성이 가능합니다.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                          금액과 계좌를 선택한 뒤 `미리보기`를 누르면 주문 가능 여부와 한도 검사를 표시합니다.
                        </div>
                      )}
                    </div>
                  </article>
                </section>

                <ClearanceManagementConsoleClient
                  key={`${selectedStorecode}-${embeddedRefreshKey}`}
                  lang={lang}
                  embedded
                  forcedStorecode={selectedStorecode}
                  hideStoreFilter
                  hideWithdrawalLiveSection
                />
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
