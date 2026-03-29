"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import MemberManagementConsoleClient from "./member-management-console-client";
import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";

type AdminMemberManagementPageClientProps = {
  lang: string;
};

type StoreOption = {
  storecode?: string;
  storeName?: string;
  serviceName?: string;
  companyName?: string;
};

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

export default function AdminMemberManagementPageClient({
  lang,
}: AdminMemberManagementPageClientProps) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedStorecode, setSelectedStorecode] = useState("");
  const [loadingStores, setLoadingStores] = useState(true);
  const [error, setError] = useState("");
  const inflightLoadRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const loadStores = useCallback(async () => {
    if (!activeAccount || !canReadSignedData) {
      setStores([]);
      setLoadingStores(false);
      setError(
        isWalletRecovering
          ? ""
          : "관리자 지갑을 연결하고 서명하면 가맹점 목록을 불러올 수 있습니다.",
      );
      return;
    }

    if (inflightLoadRef.current) {
      return;
    }

    inflightLoadRef.current = true;
    setLoadingStores(true);

    try {
      const signedStoresBody = await createCenterStoreAdminSignedBody({
        account: activeAccount,
        route: "/api/store/getAllStores",
        storecode: "admin",
        body: {
          page: 1,
          limit: 200,
          searchStore: "",
          agentcode: "",
          sortBy: "",
        },
      });

      const response = await fetch("/api/bff/admin/store-management", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          page: 1,
          limit: 200,
          searchStore: "",
          agentcode: "",
          sortBy: "",
          signedStoresBody,
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
  }, [activeAccount, canReadSignedData, isWalletRecovering]);

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
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82 sm:text-[15px]">
                      가맹점을 선택한 뒤 해당 범위의 회원 목록, 회원 추가, 등급 변경, 결제페이지 링크 생성 기능을 운영합니다.
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
                    <select
                      value={selectedStorecode}
                      onChange={(event) => setSelectedStorecode(event.target.value)}
                      className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200"
                      disabled={loadingStores}
                    >
                      <option value="">
                        {loadingStores ? "가맹점 목록 불러오는 중..." : "가맹점 선택"}
                      </option>
                      {stores.map((store) => (
                        <option
                          key={normalizeString(store.storecode)}
                          value={normalizeString(store.storecode)}
                        >
                          {getStoreDisplayName(store)}
                        </option>
                      ))}
                    </select>
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

                <div className="mt-3 text-sm text-slate-500">
                  {selectedStorecode
                    ? `${selectedStorecode} 가맹점 회원관리 화면을 아래에 표시합니다.`
                    : "가맹점을 선택하면 회원관리 화면이 아래에 열립니다."}
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
            forcedStorecode={selectedStorecode}
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
