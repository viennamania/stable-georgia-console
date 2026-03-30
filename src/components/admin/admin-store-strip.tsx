"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Account } from "thirdweb/wallets";

import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import {
  STORE_ROUTE_TOGGLE_LIVE,
  STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
} from "@/lib/security/store-settings-admin";

export type AdminStoreStripItem = {
  storecode?: string;
  storeName?: string;
  companyName?: string;
  storeLogo?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
  favoriteOnAndOff?: boolean;
  clearanceSortOrder?: number;
};

type AdminStoreStripProps = {
  stores: AdminStoreStripItem[];
  selectedStorecode: string;
  onSelectStorecode: (storecode: string) => void;
  activeAccount: Account | null | undefined;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onStoreUpdate?: (storecode: string, patch: Partial<AdminStoreStripItem>) => void;
  allowAllStores?: boolean;
  allStoresValue?: string;
  allStoresLabel?: string;
  title?: string;
  emptyMessage?: string;
  stickyTopClassName?: string;
  renderStoreActions?: (store: AdminStoreStripItem) => ReactNode;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const getStoreDisplayName = (store: AdminStoreStripItem | null | undefined) => {
  return normalizeText(store?.storeName)
    || normalizeText(store?.companyName)
    || normalizeText(store?.storecode)
    || "가맹점";
};

const getStoreLogoSrc = (store: AdminStoreStripItem | null | undefined) => {
  return normalizeText(store?.storeLogo) || "/logo.png";
};

const getSortOrder = (store: AdminStoreStripItem) => {
  const value = Number(store.clearanceSortOrder);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return Number.MAX_SAFE_INTEGER;
};

const compareStoresForStrip = (left: AdminStoreStripItem, right: AdminStoreStripItem) => {
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

const StoreLogo = ({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) => (
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

export default function AdminStoreStrip({
  stores,
  selectedStorecode,
  onSelectStorecode,
  activeAccount,
  loading = false,
  error = "",
  onRefresh,
  onStoreUpdate,
  allowAllStores = true,
  allStoresValue = "",
  allStoresLabel = "전체 가맹점",
  title = "가맹점 목록",
  emptyMessage = "가맹점 목록이 없습니다.",
  stickyTopClassName = "top-[10.75rem] sm:top-[11.25rem] lg:top-4",
  renderStoreActions,
}: AdminStoreStripProps) {
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(true);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingLiveStorecode, setPendingLiveStorecode] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const syncViewport = () => {
      const mobile = mediaQuery.matches;
      setIsMobileViewport(mobile);
      if (mobile) {
        setIsMobileSheetOpen(false);
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);

    return () => {
      mediaQuery.removeEventListener("change", syncViewport);
    };
  }, []);

  const normalizedSelectedStorecode = normalizeText(selectedStorecode);
  const normalizedSearchKeyword = searchKeyword.trim().toLowerCase();
  const visibleStores = useMemo(
    () => stores
      .filter((store) => store.viewOnAndOff !== false)
      .sort(compareStoresForStrip),
    [stores],
  );
  const filteredStores = useMemo(() => {
    if (!normalizedSearchKeyword) {
      return visibleStores;
    }

    return visibleStores.filter((store) => {
      const searchable = [
        normalizeText(store.storecode),
        getStoreDisplayName(store),
      ].join(" ").toLowerCase();
      return searchable.includes(normalizedSearchKeyword);
    });
  }, [normalizedSearchKeyword, visibleStores]);

  const selectedStore = useMemo(() => {
    if (!normalizedSelectedStorecode || normalizedSelectedStorecode === normalizeText(allStoresValue)) {
      return null;
    }

    return stores.find((store) => normalizeText(store.storecode) === normalizedSelectedStorecode) || null;
  }, [allStoresValue, normalizedSelectedStorecode, stores]);

  const visibleStoreCount = visibleStores.length;
  const liveStoreCount = useMemo(
    () => visibleStores.filter((store) => store.liveOnAndOff !== false).length,
    [visibleStores],
  );

  const toggleStoreLive = useCallback(async (store: AdminStoreStripItem) => {
    if (!activeAccount?.address) {
      setActionError("관리자 지갑을 연결해야 운영상태를 변경할 수 있습니다.");
      return;
    }

    const storecode = normalizeText(store.storecode);
    if (!storecode) {
      setActionError("가맹점 코드가 없어 운영상태를 변경할 수 없습니다.");
      return;
    }

    const nextValue = store.liveOnAndOff === false;
    setActionError("");
    setPendingLiveStorecode(storecode);

    try {
      const signedBody = await createAdminSignedBody({
        account: activeAccount,
        route: STORE_ROUTE_TOGGLE_LIVE,
        signingPrefix: STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
        requesterStorecode: "admin",
        requesterWalletAddress: activeAccount.address,
        actionFields: {
          storecode,
          liveOnAndOff: nextValue,
        },
      });

      const response = await fetch("/api/bff/admin/signed-store-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: STORE_ROUTE_TOGGLE_LIVE,
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "가맹점 운영상태 변경에 실패했습니다.");
      }

      onStoreUpdate?.(storecode, { liveOnAndOff: nextValue });
    } catch (toggleError) {
      setActionError(
        toggleError instanceof Error ? toggleError.message : "가맹점 운영상태 변경에 실패했습니다.",
      );
    } finally {
      setPendingLiveStorecode("");
    }
  }, [activeAccount, onStoreUpdate]);

  const combinedError = normalizeText(error) || actionError;
  const isAllStoresSelected =
    !selectedStore && normalizedSelectedStorecode === normalizeText(allStoresValue);
  const mobileSummaryLabel = selectedStore
    ? getStoreDisplayName(selectedStore)
    : isAllStoresSelected
      ? allStoresLabel
      : "가맹점 선택";
  const mobileSummaryDescription = selectedStore
    ? (normalizeText(selectedStore.storecode) || "선택된 가맹점")
    : `가맹점 ${NUMBER_FORMATTER.format(visibleStoreCount)}개 · 운영중 ${NUMBER_FORMATTER.format(liveStoreCount)}개`;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <>
      <div className={`pointer-events-none fixed inset-x-0 z-40 ${stickyTopClassName}`}>
        <div className="mx-auto w-full max-w-[1880px] px-4 sm:px-5 lg:px-8">
          <div className="pointer-events-auto lg:ml-[272px]">
            <div className="lg:hidden">
              <div className="console-panel rounded-[18px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(249,252,255,0.98),rgba(240,247,255,0.94))] px-3 py-2 shadow-[0_14px_34px_-30px_rgba(14,165,233,0.28)] backdrop-blur">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMobileSheetOpen(true)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {selectedStore ? (
                      <StoreLogo
                        src={getStoreLogoSrc(selectedStore)}
                        alt={getStoreDisplayName(selectedStore)}
                        className="h-8 w-8 shrink-0 rounded-2xl border border-sky-100 bg-sky-50/70"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {isAllStoresSelected ? "All" : "List"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold text-slate-950">
                        {mobileSummaryLabel}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-500">
                        {mobileSummaryDescription}
                      </div>
                    </div>
                  </button>

                  {onRefresh ? (
                    <button
                      type="button"
                      onClick={onRefresh}
                      className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    >
                      새로고침
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setIsMobileSheetOpen(true)}
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                  >
                    목록
                  </button>
                </div>
              </div>
            </div>

            <div className="hidden lg:block">
              <aside className="console-panel w-full overflow-hidden rounded-[22px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(249,252,255,0.98),rgba(240,247,255,0.94))] shadow-[0_16px_40px_-34px_rgba(14,165,233,0.34)] backdrop-blur">
                <div className="max-h-[calc(100vh-13.5rem)] overflow-y-auto overscroll-y-contain lg:max-h-none lg:overflow-visible">
                  <div className="border-b border-sky-100/80 px-3 py-2.5 sm:px-3.5 sm:py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <h2 className="console-display text-[1.08rem] font-semibold tracking-[-0.05em] text-slate-950 sm:text-[1.15rem]">
                          {title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                            가맹점 {NUMBER_FORMATTER.format(visibleStoreCount)}개
                          </span>
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-700">
                            운영중 {NUMBER_FORMATTER.format(liveStoreCount)}개
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {selectedStore ? (
                          <div className="hidden min-w-[190px] items-center gap-2 rounded-[18px] border border-slate-200/80 bg-white/85 px-2.5 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] lg:flex">
                            <StoreLogo
                              src={getStoreLogoSrc(selectedStore)}
                              alt={getStoreDisplayName(selectedStore)}
                              className="h-8 w-8 shrink-0 rounded-2xl border border-sky-100 bg-sky-50/70"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-semibold text-slate-950">
                                {getStoreDisplayName(selectedStore)}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-slate-500">
                                {normalizeText(selectedStore.storecode) || "-"}
                              </div>
                            </div>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              selectedStore.liveOnAndOff === false
                                ? "border-slate-200 bg-slate-50 text-slate-600"
                                : "border-sky-200 bg-sky-50 text-sky-700"
                            }`}>
                              {selectedStore.liveOnAndOff === false ? "중지됨" : "운영중"}
                            </span>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setIsDesktopExpanded((prev) => !prev)}
                          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                        >
                          {isDesktopExpanded ? "목록 접기" : "목록 펼치기"}
                        </button>
                        {onRefresh ? (
                          <button
                            type="button"
                            onClick={onRefresh}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            새로고침
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isDesktopExpanded ? (
                      <div className="mt-2">
                        <input
                          value={searchKeyword}
                          onChange={(event) => setSearchKeyword(event.target.value)}
                          placeholder="storecode / 가맹점명 검색"
                          className="h-9 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-[13px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                        />
                      </div>
                    ) : null}

                    {combinedError ? (
                      <div className="mt-3 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        {combinedError}
                      </div>
                    ) : null}
                  </div>

                  {isDesktopExpanded ? (
                    <div className="px-3 py-2.5 sm:px-3.5 sm:py-3">
                      {loading ? (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          가맹점 목록을 불러오는 중입니다...
                        </div>
                      ) : null}

                      {!loading && !combinedError && filteredStores.length === 0 ? (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                          {emptyMessage}
                        </div>
                      ) : null}

                      {!loading && !combinedError && filteredStores.length > 0 ? (
                        <div className="overflow-x-auto overscroll-x-contain">
                          <div className="flex min-w-full gap-2 pb-1">
                            {allowAllStores ? (
                              <article
                                className={`w-[162px] shrink-0 rounded-[18px] border p-2.5 transition sm:w-[184px] ${
                                  normalizedSelectedStorecode === normalizeText(allStoresValue)
                                    ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                                    : "border-slate-200/90 bg-white/90 text-slate-900 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(248,252,255,0.98),rgba(240,249,255,0.98))]"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelectStorecode(allStoresValue)}
                                  className="flex w-full items-center gap-2 text-left"
                                >
                                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border text-[9px] font-semibold uppercase tracking-[0.14em] ${
                                    normalizedSelectedStorecode === normalizeText(allStoresValue)
                                      ? "border-white/15 bg-white/10 text-white"
                                      : "border-slate-200 bg-slate-100 text-slate-500"
                                  }`}>
                                    All
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[12px] font-semibold">{allStoresLabel}</div>
                                    <div className={`mt-0.5 truncate text-[10px] ${
                                      normalizedSelectedStorecode === normalizeText(allStoresValue)
                                        ? "text-slate-300"
                                        : "text-slate-500"
                                    }`}>
                                      all stores
                                    </div>
                                  </div>
                                </button>
                              </article>
                            ) : null}

                            {filteredStores.map((store) => {
                              const storecode = normalizeText(store.storecode);
                              const selected = storecode === normalizedSelectedStorecode;
                              const storeLabel = getStoreDisplayName(store);

                              return (
                                <article
                                  key={storecode || storeLabel}
                                  className={`w-[168px] shrink-0 rounded-[18px] border p-2.5 transition sm:w-[192px] ${
                                    selected
                                      ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                                      : "border-slate-200/90 bg-white/90 text-slate-900 hover:border-sky-200 hover:bg-[linear-gradient(180deg,rgba(248,252,255,0.98),rgba(240,249,255,0.98))]"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => onSelectStorecode(storecode)}
                                    className="flex w-full items-center gap-2 text-left"
                                  >
                                    <StoreLogo
                                      src={getStoreLogoSrc(store)}
                                      alt={storeLabel}
                                      className={`h-8 w-8 shrink-0 rounded-2xl border ${
                                        selected ? "border-white/15 bg-white/10" : "border-sky-100 bg-sky-50/70"
                                      }`}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[12px] font-semibold">{storeLabel}</div>
                                      <div className={`mt-0.5 truncate text-[10px] ${selected ? "text-slate-300" : "text-slate-500"}`}>
                                        {storecode}
                                      </div>
                                    </div>
                                  </button>

                                  <div className="mt-2 flex items-center justify-between gap-2">
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

                                  <div className="mt-1.5 flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void toggleStoreLive(store);
                                      }}
                                      disabled={!activeAccount || pendingLiveStorecode === storecode}
                                      className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-[10px] font-semibold transition ${
                                        store.liveOnAndOff === false
                                          ? "border border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100"
                                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                                      } disabled:cursor-not-allowed disabled:opacity-50`}
                                    >
                                      {pendingLiveStorecode === storecode
                                        ? "처리중..."
                                        : store.liveOnAndOff === false
                                          ? "운영 시작"
                                          : "중지하기"}
                                    </button>

                                    {renderStoreActions ? (
                                      <div className="flex items-center gap-1">
                                        {renderStoreActions(store)}
                                      </div>
                                    ) : null}
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>

      {isMobileViewport && isMobileSheetOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/18 lg:hidden">
          <button
            type="button"
            aria-label="가맹점 목록 닫기"
            onClick={() => setIsMobileSheetOpen(false)}
            className="absolute inset-0"
          />
          <div className="absolute inset-x-3 bottom-3 top-[11.5rem] overflow-hidden rounded-[24px] border border-sky-100/80 bg-[linear-gradient(180deg,rgba(249,252,255,0.995),rgba(240,247,255,0.985))] shadow-[0_28px_60px_-36px_rgba(15,23,42,0.38)] backdrop-blur">
            <div className="flex h-full flex-col">
              <div className="border-b border-sky-100/80 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-semibold text-slate-950">{title}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      가맹점 {NUMBER_FORMATTER.format(visibleStoreCount)}개 · 운영중 {NUMBER_FORMATTER.format(liveStoreCount)}개
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {onRefresh ? (
                      <button
                        type="button"
                        onClick={onRefresh}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                      >
                        새로고침
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setIsMobileSheetOpen(false)}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                    >
                      닫기
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    placeholder="storecode / 가맹점명 검색"
                    className="h-10 w-full rounded-[16px] border border-slate-200 bg-white px-3 text-[13px] text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  />
                </div>

                {combinedError ? (
                  <div className="mt-3 rounded-[16px] border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                    {combinedError}
                  </div>
                ) : null}
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-2">
                  {loading ? (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      가맹점 목록을 불러오는 중입니다...
                    </div>
                  ) : null}

                  {!loading && !combinedError && filteredStores.length === 0 ? (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      {emptyMessage}
                    </div>
                  ) : null}

                  {allowAllStores ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectStorecode(allStoresValue);
                        setIsMobileSheetOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-[18px] border px-3 py-3 text-left transition ${
                        normalizedSelectedStorecode === normalizeText(allStoresValue)
                          ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                          : "border-slate-200/90 bg-white/92 text-slate-900"
                      }`}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        normalizedSelectedStorecode === normalizeText(allStoresValue)
                          ? "border-white/15 bg-white/10 text-white"
                          : "border-slate-200 bg-slate-100 text-slate-500"
                      }`}>
                        All
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{allStoresLabel}</div>
                        <div className={`mt-0.5 truncate text-[10px] ${
                          normalizedSelectedStorecode === normalizeText(allStoresValue)
                            ? "text-slate-300"
                            : "text-slate-500"
                        }`}>
                          all stores
                        </div>
                      </div>
                    </button>
                  ) : null}

                  {filteredStores.map((store) => {
                    const storecode = normalizeText(store.storecode);
                    const selected = storecode === normalizedSelectedStorecode;
                    const storeLabel = getStoreDisplayName(store);

                    return (
                      <article
                        key={storecode || storeLabel}
                        className={`rounded-[18px] border px-3 py-3 transition ${
                          selected
                            ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                            : "border-slate-200/90 bg-white/92 text-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectStorecode(storecode);
                              setIsMobileSheetOpen(false);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <StoreLogo
                              src={getStoreLogoSrc(store)}
                              alt={storeLabel}
                              className={`h-9 w-9 shrink-0 rounded-2xl border ${
                                selected ? "border-white/15 bg-white/10" : "border-sky-100 bg-sky-50/70"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold">{storeLabel}</div>
                              <div className={`mt-0.5 truncate text-[10px] ${selected ? "text-slate-300" : "text-slate-500"}`}>
                                {storecode}
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              void toggleStoreLive(store);
                            }}
                            disabled={!activeAccount || pendingLiveStorecode === storecode}
                            className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full px-2.5 text-[10px] font-semibold transition ${
                              store.liveOnAndOff === false
                                ? "border border-sky-200 bg-sky-50 text-sky-700"
                                : "border border-slate-200 bg-slate-50 text-slate-700"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {pendingLiveStorecode === storecode
                              ? "처리중..."
                              : store.liveOnAndOff === false
                                ? "운영 시작"
                                : "중지하기"}
                          </button>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-2">
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

                          {renderStoreActions ? (
                            <div className="flex items-center gap-1">
                              {renderStoreActions(store)}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
    ,
    portalTarget,
  );
}
