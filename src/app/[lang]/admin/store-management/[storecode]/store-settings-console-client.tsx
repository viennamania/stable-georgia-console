"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useActiveAccount, useActiveWalletConnectionStatus } from "thirdweb/react";

import AdminWalletCard from "@/components/admin/admin-wallet-card";
import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import { createCenterStoreAdminSignedBody } from "@/lib/client/create-center-store-admin-signed-body";
import {
  STORE_ADMIN_WALLET_HISTORY_READ_SIGNING_PREFIX,
  STORE_ROUTE_GET_ADMIN_WALLET_HISTORY,
  STORE_ROUTE_SET_STORE_DESCRIPTION,
  STORE_ROUTE_SET_STORE_LOGO,
  STORE_ROUTE_SET_STORE_NAME,
  STORE_ROUTE_SET_WITHDRAWAL_BANK_INFO,
  STORE_ROUTE_SET_WITHDRAWAL_BANK_INFO_AAA,
  STORE_ROUTE_SET_WITHDRAWAL_BANK_INFO_BBB,
  STORE_ROUTE_TOGGLE_VIEW,
  STORE_ROUTE_UPDATE_ACCESS_TOKEN,
  STORE_ROUTE_UPDATE_ADMIN_WALLET,
  STORE_ROUTE_UPDATE_AGENTCODE,
  STORE_ROUTE_UPDATE_BACKGROUND_COLOR,
  STORE_ROUTE_UPDATE_ESCROW_AMOUNT,
  STORE_ROUTE_UPDATE_MAX_PAYMENT_AMOUNT,
  STORE_ROUTE_UPDATE_PAYACTION_KEYS,
  STORE_ROUTE_UPDATE_PAYMENT_URL,
  STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
} from "@/lib/security/store-settings-admin";

type StoreSettingsConsoleClientProps = {
  lang: string;
  storecode: string;
};

type BankInfo = {
  bankName?: string;
  bankCode?: string;
  accountHolder?: string;
  accountNumber?: string;
};

type PayactionKey = {
  payactionApiKey?: string;
  payactionWebhookKey?: string;
  payactionShopId?: string;
};

type AgentMeta = {
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
};

type AdminWalletCandidate = {
  _id?: string;
  nickname?: string;
  walletAddress?: string;
  createdAt?: string;
  buyer?: {
    depositName?: string;
  };
};

type AdminWalletHistoryEntry = {
  _id?: string;
  before?: string | null;
  after?: string | null;
  changed?: boolean;
  requesterWalletAddress?: string | null;
  publicIp?: string | null;
  route?: string | null;
  updatedAt?: string | null;
};

type StoreDetail = {
  _id?: string;
  createdAt?: string;
  storecode?: string;
  storeName?: string;
  storeLogo?: string;
  storeDescription?: string;
  agentcode?: string;
  agentName?: string;
  agentLogo?: string;
  totalBuyerCount?: number;
  totalPaymentConfirmedCount?: number;
  totalUsdtAmount?: number;
  totalSettlementAmountKRW?: number;
  escrowAmountUSDT?: number;
  maxPaymentAmountKRW?: number;
  paymentUrl?: string;
  viewOnAndOff?: boolean;
  liveOnAndOff?: boolean;
  adminWalletAddress?: string;
  settlementWalletAddress?: string;
  privateSaleWalletAddress?: string;
  sellerWalletAddress?: string;
  backgroundColor?: string;
  accessToken?: string;
  payactionKey?: PayactionKey | null;
  withdrawalBankInfo?: BankInfo | null;
  withdrawalBankInfoAAA?: BankInfo | null;
  withdrawalBankInfoBBB?: BankInfo | null;
};

type ContextResult = {
  fetchedAt: string;
  remoteBackendBaseUrl: string;
  store: StoreDetail | null;
  storeError: string;
  agents: AgentMeta[];
  agentsError: string;
  adminWalletCandidates: AdminWalletCandidate[];
  adminWalletCandidatesError: string;
  adminWalletHistory: AdminWalletHistoryEntry[];
  adminWalletHistoryError: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

type ProfileFormState = {
  storeName: string;
  storeDescription: string;
  storeLogo: string;
};

type BankFormState = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

type PayactionFormState = {
  payactionApiKey: string;
  payactionWebhookKey: string;
  payactionShopId: string;
};

const EMPTY_CONTEXT_RESULT: ContextResult = {
  fetchedAt: "",
  remoteBackendBaseUrl: "",
  store: null,
  storeError: "",
  agents: [],
  agentsError: "",
  adminWalletCandidates: [],
  adminWalletCandidatesError: "",
  adminWalletHistory: [],
  adminWalletHistoryError: "",
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  storeName: "",
  storeDescription: "",
  storeLogo: "",
};

const EMPTY_BANK_FORM: BankFormState = {
  bankName: "",
  accountNumber: "",
  accountHolder: "",
};

const EMPTY_PAYACTION_FORM: PayactionFormState = {
  payactionApiKey: "",
  payactionWebhookKey: "",
  payactionShopId: "",
};

const fieldClassName =
  "h-11 rounded-2xl border border-white/10 bg-white px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200";
const textAreaClassName =
  "min-h-[120px] rounded-[24px] border border-white/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200";

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

const formatUsdtDisplay = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("ko-KR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

const formatKrwDisplay = (value: number | null | undefined) =>
  Math.round(Number(value || 0)).toLocaleString("ko-KR");

const sanitizeDigits = (value: string) => value.replace(/[^\d]/g, "");

const sanitizeDecimal = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [first, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${first}.${rest.join("")}` : first;
};

const normalizeHexColor = (value: unknown) => {
  const normalized = normalizeString(value);
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "#0f172a";
};

const isValidUrl = (value: string) => {
  if (!normalizeString(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const createBankFormFromValue = (value?: BankInfo | null): BankFormState => ({
  bankName: normalizeString(value?.bankName),
  accountNumber: normalizeString(value?.accountNumber),
  accountHolder: normalizeString(value?.accountHolder),
});

const createPayactionFormFromValue = (value?: PayactionKey | null): PayactionFormState => ({
  payactionApiKey: normalizeString(value?.payactionApiKey),
  payactionWebhookKey: normalizeString(value?.payactionWebhookKey),
  payactionShopId: normalizeString(value?.payactionShopId),
});

const createAccessToken = () =>
  Array.from({ length: 20 })
    .map(() => Math.random().toString(36).slice(2, 3))
    .join("");

const SettingsCard = ({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) => {
  return (
    <section className="console-panel rounded-[30px] p-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {eyebrow}
          </div>
          <h2 className="console-display mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="pt-6">{children}</div>
    </section>
  );
};

const FeedbackBanner = ({ feedback }: { feedback: FeedbackState }) => {
  const toneClass =
    feedback.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : feedback.tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <section className={`rounded-[24px] border px-4 py-3 text-sm font-medium ${toneClass}`}>
      {feedback.message}
    </section>
  );
};

const MetricCard = ({
  label,
  value,
  unit,
  helper,
}: {
  label: string;
  value: string;
  unit: string;
  helper: string;
}) => {
  return (
    <article className="console-panel rounded-[26px] p-5">
      <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="console-display text-[1.85rem] font-semibold tracking-[-0.06em] text-slate-950">
          {value}
        </div>
        <div className="console-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
          {unit}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">{helper}</div>
    </article>
  );
};

const CurrentValue = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-semibold text-slate-900">{value || "-"}</div>
    </div>
  );
};

const HistoryRow = ({ item }: { item: AdminWalletHistoryEntry }) => {
  const changed = Boolean(item?.changed);
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">
          {formatDateTime(item?.updatedAt)}
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            changed
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {changed ? "변경 발생" : "동일 값 요청"}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CurrentValue label="이전 지갑" value={shortAddress(item?.before)} />
        <CurrentValue label="변경 후 지갑" value={shortAddress(item?.after)} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <CurrentValue label="요청 지갑" value={shortAddress(item?.requesterWalletAddress)} />
        <CurrentValue label="IP" value={normalizeString(item?.publicIp) || "-"} />
        <CurrentValue label="Route" value={normalizeString(item?.route) || "-"} />
      </div>
    </div>
  );
};

const BankInfoEditor = ({
  title,
  description,
  toneClassName,
  form,
  onChange,
  saving,
  onSave,
}: {
  title: string;
  description: string;
  toneClassName: string;
  form: BankFormState;
  onChange: (next: BankFormState) => void;
  saving: boolean;
  onSave: () => void;
}) => {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`console-mono text-[10px] uppercase tracking-[0.16em] ${toneClassName}`}>
            Withdrawal preset
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        <input
          value={form.bankName}
          onChange={(event) => onChange({ ...form, bankName: event.target.value })}
          placeholder="은행명"
          className={fieldClassName}
        />
        <input
          value={form.accountNumber}
          onChange={(event) => onChange({ ...form, accountNumber: event.target.value })}
          placeholder="계좌번호"
          className={fieldClassName}
        />
        <input
          value={form.accountHolder}
          onChange={(event) => onChange({ ...form, accountHolder: event.target.value })}
          placeholder="예금주명"
          className={fieldClassName}
        />
      </div>
    </div>
  );
};

export default function StoreSettingsConsoleClient({
  lang,
  storecode,
}: StoreSettingsConsoleClientProps) {
  const router = useRouter();
  const activeAccount = useActiveAccount();
  const walletConnectionStatus = useActiveWalletConnectionStatus();
  const [data, setData] = useState<ContextResult>(EMPTY_CONTEXT_RESULT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [withdrawalMainForm, setWithdrawalMainForm] = useState<BankFormState>(EMPTY_BANK_FORM);
  const [withdrawalAAAForm, setWithdrawalAAAForm] = useState<BankFormState>(EMPTY_BANK_FORM);
  const [withdrawalBBBForm, setWithdrawalBBBForm] = useState<BankFormState>(EMPTY_BANK_FORM);
  const [selectedAdminWalletAddress, setSelectedAdminWalletAddress] = useState("");
  const [escrowAmountInput, setEscrowAmountInput] = useState("");
  const [payactionForm, setPayactionForm] = useState<PayactionFormState>(EMPTY_PAYACTION_FORM);
  const [backgroundColor, setBackgroundColor] = useState("#0f172a");
  const [selectedAgentcode, setSelectedAgentcode] = useState("");
  const [paymentUrlInput, setPaymentUrlInput] = useState("");
  const [maxPaymentAmountInput, setMaxPaymentAmountInput] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const inflightLoadRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);

  const isWalletRecovering =
    walletConnectionStatus === "unknown" || walletConnectionStatus === "connecting";
  const canReadSignedData = Boolean(activeAccount) && walletConnectionStatus === "connected";

  const hydrateForms = useCallback((store: StoreDetail | null) => {
    setProfileForm({
      storeName: normalizeString(store?.storeName),
      storeDescription: normalizeString(store?.storeDescription),
      storeLogo: normalizeString(store?.storeLogo),
    });
    setWithdrawalMainForm(createBankFormFromValue(store?.withdrawalBankInfo));
    setWithdrawalAAAForm(createBankFormFromValue(store?.withdrawalBankInfoAAA));
    setWithdrawalBBBForm(createBankFormFromValue(store?.withdrawalBankInfoBBB));
    setSelectedAdminWalletAddress("");
    setEscrowAmountInput(String(normalizeNumber(store?.escrowAmountUSDT) || ""));
    setPayactionForm(createPayactionFormFromValue(store?.payactionKey));
    setBackgroundColor(normalizeHexColor(store?.backgroundColor));
    setSelectedAgentcode(normalizeString(store?.agentcode));
    setPaymentUrlInput(normalizeString(store?.paymentUrl));
    setMaxPaymentAmountInput(
      normalizeNumber(store?.maxPaymentAmountKRW)
        ? String(Math.round(normalizeNumber(store?.maxPaymentAmountKRW)))
        : "",
    );
    setAccessTokenInput(normalizeString(store?.accessToken));
  }, []);

  const patchStore = useCallback((patch: Partial<StoreDetail>) => {
    setData((current) => ({
      ...current,
      store: current.store ? { ...current.store, ...patch } : current.store,
    }));
  }, []);

  const loadContext = useCallback(
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
        let signedStoreBody: Record<string, unknown> | null = null;
        let signedHistoryBody: Record<string, unknown> | null = null;
        const signWarnings: string[] = [];

        if (canReadSignedData && activeAccount) {
          try {
            signedStoreBody = await createCenterStoreAdminSignedBody({
              account: activeAccount,
              route: "/api/store/getOneStore",
              storecode,
              body: {
                storecode,
              },
            });
          } catch (error) {
            signWarnings.push(
              error instanceof Error ? error.message : "가맹점 상세 서명 준비에 실패했습니다.",
            );
          }

          try {
            signedHistoryBody = await createAdminSignedBody({
              account: activeAccount,
              route: STORE_ROUTE_GET_ADMIN_WALLET_HISTORY,
              signingPrefix: STORE_ADMIN_WALLET_HISTORY_READ_SIGNING_PREFIX,
              requesterStorecode: "admin",
              requesterWalletAddress: activeAccount.address,
              actionFields: {
                storecode,
                limit: 20,
              },
            });
          } catch (error) {
            signWarnings.push(
              error instanceof Error ? error.message : "관리자 지갑 이력 서명 준비에 실패했습니다.",
            );
          }
        }

        const response = await fetch("/api/bff/admin/store-management/context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            storecode,
            signedStoreBody,
            signedHistoryBody,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || "가맹점 상세 설정을 불러오지 못했습니다.");
        }

        const result = payload.result || {};
        const nextStore = result.store && typeof result.store === "object"
          ? (result.store as StoreDetail)
          : null;

        setData({
          fetchedAt: normalizeString(result.fetchedAt),
          remoteBackendBaseUrl: normalizeString(result.remoteBackendBaseUrl),
          store: nextStore,
          storeError: normalizeString(result.storeError),
          agents: Array.isArray(result.agents) ? result.agents : [],
          agentsError: normalizeString(result.agentsError),
          adminWalletCandidates: Array.isArray(result.adminWalletCandidates)
            ? result.adminWalletCandidates
            : [],
          adminWalletCandidatesError: normalizeString(result.adminWalletCandidatesError),
          adminWalletHistory: Array.isArray(result.adminWalletHistory)
            ? result.adminWalletHistory
            : [],
          adminWalletHistoryError: normalizeString(result.adminWalletHistoryError),
        });
        hydrateForms(nextStore);

        if (signWarnings.length > 0) {
          setFeedback({
            tone: "info",
            message: signWarnings[0],
          });
        } else if (!silent) {
          setFeedback(null);
        }
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "가맹점 상세 설정을 불러오지 못했습니다.",
        });
      } finally {
        inflightLoadRef.current = false;
        setLoading(false);
        setRefreshing(false);

        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          void loadContext({ silent: true });
        }
      }
    },
    [activeAccount, canReadSignedData, hydrateForms, storecode],
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const runStoreAction = useCallback(
    async ({
      actionKey,
      route,
      actionFields,
      successMessage,
      errorFallback,
      signingPrefix = STORE_SETTINGS_MUTATION_SIGNING_PREFIX,
      onSuccess,
    }: {
      actionKey: string;
      route: string;
      actionFields: Record<string, unknown>;
      successMessage: string;
      errorFallback: string;
      signingPrefix?: string;
      onSuccess?: (payload: any) => void;
    }) => {
      if (!activeAccount) {
        setFeedback({
          tone: "error",
          message: "관리자 지갑 연결이 필요합니다.",
        });
        return null;
      }

      setPendingActionKey(actionKey);

      try {
        const signedBody = await createAdminSignedBody({
          account: activeAccount,
          route,
          signingPrefix,
          requesterStorecode: "admin",
          requesterWalletAddress: activeAccount.address,
          actionFields,
        });

        const response = await fetch("/api/bff/admin/signed-store-action", {
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
          throw new Error(payload?.error || errorFallback);
        }

        onSuccess?.(payload);
        setFeedback({
          tone: "success",
          message: successMessage,
        });
        return payload;
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : errorFallback,
        });
        return null;
      } finally {
        setPendingActionKey(null);
      }
    },
    [activeAccount],
  );

  const saveStoreName = async () => {
    const storeName = normalizeString(profileForm.storeName);
    if (storeName.length < 2 || storeName.length > 10) {
      setFeedback({
        tone: "error",
        message: "가맹점 이름은 2자 이상 10자 이하로 설정하세요.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: "store-name",
      route: STORE_ROUTE_SET_STORE_NAME,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        storeName,
      },
      successMessage: "가맹점 이름을 저장했습니다.",
      errorFallback: "가맹점 이름 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ storeName });
      },
    });

    if (payload) {
      setProfileForm((current) => ({ ...current, storeName }));
    }
  };

  const saveStoreDescription = async () => {
    const storeDescription = normalizeString(profileForm.storeDescription);
    if (storeDescription.length < 2 || storeDescription.length > 100) {
      setFeedback({
        tone: "error",
        message: "가맹점 소개는 2자 이상 100자 이하로 설정하세요.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: "store-description",
      route: STORE_ROUTE_SET_STORE_DESCRIPTION,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        storeDescription,
      },
      successMessage: "가맹점 소개를 저장했습니다.",
      errorFallback: "가맹점 소개 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ storeDescription });
      },
    });

    if (payload) {
      setProfileForm((current) => ({ ...current, storeDescription }));
    }
  };

  const saveStoreLogo = async () => {
    const storeLogo = normalizeString(profileForm.storeLogo);
    if (storeLogo && !isValidUrl(storeLogo)) {
      setFeedback({
        tone: "error",
        message: "로고 URL 형식이 올바르지 않습니다.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: "store-logo",
      route: STORE_ROUTE_SET_STORE_LOGO,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        storeLogo,
      },
      successMessage: storeLogo ? "가맹점 로고를 저장했습니다." : "가맹점 로고를 초기화했습니다.",
      errorFallback: "가맹점 로고 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ storeLogo });
      },
    });

    if (payload) {
      setProfileForm((current) => ({ ...current, storeLogo }));
    }
  };

  const saveWithdrawalForm = async ({
    actionKey,
    route,
    form,
    storePatchKey,
  }: {
    actionKey: string;
    route: string;
    form: BankFormState;
    storePatchKey: "withdrawalBankInfo" | "withdrawalBankInfoAAA" | "withdrawalBankInfoBBB";
  }) => {
    const bankName = normalizeString(form.bankName);
    const accountNumber = normalizeString(form.accountNumber);
    const accountHolder = normalizeString(form.accountHolder);

    if (bankName.length < 2 || bankName.length > 20) {
      setFeedback({
        tone: "error",
        message: "은행명은 2자 이상 20자 이하로 설정하세요.",
      });
      return;
    }
    if (accountNumber.length < 2 || accountNumber.length > 30) {
      setFeedback({
        tone: "error",
        message: "계좌번호는 2자 이상 30자 이하로 설정하세요.",
      });
      return;
    }
    if (accountHolder.length < 2 || accountHolder.length > 20) {
      setFeedback({
        tone: "error",
        message: "예금주명은 2자 이상 20자 이하로 설정하세요.",
      });
      return;
    }

    await runStoreAction({
      actionKey,
      route,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        withdrawalBankName: bankName,
        withdrawalAccountNumber: accountNumber,
        withdrawalAccountHolder: accountHolder,
      },
      successMessage: "출금 계좌 정보를 저장했습니다.",
      errorFallback: "출금 계좌 정보 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({
          [storePatchKey]: {
            bankName,
            accountNumber,
            accountHolder,
          },
        });
      },
    });
  };

  const saveAdminWalletAddress = async () => {
    const nextWalletAddress = normalizeString(selectedAdminWalletAddress).toLowerCase();
    const currentWalletAddress = normalizeString(data.store?.adminWalletAddress).toLowerCase();

    if (!nextWalletAddress) {
      setFeedback({
        tone: "error",
        message: "변경할 관리자 지갑을 선택하세요.",
      });
      return;
    }

    if (nextWalletAddress === currentWalletAddress) {
      setFeedback({
        tone: "error",
        message: "현재 관리자 지갑과 동일합니다.",
      });
      return;
    }

    const candidate = data.adminWalletCandidates.find((item) => {
      return normalizeString(item.walletAddress).toLowerCase() === nextWalletAddress;
    });

    if (!candidate) {
      setFeedback({
        tone: "error",
        message: "검증된 일반 지갑만 관리자 지갑으로 지정할 수 있습니다.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: "admin-wallet",
      route: STORE_ROUTE_UPDATE_ADMIN_WALLET,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        adminWalletAddress: nextWalletAddress,
      },
      successMessage: "가맹점 관리자 지갑을 변경했습니다.",
      errorFallback: "가맹점 관리자 지갑 변경에 실패했습니다.",
      onSuccess: () => {
        patchStore({ adminWalletAddress: nextWalletAddress });
        setSelectedAdminWalletAddress("");
      },
    });

    if (payload) {
      void loadContext({ silent: true });
    }
  };

  const saveEscrowAmount = async () => {
    const escrowAmountUSDT = Number(sanitizeDecimal(escrowAmountInput || "0"));
    if (!Number.isFinite(escrowAmountUSDT) || escrowAmountUSDT < 10 || escrowAmountUSDT > 10000) {
      setFeedback({
        tone: "error",
        message: "에스크로 수량은 10 ~ 10,000 USDT 범위로 설정하세요.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: "escrow-amount",
      route: STORE_ROUTE_UPDATE_ESCROW_AMOUNT,
      actionFields: {
        storecode,
        escrowAmountUSDT,
      },
      successMessage: "에스크로 수량을 저장했습니다.",
      errorFallback: "에스크로 수량 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ escrowAmountUSDT });
      },
    });

    if (payload) {
      setEscrowAmountInput(String(escrowAmountUSDT));
    }
  };

  const savePayactionKeys = async () => {
    const payactionApiKey = normalizeString(payactionForm.payactionApiKey);
    const payactionWebhookKey = normalizeString(payactionForm.payactionWebhookKey);
    const payactionShopId = normalizeString(payactionForm.payactionShopId);

    if (
      payactionApiKey.length < 2
      || payactionWebhookKey.length < 2
      || payactionShopId.length < 2
    ) {
      setFeedback({
        tone: "error",
        message: "PAYACTION API KEY, WEBHOOK KEY, SHOP ID를 모두 입력하세요.",
      });
      return;
    }

    const nextPayactionKey = {
      payactionApiKey,
      payactionWebhookKey,
      payactionShopId,
    };

    await runStoreAction({
      actionKey: "payaction",
      route: STORE_ROUTE_UPDATE_PAYACTION_KEYS,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        payactionKey: nextPayactionKey,
      },
      successMessage: "PAYACTION 키를 저장했습니다.",
      errorFallback: "PAYACTION 키 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ payactionKey: nextPayactionKey });
      },
    });
  };

  const resetPayactionKeys = async () => {
    const nextPayactionKey = {
      payactionApiKey: "",
      payactionWebhookKey: "",
      payactionShopId: "",
    };

    const payload = await runStoreAction({
      actionKey: "payaction-reset",
      route: STORE_ROUTE_UPDATE_PAYACTION_KEYS,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        payactionKey: nextPayactionKey,
      },
      successMessage: "PAYACTION 키를 초기화했습니다.",
      errorFallback: "PAYACTION 키 초기화에 실패했습니다.",
      onSuccess: () => {
        patchStore({ payactionKey: nextPayactionKey });
      },
    });

    if (payload) {
      setPayactionForm(nextPayactionKey);
    }
  };

  const saveBackgroundColor = async () => {
    const nextBackgroundColor = normalizeHexColor(backgroundColor);
    await runStoreAction({
      actionKey: "background-color",
      route: STORE_ROUTE_UPDATE_BACKGROUND_COLOR,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        backgroundColor: nextBackgroundColor,
      },
      successMessage: "배경색을 저장했습니다.",
      errorFallback: "배경색 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ backgroundColor: nextBackgroundColor });
      },
    });
  };

  const saveAgentcode = async () => {
    const agentcode = normalizeString(selectedAgentcode);
    if (!agentcode) {
      setFeedback({
        tone: "error",
        message: "에이전트를 선택하세요.",
      });
      return;
    }

    const agent = data.agents.find((item) => normalizeString(item.agentcode) === agentcode);
    await runStoreAction({
      actionKey: "agentcode",
      route: STORE_ROUTE_UPDATE_AGENTCODE,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        agentcode,
      },
      successMessage: "에이전트 배정을 저장했습니다.",
      errorFallback: "에이전트 배정 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({
          agentcode,
          agentName: normalizeString(agent?.agentName) || agentcode,
          agentLogo: normalizeString(agent?.agentLogo),
        });
      },
    });
  };

  const savePaymentUrl = async () => {
    const paymentUrl = normalizeString(paymentUrlInput);
    if (!isValidUrl(paymentUrl)) {
      setFeedback({
        tone: "error",
        message: "결제 URL 형식이 올바르지 않습니다.",
      });
      return;
    }

    await runStoreAction({
      actionKey: "payment-url",
      route: STORE_ROUTE_UPDATE_PAYMENT_URL,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        paymentUrl,
      },
      successMessage: paymentUrl ? "결제 URL을 저장했습니다." : "결제 URL을 초기화했습니다.",
      errorFallback: "결제 URL 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ paymentUrl });
      },
    });
  };

  const saveMaxPaymentAmount = async () => {
    const maxPaymentAmountKRW = Number(sanitizeDigits(maxPaymentAmountInput || "0"));
    if (
      !Number.isFinite(maxPaymentAmountKRW)
      || maxPaymentAmountKRW < 1000
      || maxPaymentAmountKRW > 10000000
    ) {
      setFeedback({
        tone: "error",
        message: "최대 결제 금액은 1,000 ~ 10,000,000 KRW 범위로 설정하세요.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: "max-payment",
      route: STORE_ROUTE_UPDATE_MAX_PAYMENT_AMOUNT,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        maxPaymentAmountKRW,
      },
      successMessage: "최대 결제 금액을 저장했습니다.",
      errorFallback: "최대 결제 금액 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ maxPaymentAmountKRW });
      },
    });

    if (payload) {
      setMaxPaymentAmountInput(String(maxPaymentAmountKRW));
    }
  };

  const saveAccessToken = async (nextValue: string) => {
    const accessToken = normalizeString(nextValue);
    if (accessToken && (accessToken.length < 5 || accessToken.length > 100)) {
      setFeedback({
        tone: "error",
        message: "Access Token은 5자 이상 100자 이하로 설정하세요.",
      });
      return;
    }

    const payload = await runStoreAction({
      actionKey: accessToken ? "access-token" : "access-token-reset",
      route: STORE_ROUTE_UPDATE_ACCESS_TOKEN,
      actionFields: {
        storecode,
        walletAddress: activeAccount?.address,
        accessToken,
      },
      successMessage: accessToken ? "Access Token을 저장했습니다." : "Access Token을 초기화했습니다.",
      errorFallback: "Access Token 저장에 실패했습니다.",
      onSuccess: () => {
        patchStore({ accessToken });
      },
    });

    if (payload) {
      setAccessTokenInput(accessToken);
    }
  };

  const toggleView = async () => {
    const nextValue = !(data.store?.viewOnAndOff === false);
    await runStoreAction({
      actionKey: "toggle-view",
      route: STORE_ROUTE_TOGGLE_VIEW,
      actionFields: {
        storecode,
        viewOnAndOff: nextValue,
      },
      successMessage: `가맹점 노출 상태를 ${nextValue ? "노출중" : "비노출"}으로 변경했습니다.`,
      errorFallback: "가맹점 노출 상태 변경에 실패했습니다.",
      onSuccess: () => {
        patchStore({ viewOnAndOff: nextValue });
      },
    });
  };

  const store = data.store;
  const currentAdminWalletCandidate = useMemo(() => {
    const currentWallet = normalizeString(store?.adminWalletAddress).toLowerCase();
    if (!currentWallet) {
      return null;
    }
    return data.adminWalletCandidates.find((item) => {
      return normalizeString(item.walletAddress).toLowerCase() === currentWallet;
    }) || null;
  }, [data.adminWalletCandidates, store?.adminWalletAddress]);

  const heroStatusLabel = loading
    ? "Loading store settings"
    : refreshing
      ? "Refreshing store settings"
      : "Store settings synced";

  const walletStateLabel = canReadSignedData
    ? "Admin wallet signed"
    : isWalletRecovering
      ? "Checking admin wallet connection"
      : "Signed admin wallet required";

  const storeConsoleUrl = `/${lang}/${storecode}/buyorder`;
  const remoteBaseUrl = normalizeString(data.remoteBackendBaseUrl);
  const publicStoreConsoleUrl = remoteBaseUrl
    ? `${remoteBaseUrl}/${lang}/${storecode}/buyorder`
    : "";

  return (
    <div className="min-h-screen px-4 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-6 pb-10">
        <section className="console-hero overflow-hidden rounded-[34px] text-white">
          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/${lang}/admin/store-management`)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100 transition hover:bg-white/12"
                  >
                    <span aria-hidden="true">←</span>
                    Back to store ledger
                  </button>
                  <div>
                    <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white sm:text-[3.1rem]">
                      {normalizeString(store?.storeName) || storecode}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/82 sm:text-[15px]">
                      가맹점 브랜드 정보, 출금 계좌, 관리자 지갑, 결제 키, 노출 상태를 콘솔에서 직접 제어합니다.
                    </p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-100">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" />
                  {heroStatusLabel}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Storecode
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {storecode}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">{walletStateLabel}</div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Exposure
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {store?.viewOnAndOff === false ? "비노출" : "노출중"}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    마지막 동기화 {data.fetchedAt ? formatDateTime(data.fetchedAt) : "대기 중"}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
                  <div className="console-mono text-[10px] uppercase tracking-[0.18em] text-slate-300/70">
                    Admin wallet
                  </div>
                  <div className="mt-3 text-xl font-semibold tracking-[-0.04em] text-white">
                    {shortAddress(store?.adminWalletAddress)}
                  </div>
                  <div className="mt-1 text-xs text-slate-300/75">
                    {currentAdminWalletCandidate?.nickname
                      ? `${currentAdminWalletCandidate.nickname} 연결`
                      : "현재 설정된 관리자 지갑"}
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
              disconnectedMessage={
                isWalletRecovering
                  ? "지갑 연결 상태를 확인하는 중입니다."
                  : "관리자 지갑 연결 후 상세 설정 저장이 가능합니다."
              }
              errorMessage={
                !canReadSignedData && !isWalletRecovering
                  ? "민감 설정과 관리자 지갑 이력은 관리자 지갑 서명 후 조회됩니다."
                  : undefined
              }
              accessLabel="Admin store settings"
              title="Admin wallet"
            />
          </div>
        </section>

        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Confirmed orders"
            value={normalizeNumber(store?.totalPaymentConfirmedCount).toLocaleString()}
            unit="orders"
            helper="확정된 구매 주문 수"
          />
          <MetricCard
            label="Trade volume"
            value={formatUsdtDisplay(normalizeNumber(store?.totalUsdtAmount))}
            unit="USDT"
            helper="누적 USDT 거래량"
          />
          <MetricCard
            label="Members"
            value={normalizeNumber(store?.totalBuyerCount).toLocaleString()}
            unit="buyers"
            helper="가맹점 회원 수"
          />
          <MetricCard
            label="Settlement"
            value={formatKrwDisplay(normalizeNumber(store?.totalSettlementAmountKRW))}
            unit="KRW"
            helper={`현재 에스크로 ${formatUsdtDisplay(normalizeNumber(store?.escrowAmountUSDT))} USDT`}
          />
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-6">
            <SettingsCard
              eyebrow="Store identity"
              title="브랜드와 노출 상태"
              description="메인 프로젝트의 가맹점 상세설정 API를 그대로 사용해 브랜드 정보와 노출 상태를 분리 저장합니다."
              action={(
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void loadContext({ silent: true })}
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    {refreshing ? "새로고침 중..." : "새로고침"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleView}
                    disabled={pendingActionKey === "toggle-view"}
                    className={`inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition ${
                      store?.viewOnAndOff === false
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "bg-rose-600 text-white hover:bg-rose-500"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {pendingActionKey === "toggle-view"
                      ? "변경 중..."
                      : store?.viewOnAndOff === false
                        ? "노출로 전환"
                        : "비노출로 전환"}
                  </button>
                </div>
              )}
            >
              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)]">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                      {normalizeString(profileForm.storeLogo) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={normalizeString(profileForm.storeLogo)}
                          alt={normalizeString(profileForm.storeName) || storecode}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="console-display text-xl font-semibold text-slate-500">
                          {(normalizeString(profileForm.storeName) || storecode).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold text-slate-950">
                        {normalizeString(profileForm.storeName) || "이름 미설정"}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{storecode}</div>
                      <div className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">
                        {normalizeString(profileForm.storeDescription) || "가맹점 소개가 아직 없습니다."}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <CurrentValue label="생성일" value={formatDateTime(store?.createdAt)} />
                    <CurrentValue
                      label="스토어 콘솔"
                      value={publicStoreConsoleUrl || storeConsoleUrl}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.open(storeConsoleUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      스토어 콘솔 열기
                    </button>
                    {normalizeString(store?.paymentUrl) ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined" && normalizeString(store?.paymentUrl)) {
                            window.open(normalizeString(store?.paymentUrl), "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        결제 URL 열기
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[26px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">가맹점 이름</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          메인 프로젝트의 이름 변경 API와 동일한 제약을 적용합니다.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={saveStoreName}
                        disabled={pendingActionKey === "store-name"}
                        className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {pendingActionKey === "store-name" ? "저장 중..." : "이름 저장"}
                      </button>
                    </div>
                    <input
                      value={profileForm.storeName}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, storeName: event.target.value }));
                      }}
                      placeholder="가맹점 이름"
                      className={`${fieldClassName} mt-4`}
                    />
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">가맹점 소개</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          메인 상세설정 페이지와 같은 소개 문구를 운영 콘솔에서 수정합니다.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={saveStoreDescription}
                        disabled={pendingActionKey === "store-description"}
                        className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {pendingActionKey === "store-description" ? "저장 중..." : "소개 저장"}
                      </button>
                    </div>
                    <textarea
                      value={profileForm.storeDescription}
                      onChange={(event) => {
                        setProfileForm((current) => ({
                          ...current,
                          storeDescription: event.target.value,
                        }));
                      }}
                      placeholder="가맹점 소개"
                      className={`${textAreaClassName} mt-4`}
                    />
                  </div>

                  <div className="rounded-[26px] border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">로고 URL</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          업로드 대신 URL 저장 방식으로 메인 로고 설정 API를 연결했습니다.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={saveStoreLogo}
                        disabled={pendingActionKey === "store-logo"}
                        className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                      >
                        {pendingActionKey === "store-logo" ? "저장 중..." : "로고 저장"}
                      </button>
                    </div>
                    <input
                      value={profileForm.storeLogo}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, storeLogo: event.target.value }));
                      }}
                      placeholder="https://..."
                      className={`${fieldClassName} mt-4`}
                    />
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Withdrawal accounts"
              title="출금 계좌 프리셋"
              description="일반, 1등급, 2등급 출금 계좌를 각각 저장합니다. 메인 가맹점 설정 페이지와 동일한 API를 사용합니다."
            >
              <div className="grid gap-4 xl:grid-cols-3">
                <BankInfoEditor
                  title="기본 출금 계좌"
                  description="일반 회원 및 기본 출금 흐름에 사용됩니다."
                  toneClassName="text-sky-600"
                  form={withdrawalMainForm}
                  onChange={setWithdrawalMainForm}
                  saving={pendingActionKey === "bank-main"}
                  onSave={() => {
                    void saveWithdrawalForm({
                      actionKey: "bank-main",
                      route: STORE_ROUTE_SET_WITHDRAWAL_BANK_INFO,
                      form: withdrawalMainForm,
                      storePatchKey: "withdrawalBankInfo",
                    });
                  }}
                />
                <BankInfoEditor
                  title="1등급 출금 계좌"
                  description="AAA 등급 회원 출금용 계좌입니다."
                  toneClassName="text-emerald-600"
                  form={withdrawalAAAForm}
                  onChange={setWithdrawalAAAForm}
                  saving={pendingActionKey === "bank-aaa"}
                  onSave={() => {
                    void saveWithdrawalForm({
                      actionKey: "bank-aaa",
                      route: STORE_ROUTE_SET_WITHDRAWAL_BANK_INFO_AAA,
                      form: withdrawalAAAForm,
                      storePatchKey: "withdrawalBankInfoAAA",
                    });
                  }}
                />
                <BankInfoEditor
                  title="2등급 출금 계좌"
                  description="BBB 등급 회원 출금용 계좌입니다."
                  toneClassName="text-amber-600"
                  form={withdrawalBBBForm}
                  onChange={setWithdrawalBBBForm}
                  saving={pendingActionKey === "bank-bbb"}
                  onSave={() => {
                    void saveWithdrawalForm({
                      actionKey: "bank-bbb",
                      route: STORE_ROUTE_SET_WITHDRAWAL_BANK_INFO_BBB,
                      form: withdrawalBBBForm,
                      storePatchKey: "withdrawalBankInfoBBB",
                    });
                  }}
                />
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Routing and limits"
              title="운영 파라미터"
              description="에이전트 배정, 결제 URL, 결제 상한, 배경색, 에스크로 수량을 분리 저장합니다."
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                  <div className="text-sm font-semibold text-slate-900">에이전트 배정</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    가맹점의 agentcode를 변경하면 목록 페이지의 에이전트 표시도 함께 바뀝니다.
                  </div>
                  <select
                    value={selectedAgentcode}
                    onChange={(event) => setSelectedAgentcode(event.target.value)}
                    className={`${fieldClassName} mt-4`}
                  >
                    <option value="">에이전트 선택</option>
                    {data.agents.map((agent) => (
                      <option key={normalizeString(agent.agentcode)} value={normalizeString(agent.agentcode)}>
                        {normalizeString(agent.agentName) || normalizeString(agent.agentcode) || "에이전트"}
                      </option>
                    ))}
                  </select>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={saveAgentcode}
                      disabled={pendingActionKey === "agentcode"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "agentcode" ? "저장 중..." : "에이전트 저장"}
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                  <div className="text-sm font-semibold text-slate-900">결제 URL</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    결제 페이지 링크 생성 기능에서 사용하는 base URL입니다. 빈 값으로 저장하면 제거됩니다.
                  </div>
                  <input
                    value={paymentUrlInput}
                    onChange={(event) => setPaymentUrlInput(event.target.value)}
                    placeholder="https://payment.example.com"
                    className={`${fieldClassName} mt-4`}
                  />
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    {normalizeString(store?.paymentUrl) ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== "undefined" && normalizeString(store?.paymentUrl)) {
                            window.open(normalizeString(store?.paymentUrl), "_blank", "noopener,noreferrer");
                          }
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                      >
                        현재 URL 열기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={savePaymentUrl}
                      disabled={pendingActionKey === "payment-url"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "payment-url" ? "저장 중..." : "결제 URL 저장"}
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                  <div className="text-sm font-semibold text-slate-900">최대 결제 금액</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    결제 링크 생성과 주문 입력에 사용되는 KRW 상한입니다.
                  </div>
                  <input
                    value={maxPaymentAmountInput}
                    onChange={(event) => setMaxPaymentAmountInput(sanitizeDigits(event.target.value))}
                    placeholder="1000000"
                    className={`${fieldClassName} mt-4`}
                    inputMode="numeric"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    현재 값 {formatKrwDisplay(store?.maxPaymentAmountKRW)} KRW
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={saveMaxPaymentAmount}
                      disabled={pendingActionKey === "max-payment"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "max-payment" ? "저장 중..." : "상한 저장"}
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5">
                  <div className="text-sm font-semibold text-slate-900">배경색</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    가맹점 페이지의 배경 기준 색상입니다.
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input
                      type="color"
                      value={normalizeHexColor(backgroundColor)}
                      onChange={(event) => setBackgroundColor(event.target.value)}
                      className="h-11 w-16 rounded-2xl border border-slate-200 bg-white p-1"
                    />
                    <input
                      value={backgroundColor}
                      onChange={(event) => setBackgroundColor(event.target.value)}
                      placeholder="#0f172a"
                      className={`${fieldClassName} flex-1`}
                    />
                  </div>
                  <div
                    className="mt-4 h-16 rounded-[22px] border border-slate-200"
                    style={{ backgroundColor: normalizeHexColor(backgroundColor) }}
                  />
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={saveBackgroundColor}
                      disabled={pendingActionKey === "background-color"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "background-color" ? "저장 중..." : "배경색 저장"}
                    </button>
                  </div>
                </div>

                <div className="rounded-[26px] border border-slate-200 bg-white p-5 xl:col-span-2">
                  <div className="text-sm font-semibold text-slate-900">에스크로 수량</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    메인 프로젝트의 에스크로 수량 변경 API와 연결됩니다.
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={escrowAmountInput}
                      onChange={(event) => setEscrowAmountInput(sanitizeDecimal(event.target.value))}
                      placeholder="1000"
                      className={`${fieldClassName} flex-1`}
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      onClick={saveEscrowAmount}
                      disabled={pendingActionKey === "escrow-amount"}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "escrow-amount" ? "저장 중..." : "에스크로 저장"}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    현재 값 {formatUsdtDisplay(store?.escrowAmountUSDT)} USDT
                  </div>
                </div>
              </div>
            </SettingsCard>
          </div>

          <div className="space-y-6">
            <SettingsCard
              eyebrow="Admin wallet"
              title="가맹점 관리자 지갑"
              description="일반 지갑 회원 중 검증된 사용자를 가맹점 관리자 지갑으로 지정하고, 변경 이력을 바로 확인합니다."
            >
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CurrentValue
                    label="현재 관리자 지갑"
                    value={shortAddress(store?.adminWalletAddress)}
                  />
                  <CurrentValue
                    label="현재 관리자"
                    value={
                      normalizeString(currentAdminWalletCandidate?.nickname)
                      || normalizeString(currentAdminWalletCandidate?.buyer?.depositName)
                      || "미확인"
                    }
                  />
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-sm font-semibold text-slate-900">관리자 지갑 변경</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    검증된 일반 회원 지갑만 선택 가능합니다.
                  </div>
                  <select
                    value={selectedAdminWalletAddress}
                    onChange={(event) => setSelectedAdminWalletAddress(event.target.value)}
                    className={`${fieldClassName} mt-4`}
                  >
                    <option value="">관리자 지갑 선택</option>
                    {data.adminWalletCandidates.map((candidate) => {
                      const walletAddress = normalizeString(candidate.walletAddress);
                      const labelName =
                        normalizeString(candidate.nickname)
                        || normalizeString(candidate.buyer?.depositName)
                        || shortAddress(walletAddress);

                      return (
                        <option key={walletAddress || candidate._id} value={walletAddress}>
                          {labelName} · {shortAddress(walletAddress)}
                        </option>
                      );
                    })}
                  </select>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={saveAdminWalletAddress}
                      disabled={pendingActionKey === "admin-wallet"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "admin-wallet" ? "변경 중..." : "관리자 지갑 저장"}
                    </button>
                  </div>
                </div>

                {data.adminWalletCandidatesError ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {data.adminWalletCandidatesError}
                  </div>
                ) : null}

                {data.adminWalletHistoryError ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {data.adminWalletHistoryError}
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">최근 변경 이력</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        관리자 지갑 변경 전후 주소와 요청 지갑, IP, route를 기록합니다.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadContext({ silent: true })}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      이력 새로고침
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <CurrentValue
                      label="이력 건수"
                      value={`${data.adminWalletHistory.length.toLocaleString()}건`}
                    />
                    <CurrentValue
                      label="실제 변경 건수"
                      value={`${data.adminWalletHistory.filter((item) => item?.changed).length.toLocaleString()}건`}
                    />
                  </div>

                  <div className="mt-4 grid gap-3">
                    {data.adminWalletHistory.length > 0 ? (
                      data.adminWalletHistory.map((item) => (
                        <HistoryRow key={item._id || `${item.updatedAt}-${item.after}`} item={item} />
                      ))
                    ) : (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                        관리자 지갑 이력이 아직 없습니다. 관리자 지갑 서명 후 조회 시 최신 20건까지 표시됩니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Payment keys"
              title="PAYACTION 키"
              description="API KEY, WEBHOOK KEY, SHOP ID를 저장하거나 초기화합니다."
              action={(
                <button
                  type="button"
                  onClick={resetPayactionKeys}
                  disabled={pendingActionKey === "payaction-reset"}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {pendingActionKey === "payaction-reset" ? "초기화 중..." : "키 초기화"}
                </button>
              )}
            >
              <div className="space-y-4">
                <div className="grid gap-3">
                  <input
                    value={payactionForm.payactionApiKey}
                    onChange={(event) => {
                      setPayactionForm((current) => ({
                        ...current,
                        payactionApiKey: event.target.value,
                      }));
                    }}
                    placeholder="PAYACTION API KEY"
                    className={fieldClassName}
                  />
                  <input
                    value={payactionForm.payactionWebhookKey}
                    onChange={(event) => {
                      setPayactionForm((current) => ({
                        ...current,
                        payactionWebhookKey: event.target.value,
                      }));
                    }}
                    placeholder="PAYACTION WEBHOOK KEY"
                    className={fieldClassName}
                  />
                  <input
                    value={payactionForm.payactionShopId}
                    onChange={(event) => {
                      setPayactionForm((current) => ({
                        ...current,
                        payactionShopId: event.target.value,
                      }));
                    }}
                    placeholder="PAYACTION SHOP ID"
                    className={fieldClassName}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <CurrentValue
                    label="현재 API KEY"
                    value={normalizeString(store?.payactionKey?.payactionApiKey) || "-"}
                  />
                  <CurrentValue
                    label="현재 WEBHOOK KEY"
                    value={normalizeString(store?.payactionKey?.payactionWebhookKey) || "-"}
                  />
                  <CurrentValue
                    label="현재 SHOP ID"
                    value={normalizeString(store?.payactionKey?.payactionShopId) || "-"}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={savePayactionKeys}
                    disabled={pendingActionKey === "payaction"}
                    className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {pendingActionKey === "payaction" ? "저장 중..." : "PAYACTION 키 저장"}
                  </button>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Access token"
              title="결제 URL Access Token"
              description="가맹점 결제 페이지 접근 토큰을 생성, 저장, 초기화합니다."
            >
              <div className="space-y-4">
                <CurrentValue
                  label="현재 Access Token"
                  value={normalizeString(store?.accessToken) || "-"}
                />
                <div className="flex flex-col gap-3">
                  <input
                    value={accessTokenInput}
                    onChange={(event) => setAccessTokenInput(event.target.value)}
                    placeholder="Access Token"
                    className={fieldClassName}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setAccessTokenInput(createAccessToken())}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      랜덤 생성
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveAccessToken("")}
                      disabled={pendingActionKey === "access-token-reset"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      {pendingActionKey === "access-token-reset" ? "초기화 중..." : "초기화"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveAccessToken(accessTokenInput)}
                      disabled={pendingActionKey === "access-token"}
                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {pendingActionKey === "access-token" ? "저장 중..." : "Access Token 저장"}
                    </button>
                  </div>
                </div>
              </div>
            </SettingsCard>
          </div>
        </div>

        {data.agentsError ? (
          <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {data.agentsError}
          </section>
        ) : null}
      </div>
    </div>
  );
}
