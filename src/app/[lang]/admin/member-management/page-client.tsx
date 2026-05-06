"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import MemberManagementConsoleClient from "./member-management-console-client";
import AdminWalletCard from "@/components/admin/admin-wallet-card";
import AdminStoreStrip from "@/components/admin/admin-store-strip";

type AdminMemberManagementPageClientProps = {
  lang: string;
};

type StoreOption = {
  storecode?: string;
  storeName?: string;
  serviceName?: string;
  companyName?: string;
  storeLogo?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
};

const ALL_STORES_SCOPE = "__all__";

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

export default function AdminMemberManagementPageClient({
  lang,
}: AdminMemberManagementPageClientProps) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStorecode, setSelectedStorecode] = useState(ALL_STORES_SCOPE);
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
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                  <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
                  {loadingStores ? "Loading store options" : "Store selector ready"}
                </div>
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

        <AdminStoreStrip
          stores={stores}
          selectedStorecode={selectedStorecode}
          onSelectStorecode={setSelectedStorecode}
          activeAccount={activeAccount}
          loading={loadingStores}
          error={error}
          onRefresh={() => {
            void loadStores();
          }}
          onStoreUpdate={(storecode, patch) => {
            setStores((current) => current.map((store) => {
              if (normalizeString(store.storecode) !== normalizeString(storecode)) {
                return store;
              }

              return {
                ...store,
                ...patch,
              };
            }));
          }}
          allowAllStores
          allStoresValue={ALL_STORES_SCOPE}
          allStoresLabel="전체 가맹점"
          emptyMessage="검색 결과가 없습니다."
        />

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
              상단 가맹점 목록에서 전체 또는 특정 가맹점을 선택하면 회원관리 화면이 열립니다.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
