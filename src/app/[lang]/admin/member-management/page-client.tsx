"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import MemberManagementConsoleClient from "./member-management-console-client";
import AdminWalletCard from "@/components/admin/admin-wallet-card";

type AdminMemberManagementPageClientProps = {
  lang: string;
};

type StoreOption = {
  storecode?: string;
  storeName?: string;
  serviceName?: string;
  companyName?: string;
  storeLogo?: string;
};

const ALL_STORES_SCOPE = "__all__";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const getStoreDisplayName = (store: StoreOption | null | undefined) => {
  return normalizeString(store?.storeName)
    || normalizeString(store?.serviceName)
    || normalizeString(store?.companyName)
    || normalizeString(store?.storecode)
    || "가맹점";
};

const getStoreLogoSrc = (store: StoreOption | null | undefined) => {
  return normalizeString(store?.storeLogo) || "/logo.png";
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

export default function AdminMemberManagementPageClient({
  lang,
}: AdminMemberManagementPageClientProps) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStorecode, setSelectedStorecode] = useState("");
  const [storeSearch, setStoreSearch] = useState("");
  const [loadingStores, setLoadingStores] = useState(true);
  const [error, setError] = useState("");
  const inflightLoadRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const loadStores = useCallback(async () => {
    if (inflightLoadRef.current) {
      return;
    }

    inflightLoadRef.current = true;
    setLoadingStores(true);

    try {
      const response = await fetch("/api/bff/admin/store-directory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          startPage: 1,
          maxPages: 12,
          limit: 200,
          searchStore: "",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "가맹점 목록을 불러오지 못했습니다.");
      }

      const nextStores = Array.isArray(payload?.result?.stores) ? payload.result.stores : [];
      setStores(nextStores);
      setError("");
    } catch (loadError) {
      setStores([]);
      setError(loadError instanceof Error ? loadError.message : "가맹점 목록을 불러오지 못했습니다.");
    } finally {
      inflightLoadRef.current = false;
      setLoadingStores(false);
    }
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const filteredStores = useMemo(() => {
    const normalizedSearch = normalizeString(storeSearch).toLowerCase();
    if (!normalizedSearch) {
      return stores;
    }

    return stores.filter((store) => {
      const searchable = [
        normalizeString(store.storecode),
        getStoreDisplayName(store),
      ].join(" ").toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [storeSearch, stores]);

  const selectedScopeLabel = selectedStorecode === ALL_STORES_SCOPE
    ? "전체 가맹점"
    : selectedStorecode;

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 pb-10">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                    Admin member management
                  </div>
                  <div>
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white sm:text-[3.2rem]">
                      회원관리
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82 sm:text-[15px]">
                      가맹점 하나를 고르거나 전체 가맹점 범위로 전환한 뒤 회원 목록, 회원 추가, 등급 변경, 결제페이지 링크 생성 기능을 운영합니다.
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                  <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
                  {loadingStores ? "Loading store options" : "Store selector ready"}
                </div>
              </div>

              <div className="console-panel rounded-[30px] bg-white/95 p-5 text-slate-950">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[260px] flex-1">
                    <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      Store selector
                    </div>
                    <input
                      value={storeSearch}
                      onChange={(event) => setStoreSearch(event.target.value)}
                      placeholder="storecode / 가맹점명 검색"
                      className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                      disabled={loadingStores}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void loadStores();
                    }}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    새로고침
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setSelectedStorecode(ALL_STORES_SCOPE)}
                    className={`rounded-[24px] border px-4 py-4 text-left transition ${
                      selectedStorecode === ALL_STORES_SCOPE
                        ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                        : "border-slate-200 bg-slate-50 hover:border-sky-200 hover:bg-sky-50"
                    }`}
                  >
                    <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-current/70">
                      All stores
                    </div>
                    <div className="mt-2 text-lg font-semibold tracking-[-0.04em]">
                      전체 가맹점
                    </div>
                    <div className="mt-1 text-sm text-current/75">
                      전체 회원을 한 번에 조회하고 가맹점 조건까지 함께 검색합니다.
                    </div>
                  </button>

                  {filteredStores.map((store) => {
                    const storecode = normalizeString(store.storecode);
                    const selected = selectedStorecode === storecode;
                    const storeName = getStoreDisplayName(store);

                    return (
                      <button
                        key={storecode}
                        type="button"
                        onClick={() => setSelectedStorecode(storecode)}
                        className={`rounded-[24px] border px-4 py-4 text-left transition ${
                          selected
                            ? "border-transparent bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_54%,#0f766e_100%)] text-white shadow-[0_22px_42px_-24px_rgba(37,99,235,0.52)]"
                            : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <StoreLogo
                            src={getStoreLogoSrc(store)}
                            alt={storeName}
                            className={`h-12 w-12 shrink-0 rounded-2xl border ${
                              selected ? "border-white/15 bg-white/10" : "border-slate-200 bg-slate-50"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold tracking-[-0.03em]">
                              {storeName}
                            </div>
                            <div className={`mt-1 text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}>
                              {storecode}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-sm text-slate-500">
                  {selectedStorecode
                    ? `${selectedScopeLabel} 범위 회원관리 화면을 아래에 표시합니다.`
                    : "전체 가맹점 또는 특정 가맹점을 선택하면 회원관리 화면이 아래에 열립니다."}
                </div>

                {error ? (
                  <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}
              </div>
            </div>

            <AdminWalletCard
              address={activeAccount?.address || null}
              disconnectedMessage={
                isWalletRecovering
                  ? "지갑 연결 상태를 확인하는 중입니다."
                  : "관리자 지갑을 연결하면 가맹점별 회원관리 화면을 열 수 있습니다."
              }
              errorMessage={!canReadSignedData && !isWalletRecovering ? error || undefined : undefined}
              accessLabel="Admin member access"
              title="Admin wallet"
            />
          </div>
        </section>

        {selectedStorecode ? (
          <MemberManagementConsoleClient
            key={selectedStorecode}
            lang={lang}
            forcedStorecode={selectedStorecode === ALL_STORES_SCOPE ? "" : selectedStorecode}
            storeOptions={stores}
          />
        ) : (
          <section className="console-panel rounded-[30px] p-10 text-center">
            <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Member ledger
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">
              가맹점을 선택하세요
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              좌측 패널의 admin 콘솔 범위에서 회원관리 기능을 보려면 먼저 대상 가맹점을 선택해야 합니다.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
