"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";

type MemberManagementConsoleClientProps = {
  lang: string;
  forcedStorecode: string;
};

type FilterState = {
  search: string;
  depositName: string;
  userType: string;
  limit: number;
  page: number;
};

type CreatorInfo = {
  walletAddress?: string | null;
  nickname?: string | null;
  role?: string | null;
  storecode?: string | null;
  matchedBy?: string | null;
};

type MemberRow = {
  _id?: string;
  createdAt?: string;
  nickname?: string;
  walletAddress?: string;
  storecode?: string;
  userType?: string;
  buyOrderStatus?: string;
  totalPaymentConfirmedCount?: number;
  totalPaymentConfirmedUsdtAmount?: number;
  totalPaymentConfirmedKrwAmount?: number;
  buyer?: {
    depositBankName?: string;
    depositBankAccountNumber?: string;
    depositName?: string;
  };
  createdBy?: CreatorInfo;
};

type PaymentRequestedOrder = {
  _id?: string;
  tradeId?: string | number;
  createdAt?: string;
  buyer?: {
    depositName?: string;
  };
};

type StoreMeta = {
  storecode?: string;
  storeName?: string;
  serviceName?: string;
  companyName?: string;
  storeLogo?: string;
  paymentUrl?: string;
  accessToken?: string;
};

type DashboardResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  selectedStore: StoreMeta | null;
  storeError: string;
  members: MemberRow[];
  membersSummary: {
    totalCount: number;
  };
  membersError: string;
  escrow: {
    escrowBalance: number;
    todayMinusedEscrowAmount: number;
  };
  escrowError: string;
  paymentRequested: {
    totalCount: number;
    orders: PaymentRequestedOrder[];
  };
  paymentRequestedError: string;
};

type AddMemberFormState = {
  userCode: string;
  userName: string;
  userBankName: string;
  userBankAccountNumber: string;
  userType: string;
};

const MEMBER_TYPE_OPTIONS = [
  { value: "all", label: "전체 등급" },
  { value: "normal", label: "일반 회원" },
  { value: "AAA", label: "1등급 회원" },
  { value: "BBB", label: "2등급 회원" },
  { value: "CCC", label: "3등급 회원" },
  { value: "DDD", label: "4등급 회원" },
] as const;

const ADD_MEMBER_TYPE_OPTIONS = MEMBER_TYPE_OPTIONS.filter((item) => item.value !== "all");

const EMPTY_DASHBOARD_RESULT: DashboardResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  selectedStore: null,
  storeError: "",
  members: [],
  membersSummary: {
    totalCount: 0,
  },
  membersError: "",
  escrow: {
    escrowBalance: 0,
    todayMinusedEscrowAmount: 0,
  },
  escrowError: "",
  paymentRequested: {
    totalCount: 0,
    orders: [],
  },
  paymentRequestedError: "",
};

const EMPTY_ADD_MEMBER_FORM: AddMemberFormState = {
  userCode: "",
  userName: "",
  userBankName: "",
  userBankAccountNumber: "",
  userType: "",
};

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatUsdtDisplay = (value: number | null | undefined) =>
  Number(value || 0).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const formatKrwDisplay = (value: number | null | undefined) =>
  Math.round(Number(value || 0)).toLocaleString("ko-KR");

const formatDateTime = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateOnly = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const shortAddress = (value?: string | null) => {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "-";
  }

  if (normalized.length <= 14) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const getStoreDisplayName = (store: StoreMeta | null | undefined, fallbackStorecode: string) => {
  return normalizeString(store?.storeName)
    || normalizeString(store?.serviceName)
    || normalizeString(store?.companyName)
    || normalizeString(store?.storecode)
    || normalizeString(fallbackStorecode)
    || "가맹점";
};

const getCreatorRoleLabel = (createdBy: CreatorInfo | null | undefined) => {
  const matchedBy = normalizeString(createdBy?.matchedBy).toLowerCase();
  const role = normalizeString(createdBy?.role).toLowerCase();
  const storecode = normalizeString(createdBy?.storecode).toLowerCase();

  if (matchedBy === "global_admin" || storecode === "admin" || role === "admin") {
    return "전체 관리자";
  }

  if (matchedBy === "store_admin_wallet" || role === "store_admin") {
    return "가맹점 관리자";
  }

  if (!role) {
    return "운영자";
  }

  return role;
};

const getCreatorDisplayName = (createdBy: CreatorInfo | null | undefined) => {
  const nickname = normalizeString(createdBy?.nickname);
  if (nickname) {
    return nickname;
  }
  return getCreatorRoleLabel(createdBy);
};

const getMemberGradeMeta = (userType: unknown) => {
  const normalized = normalizeString(userType).toUpperCase();

  if (normalized === "AAA") {
    return {
      label: "1등급",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (normalized === "BBB") {
    return {
      label: "2등급",
      className: "border-orange-200 bg-orange-50 text-orange-700",
    };
  }

  if (normalized === "CCC") {
    return {
      label: "3등급",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (normalized === "DDD") {
    return {
      label: "4등급",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "일반",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };
};

const getBuyOrderStatusMeta = (status: unknown) => {
  const normalized = normalizeString(status);

  if (normalized === "paymentRequested") {
    return {
      label: "결제요청",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (normalized === "paymentConfirmed") {
    return {
      label: "결제완료",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (normalized === "accepted") {
    return {
      label: "판매자확정",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (normalized === "ordered") {
    return {
      label: "구매주문",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  if (normalized === "cancelled") {
    return {
      label: "거래취소",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }

  return {
    label: normalized || "대기",
    className: "border-slate-200 bg-slate-50 text-slate-600",
  };
};

const createDefaultFilters = (): FilterState => ({
  search: "",
  depositName: "",
  userType: "all",
  limit: 20,
  page: 1,
});

const fieldClassName =
  "h-11 rounded-2xl border border-white/10 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200";

function MetricCard({
  label,
  value,
  unit,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string;
  unit: string;
  helper?: string;
  tone?: "slate" | "emerald" | "amber" | "sky";
}) {
  const toneClassName = {
    slate: "text-slate-950",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
  }[tone];

  return (
    <article className="console-panel rounded-[26px] p-5">
      <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className={`console-display text-[1.9rem] font-semibold tracking-[-0.06em] ${toneClassName}`}>
          {value}
        </div>
        <div className="console-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {unit}
        </div>
      </div>
      {helper ? (
        <div className="mt-2 text-xs text-slate-500">{helper}</div>
      ) : null}
    </article>
  );
}

function MemberGradeBadge({ userType }: { userType?: string }) {
  const meta = getMemberGradeMeta(userType);

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export default function MemberManagementConsoleClient({
  lang,
  forcedStorecode,
}: MemberManagementConsoleClientProps) {
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const normalizedForcedStorecode = normalizeString(forcedStorecode);
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<FilterState>(() => createDefaultFilters());
  const [data, setData] = useState<DashboardResult>(EMPTY_DASHBOARD_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState<AddMemberFormState>(EMPTY_ADD_MEMBER_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent);

      if (!normalizedForcedStorecode) {
        setLoading(false);
        setRefreshing(false);
        setError("storecode is required");
        return;
      }

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
        let signedMembersBody: Record<string, unknown> | null = null;
        let signedEscrowBody: Record<string, unknown> | null = null;
        let signedPaymentRequestedBody: Record<string, unknown> | null = null;
        let signErrorMessage = "";

        if (canReadSignedData && activeAccount) {
          try {
            [signedMembersBody, signedEscrowBody, signedPaymentRequestedBody] = await Promise.all([
              createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/user/getAllBuyers",
                storecode: normalizedForcedStorecode,
                body: {
                  storecode: normalizedForcedStorecode,
                  search: filters.search,
                  depositName: filters.depositName,
                  userType: filters.userType,
                  limit: filters.limit,
                  page: filters.page,
                },
              }),
              createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/store/getEscrowBalance",
                storecode: normalizedForcedStorecode,
                body: {
                  storecode: normalizedForcedStorecode,
                },
              }),
              createCenterStoreAdminSignedBody({
                account: activeAccount,
                route: "/api/order/getCountOfPaymentRequested",
                storecode: normalizedForcedStorecode,
                body: {
                  storecode: normalizedForcedStorecode,
                  ordersLimit: 6,
                },
              }),
            ]);
          } catch (signError) {
            signErrorMessage = signError instanceof Error
              ? signError.message
              : "서명 준비에 실패했습니다.";
          }
        }

        const response = await fetch("/api/bff/admin/member-dashboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            selectedStorecode: normalizedForcedStorecode,
            signedMembersBody,
            signedEscrowBody,
            signedPaymentRequestedBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load member dashboard");
        }

        const result = payload.result || {};
        setData({
          fetchedAt: normalizeString(result.fetchedAt),
          remoteBackendBaseUrl: normalizeString(result.remoteBackendBaseUrl),
          selectedStore: result.selectedStore || null,
          storeError: normalizeString(result.storeError),
          members: Array.isArray(result.members) ? result.members : [],
          membersSummary: {
            totalCount: normalizeNumber(result.membersSummary?.totalCount),
          },
          membersError: normalizeString(result.membersError),
          escrow: {
            escrowBalance: normalizeNumber(result.escrow?.escrowBalance),
            todayMinusedEscrowAmount: normalizeNumber(result.escrow?.todayMinusedEscrowAmount),
          },
          escrowError: normalizeString(result.escrowError),
          paymentRequested: {
            totalCount: normalizeNumber(result.paymentRequested?.totalCount),
            orders: Array.isArray(result.paymentRequested?.orders)
              ? result.paymentRequested.orders
              : [],
          },
          paymentRequestedError: normalizeString(result.paymentRequestedError),
        });

        if (signErrorMessage) {
          setError(signErrorMessage);
        } else if (!canReadSignedData && !isWalletRecovering) {
          setError("");
        } else {
          setError("");
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load member dashboard");
      } finally {
        inflightLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);

        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          void loadDashboard({ silent: true });
        }
      }
    },
    [activeAccount, canReadSignedData, filters, isWalletRecovering, normalizedForcedStorecode],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!normalizedForcedStorecode) {
      return undefined;
    }

    const interval = setInterval(() => {
      void loadDashboard({ silent: true });
    }, 20000);

    return () => clearInterval(interval);
  }, [loadDashboard, normalizedForcedStorecode]);

  const visibleSummary = useMemo(() => {
    return data.members.reduce(
      (acc, member) => {
        acc.totalOrders += normalizeNumber(member.totalPaymentConfirmedCount);
        acc.totalUsdt += normalizeNumber(member.totalPaymentConfirmedUsdtAmount);
        acc.totalKrw += normalizeNumber(member.totalPaymentConfirmedKrwAmount);
        return acc;
      },
      {
        totalOrders: 0,
        totalUsdt: 0,
        totalKrw: 0,
      },
    );
  }, [data.members]);

  const storeDisplayName = getStoreDisplayName(data.selectedStore, normalizedForcedStorecode);
  const disconnectedMessage = isWalletRecovering
    ? "지갑 연결 상태를 확인하는 중입니다."
    : "지갑을 연결하고 서명하면 해당 가맹점 회원 목록이 열립니다.";
  const accessWarningMessage = !canReadSignedData && !isWalletRecovering
    ? "가맹점 관리자 지갑 서명이 있어야 회원 목록 조회와 추가 작업을 사용할 수 있습니다."
    : "";
  const heroStatusLabel = loading
    ? "Initial sync"
    : refreshing
      ? "Refreshing member ledger"
      : "Member console synced";
  const heroStatusBadgeClassName = loading
    ? "border-sky-400/30 bg-sky-400/12 text-sky-100"
    : refreshing
      ? "border-emerald-400/30 bg-emerald-400/12 text-emerald-100"
      : "border-white/12 bg-white/8 text-slate-100";
  const walletStateLabel = canReadSignedData
    ? "Store wallet signed"
    : isWalletRecovering
      ? "Checking store wallet connection"
      : "Signed wallet required for member access";
  const totalPages = Math.max(1, Math.ceil(Math.max(0, data.membersSummary.totalCount) / Math.max(1, filters.limit)));
  const pendingOrdersPreview = data.paymentRequested.orders.slice(0, 4);

  const applyFilters = () => {
    setFilters({
      search: draftFilters.search,
      depositName: draftFilters.depositName,
      userType: draftFilters.userType,
      limit: draftFilters.limit,
      page: 1,
    });
  };

  const resetFilters = () => {
    const next = createDefaultFilters();
    setDraftFilters(next);
    setFilters(next);
  };

  const handlePageChange = (direction: "prev" | "next") => {
    setFilters((current) => {
      const nextPage = direction === "prev"
        ? Math.max(1, current.page - 1)
        : Math.min(totalPages, current.page + 1);

      if (nextPage === current.page) {
        return current;
      }

      return {
        ...current,
        page: nextPage,
      };
    });
  };

  const updateAddMemberField = <Key extends keyof AddMemberFormState>(
    key: Key,
    value: AddMemberFormState[Key],
  ) => {
    setAddMemberForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submitAddMember = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    setActionError("");
    setActionMessage("");

    const trimmedUserCode = normalizeString(addMemberForm.userCode);
    const trimmedUserName = normalizeString(addMemberForm.userName);
    const trimmedBankName = normalizeString(addMemberForm.userBankName);
    const trimmedBankAccountNumber = normalizeString(addMemberForm.userBankAccountNumber);

    if (!trimmedUserCode) {
      setActionError("회원 아이디를 입력해주세요.");
      return;
    }

    if (trimmedUserName.length < 2 || trimmedUserName.length > 10) {
      setActionError("회원 이름은 2자 이상 10자 이하로 입력해주세요.");
      return;
    }

    if (!trimmedBankName) {
      setActionError("은행명을 입력해주세요.");
      return;
    }

    if (!trimmedBankAccountNumber) {
      setActionError("계좌번호를 입력해주세요.");
      return;
    }

    if (!activeAccount) {
      setActionError("가맹점 관리자 지갑 연결이 필요합니다.");
      return;
    }

    setSubmitting(true);

    try {
      const signedBody = await createCenterStoreAdminSignedBody({
        account: activeAccount,
        route: "/api/user/insertBuyerWithoutWalletAddressByStorecode",
        storecode: normalizedForcedStorecode,
        body: {
          storecode: normalizedForcedStorecode,
          userCode: trimmedUserCode,
          userName: trimmedUserName,
          userBankName: trimmedBankName,
          userBankAccountNumber: trimmedBankAccountNumber,
          userType: normalizeString(addMemberForm.userType),
        },
      });

      const response = await fetch("/api/bff/admin/member-signed-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "/api/user/insertBuyerWithoutWalletAddressByStorecode",
          signedBody,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "회원 추가에 실패했습니다.");
      }

      setActionMessage(
        `${trimmedUserCode} 회원이 추가되었습니다. ${payload?.walletAddress ? `지갑 ${shortAddress(payload.walletAddress)} 생성 완료` : ""}`.trim(),
      );
      setAddMemberForm(EMPTY_ADD_MEMBER_FORM);
      setIsAddModalOpen(false);
      await loadDashboard();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "회원 추가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 pb-10">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                    Store member management
                  </div>
                  <div>
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white sm:text-[3.2rem]">
                      {storeDisplayName}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82 sm:text-[15px]">
                      해당 가맹점 범위의 회원 등록, 등급 분포, 결제요청 대기, 에스크로 흐름을 한 화면에서 운영합니다.
                    </p>
                  </div>
                </div>

                <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${heroStatusBadgeClassName}`}>
                  <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
                  {heroStatusLabel}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Store scope
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {normalizedForcedStorecode || "-"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    좌측 패널 경로와 동일한 storecode 범위
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Loaded members
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {loading ? "Syncing..." : `${data.membersSummary.totalCount.toLocaleString()} members`}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    현재 필터 기준 총 회원 수
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Last sync
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {data.fetchedAt ? formatDateTime(data.fetchedAt) : "대기 중"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    {walletStateLabel}
                  </div>
                </div>
              </div>

              {data.storeError ? (
                <div className="rounded-[24px] border border-amber-300/24 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {data.storeError}
                </div>
              ) : null}
            </div>

            <AdminWalletCard
              address={activeAccount?.address || null}
              disconnectedMessage={disconnectedMessage}
              errorMessage={error || accessWarningMessage || undefined}
              accessLabel="Scoped member access"
              title="Store manager wallet"
            />
          </div>
        </section>

        {actionMessage ? (
          <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {actionMessage}
          </section>
        ) : null}

        {actionError ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {actionError}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="console-panel rounded-[30px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Filters
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  회원 검색과 추가
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  회원 아이디, 예금주명, 등급으로 필터링하고 필요한 경우 바로 신규 회원을 등록할 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActionError("");
                  setActionMessage("");
                  setIsAddModalOpen(true);
                }}
                disabled={!canReadSignedData}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                회원 추가
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                value={draftFilters.search}
                onChange={(event) => {
                  setDraftFilters((current) => ({
                    ...current,
                    search: event.target.value,
                  }));
                }}
                placeholder="회원 아이디 검색"
                className={fieldClassName}
              />
              <input
                value={draftFilters.depositName}
                onChange={(event) => {
                  setDraftFilters((current) => ({
                    ...current,
                    depositName: event.target.value,
                  }));
                }}
                placeholder="예금주명 검색"
                className={fieldClassName}
              />
              <select
                value={draftFilters.userType}
                onChange={(event) => {
                  setDraftFilters((current) => ({
                    ...current,
                    userType: event.target.value,
                  }));
                }}
                className={fieldClassName}
              >
                {MEMBER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={String(draftFilters.limit)}
                onChange={(event) => {
                  const nextLimit = Number(event.target.value) || 20;
                  setDraftFilters((current) => ({
                    ...current,
                    limit: nextLimit,
                  }));
                }}
                className={fieldClassName}
              >
                {[20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}개씩 보기
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500"
                >
                  검색 적용
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  필터 초기화
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadDashboard({ silent: true });
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  새로고침
                </button>
              </div>

              <div className="text-sm text-slate-500">
                페이지 {filters.page.toLocaleString()} / {totalPages.toLocaleString()}
              </div>
            </div>
          </div>

          <aside className="console-panel rounded-[30px] p-5">
            <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
              Pending payments
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.05em] text-slate-950">
              결제요청 대기
            </h2>
            <div className="mt-4 rounded-[24px] border border-amber-100 bg-[linear-gradient(180deg,rgba(255,251,235,0.94),rgba(255,255,255,0.98))] p-4">
              <div className="text-3xl font-semibold tracking-[-0.05em] text-amber-700">
                {data.paymentRequested.totalCount.toLocaleString()}
              </div>
              <div className="mt-1 text-sm text-amber-700/80">
                해당 가맹점 결제요청 상태 주문 수
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {pendingOrdersPreview.length > 0 ? (
                pendingOrdersPreview.map((order) => (
                  <div
                    key={`${order._id || ""}-${order.tradeId || ""}`}
                    className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">
                        {normalizeString(order?.buyer?.depositName) || "예금주 미입력"}
                      </div>
                      <div className="console-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
                        {order.tradeId || "-"}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDateTime(order.createdAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  표시할 결제요청 대기 주문이 없습니다.
                </div>
              )}
            </div>

            {data.paymentRequestedError ? (
              <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {data.paymentRequestedError}
              </div>
            ) : null}
          </aside>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Registered members"
            value={data.membersSummary.totalCount.toLocaleString()}
            unit="members"
            helper="현재 필터 기준 총 회원 수"
            tone="slate"
          />
          <MetricCard
            label="Visible rows"
            value={data.members.length.toLocaleString()}
            unit="rows"
            helper="현재 페이지에 로드된 회원"
            tone="sky"
          />
          <MetricCard
            label="Confirmed trades"
            value={visibleSummary.totalOrders.toLocaleString()}
            unit="count"
            helper="현재 페이지 회원의 구매 완료 건수"
            tone="slate"
          />
          <MetricCard
            label="Confirmed volume"
            value={formatUsdtDisplay(visibleSummary.totalUsdt)}
            unit="USDT"
            helper={`KRW ${formatKrwDisplay(visibleSummary.totalKrw)}`}
            tone="emerald"
          />
          <MetricCard
            label="Escrow balance"
            value={formatKrwDisplay(data.escrow.escrowBalance)}
            unit="KRW"
            helper={`오늘 차감 ${formatKrwDisplay(data.escrow.todayMinusedEscrowAmount)} KRW`}
            tone="amber"
          />
        </section>

        {data.escrowError ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {data.escrowError}
          </section>
        ) : null}

        <section className="console-panel overflow-hidden rounded-[30px]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-5">
            <div>
              <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                Member ledger
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                회원 목록
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange("prev")}
                disabled={filters.page <= 1}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => handlePageChange("next")}
                disabled={filters.page >= totalPages}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                다음
              </button>
            </div>
          </div>

          {data.membersError ? (
            <div className="border-b border-rose-100 bg-rose-50 px-6 py-4 text-sm text-rose-700">
              {data.membersError}
            </div>
          ) : null}

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-950 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
                <tr>
                  <th className="px-6 py-4">등록일</th>
                  <th className="px-6 py-4">회원</th>
                  <th className="px-6 py-4">등급</th>
                  <th className="px-6 py-4">추가자</th>
                  <th className="px-6 py-4">회원 통장</th>
                  <th className="px-6 py-4 text-right">구매 요약</th>
                  <th className="px-6 py-4">주문상태</th>
                  <th className="px-6 py-4">지갑</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.members.length > 0 ? (
                  data.members.map((member, index) => {
                    const statusMeta = getBuyOrderStatusMeta(member.buyOrderStatus);
                    return (
                      <tr key={member._id || `${member.walletAddress || "member"}-${index}`} className="align-top">
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {formatDateOnly(member.createdAt)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatDateTime(member.createdAt).split(" ").slice(-2).join(" ")}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {normalizeString(member.nickname) || "-"}
                            </div>
                            <div className="text-xs text-slate-500">
                              storecode {normalizeString(member.storecode) || normalizedForcedStorecode}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <MemberGradeBadge userType={member.userType} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {getCreatorDisplayName(member.createdBy)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {getCreatorRoleLabel(member.createdBy)}
                            </div>
                            <div className="text-xs text-slate-400">
                              {shortAddress(member.createdBy?.walletAddress)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="text-sm text-slate-700">
                              {normalizeString(member.buyer?.depositBankName) || "-"}
                            </div>
                            <div className="text-sm text-slate-700">
                              {normalizeString(member.buyer?.depositBankAccountNumber) || "-"}
                            </div>
                            <div className="text-sm text-slate-700">
                              {normalizeString(member.buyer?.depositName) || "-"}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-slate-900">
                              {normalizeNumber(member.totalPaymentConfirmedCount).toLocaleString()}건
                            </div>
                            <div className="text-sm font-semibold text-emerald-600">
                              {formatUsdtDisplay(normalizeNumber(member.totalPaymentConfirmedUsdtAmount))} USDT
                            </div>
                            <div className="text-sm font-semibold text-amber-600">
                              {formatKrwDisplay(normalizeNumber(member.totalPaymentConfirmedKrwAmount))} KRW
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={() => {
                              const walletAddress = normalizeString(member.walletAddress);
                              if (!walletAddress || typeof navigator === "undefined" || !navigator.clipboard) {
                                return;
                              }
                              navigator.clipboard.writeText(walletAddress).catch(() => {});
                              setActionMessage(`지갑 주소 ${shortAddress(walletAddress)} 를 복사했습니다.`);
                              setActionError("");
                            }}
                            className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-4"
                          >
                            {shortAddress(member.walletAddress)}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-500">
                      {loading ? "회원 목록을 불러오는 중입니다." : "표시할 회원이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 p-4 lg:hidden">
            {data.members.length > 0 ? (
              data.members.map((member, index) => {
                const statusMeta = getBuyOrderStatusMeta(member.buyOrderStatus);
                return (
                  <article
                    key={member._id || `${member.walletAddress || "member-card"}-${index}`}
                    className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-slate-950">
                          {normalizeString(member.nickname) || "-"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {formatDateTime(member.createdAt)}
                        </div>
                      </div>
                      <MemberGradeBadge userType={member.userType} />
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-500">추가자</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {getCreatorDisplayName(member.createdBy)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {getCreatorRoleLabel(member.createdBy)}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {shortAddress(member.createdBy?.walletAddress)}
                        </div>
                      </div>

                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-500">회원 통장</div>
                        <div className="mt-1 text-sm text-slate-700">
                          {normalizeString(member.buyer?.depositBankName) || "-"}
                        </div>
                        <div className="text-sm text-slate-700">
                          {normalizeString(member.buyer?.depositBankAccountNumber) || "-"}
                        </div>
                        <div className="text-sm text-slate-700">
                          {normalizeString(member.buyer?.depositName) || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-500">구매건수</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {normalizeNumber(member.totalPaymentConfirmedCount).toLocaleString()}건
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-500">구매량</div>
                        <div className="mt-1 text-sm font-semibold text-emerald-600">
                          {formatUsdtDisplay(normalizeNumber(member.totalPaymentConfirmedUsdtAmount))} USDT
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium text-slate-500">구매금액</div>
                        <div className="mt-1 text-sm font-semibold text-amber-600">
                          {formatKrwDisplay(normalizeNumber(member.totalPaymentConfirmedKrwAmount))} KRW
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const walletAddress = normalizeString(member.walletAddress);
                          if (!walletAddress || typeof navigator === "undefined" || !navigator.clipboard) {
                            return;
                          }
                          navigator.clipboard.writeText(walletAddress).catch(() => {});
                          setActionMessage(`지갑 주소 ${shortAddress(walletAddress)} 를 복사했습니다.`);
                          setActionError("");
                        }}
                        className="text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-4"
                      >
                        {shortAddress(member.walletAddress)}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
                {loading ? "회원 목록을 불러오는 중입니다." : "표시할 회원이 없습니다."}
              </div>
            )}
          </div>
        </section>
      </div>

      {isAddModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="console-panel w-full max-w-2xl rounded-[32px] bg-white p-6 shadow-[0_42px_90px_-56px_rgba(15,23,42,0.7)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Add member
                </div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  신규 회원 추가
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {storeDisplayName} 가맹점에 바로 사용할 회원 아이디와 입금 계좌 정보를 등록합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (submitting) {
                    return;
                  }
                  setIsAddModalOpen(false);
                  setActionError("");
                }}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={submitAddMember}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">회원 아이디</div>
                  <input
                    value={addMemberForm.userCode}
                    onChange={(event) => updateAddMemberField("userCode", event.target.value)}
                    placeholder="member001"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">회원 이름</div>
                  <input
                    value={addMemberForm.userName}
                    onChange={(event) => updateAddMemberField("userName", event.target.value)}
                    placeholder="예금주명"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">은행명</div>
                  <input
                    value={addMemberForm.userBankName}
                    onChange={(event) => updateAddMemberField("userBankName", event.target.value)}
                    placeholder="국민은행"
                    className={fieldClassName}
                  />
                </label>
                <label className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">계좌번호</div>
                  <input
                    value={addMemberForm.userBankAccountNumber}
                    onChange={(event) => updateAddMemberField("userBankAccountNumber", event.target.value)}
                    placeholder="12345678901234"
                    className={fieldClassName}
                  />
                </label>
              </div>

              <label className="space-y-2">
                <div className="text-sm font-medium text-slate-700">회원 등급</div>
                <select
                  value={addMemberForm.userType}
                  onChange={(event) => updateAddMemberField("userType", event.target.value)}
                  className={fieldClassName}
                >
                  {ADD_MEMBER_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[22px] border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                회원 추가는 현재 연결된 가맹점 관리자 지갑 서명으로만 처리됩니다.
              </div>

              {actionError ? (
                <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {actionError}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (submitting) {
                      return;
                    }
                    setIsAddModalOpen(false);
                    setActionError("");
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {submitting ? "등록 중..." : "회원 추가"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
