"use client";

import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import {
  CLIENT_EXCHANGE_RATE_KEYS,
  clientExchangeRateMapToForm,
  createEmptyClientExchangeRateForm,
  isClientExchangeRateInput,
  parseClientExchangeRateForm,
  parseClientExchangeRateHistoryItem,
  type ClientExchangeRateForm,
  type ClientExchangeRateHistoryItem,
  type ClientExchangeRateHistoryType,
  type ClientExchangeRateKey,
} from "@/lib/client-settings";
import {
  CLIENT_SETTINGS_ADMIN_MUTATION_SIGNING_PREFIX,
  CLIENT_SETTINGS_ADMIN_READ_SIGNING_PREFIX,
  CLIENT_SETTINGS_ADMIN_UPLOAD_ROUTE,
  CLIENT_SETTINGS_ADMIN_UPLOAD_SIGNING_PREFIX,
  CLIENT_SETTINGS_GET_RATE_HISTORY_ROUTE,
  CLIENT_SETTINGS_UPDATE_AVATAR_ROUTE,
  CLIENT_SETTINGS_UPDATE_BUY_RATE_ROUTE,
  CLIENT_SETTINGS_UPDATE_PAYACTION_ROUTE,
  CLIENT_SETTINGS_UPDATE_PROFILE_ROUTE,
  CLIENT_SETTINGS_UPDATE_SELL_RATE_ROUTE,
} from "@/lib/security/client-settings-admin";
import { thirdwebClient } from "@/lib/thirdweb-client";

type ClientSettingsConsoleClientProps = {
  lang: string;
};

type ClientProfileForm = {
  name: string;
  description: string;
};

type AdminUser = {
  nickname?: string;
  walletAddress?: string;
  storecode?: string;
  role?: string;
  rold?: string;
};

type FeedbackState = {
  tone: "success" | "error" | "info";
  message: string;
};

const HISTORY_LIMIT = 10;

const CHAIN_META: Record<string, { label: string; tone: string }> = {
  ethereum: {
    label: "Ethereum",
    tone: "text-slate-100",
  },
  polygon: {
    label: "Polygon",
    tone: "text-fuchsia-100",
  },
  bsc: {
    label: "BSC",
    tone: "text-amber-100",
  },
  arbitrum: {
    label: "Arbitrum",
    tone: "text-sky-100",
  },
};

const RATE_FIELD_META: Array<{
  key: ClientExchangeRateKey;
  label: string;
  description: string;
}> = [
  { key: "USD", label: "USD", description: "미국 달러 기준" },
  { key: "KRW", label: "KRW", description: "원화 정산 기준" },
  { key: "JPY", label: "JPY", description: "일본 엔화 기준" },
  { key: "CNY", label: "CNY", description: "중국 위안 기준" },
  { key: "EUR", label: "EUR", description: "유로화 기준" },
];

const numberFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const createEmptyProfileForm = (): ClientProfileForm => ({
  name: "",
  description: "",
});

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const formatWalletAddress = (value: string | undefined) => {
  const safe = normalizeString(value);
  if (!safe) {
    return "Not connected";
  }
  if (safe.length <= 12) {
    return safe;
  }
  return `${safe.slice(0, 6)}...${safe.slice(-4)}`;
};

const formatDateTime = (value: string | undefined) => {
  const safe = normalizeString(value);
  if (!safe) {
    return "-";
  }

  const parsed = new Date(safe);
  if (Number.isNaN(parsed.getTime())) {
    return safe;
  }

  return parsed.toLocaleString("ko-KR");
};

const formatRateValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return numberFormatter.format(value);
};

const areRateFormsEqual = (left: ClientExchangeRateForm, right: ClientExchangeRateForm) =>
  CLIENT_EXCHANGE_RATE_KEYS.every((key) => left[key] === right[key]);

const isAdminUser = (user: AdminUser | null) => {
  const storecode = normalizeString(user?.storecode).toLowerCase();
  const role = normalizeString(user?.role || user?.rold).toLowerCase();
  return storecode === "admin" && role === "admin";
};

const mergeHistoryEntry = (
  current: ClientExchangeRateHistoryItem[],
  incoming: ClientExchangeRateHistoryItem,
) => {
  return [incoming, ...current.filter((item) => item._id !== incoming._id)].slice(0, HISTORY_LIMIT);
};

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

const MetricCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) => {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-white">
      <div className="console-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="console-display mt-3 text-[1.6rem] font-semibold tracking-[-0.05em] text-white">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-300">{hint}</div>
    </div>
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
    <div className={`rounded-[22px] border px-4 py-3 text-sm font-medium ${toneClass}`}>
      {feedback.message}
    </div>
  );
};

const HistoryPanel = ({
  tone,
  loaded,
  loading,
  items,
  onLoad,
  disabled,
}: {
  tone: "sky" | "emerald";
  loaded: boolean;
  loading: boolean;
  items: ClientExchangeRateHistoryItem[];
  onLoad: () => void;
  disabled: boolean;
}) => {
  const accentClass = tone === "sky" ? "text-sky-700 border-sky-200 bg-sky-50" : "text-emerald-700 border-emerald-200 bg-emerald-50";
  const badgeClass = tone === "sky" ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700";

  return (
    <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">최근 변경 이력</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            저장 시점의 변경 전/후 환율과 변경 관리자 정보가 기록됩니다.
          </div>
        </div>
        <button
          type="button"
          onClick={onLoad}
          disabled={disabled || loading}
          className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${accentClass} ${
            disabled || loading ? "cursor-not-allowed opacity-50" : "hover:brightness-[1.02]"
          }`}
        >
          {loading ? "불러오는 중..." : loaded ? "이력 새로고침" : "이력 보기"}
        </button>
      </div>

      {!loaded ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          관리자 지갑 연결 후 최근 {HISTORY_LIMIT}건의 변경 이력을 조회할 수 있습니다.
        </div>
      ) : null}

      {loaded && items.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
          저장된 환율 변경 이력이 없습니다.
        </div>
      ) : null}

      {loaded && items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const changedKeys = item.changedKeys.length > 0 ? item.changedKeys : CLIENT_EXCHANGE_RATE_KEYS;
            const actorLabel = item.requesterNickname
              ? `${item.requesterNickname} · ${formatWalletAddress(item.requesterWalletAddress)}`
              : formatWalletAddress(item.requesterWalletAddress);

            return (
              <div
                key={item._id || `${item.rateType}-${item.updatedAt}`}
                className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{actorLabel}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDateTime(item.updatedAt)}
                      {item.requesterRole ? ` · ${item.requesterRole}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {changedKeys.map((key) => (
                      <span
                        key={`${item._id}-${key}`}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${badgeClass}`}
                      >
                        {key}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {changedKeys.map((key) => (
                    <div
                      key={`${item._id}-${key}-row`}
                      className="grid grid-cols-[56px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-[18px] border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-slate-700">{key}</span>
                      <span className="truncate text-slate-500">{formatRateValue(item.before[key])}</span>
                      <span className="text-slate-400">→</span>
                      <span className="truncate text-right font-semibold text-slate-950">
                        {formatRateValue(item.after[key])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

const fieldClassName =
  "h-12 w-full rounded-[18px] border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";
const textareaClassName =
  "w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export default function ClientSettingsConsoleClient({ lang }: ClientSettingsConsoleClientProps) {
  const activeAccount = useActiveAccount();
  const address = normalizeString(activeAccount?.address);

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chain, setChain] = useState("arbitrum");
  const [clientId, setClientId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [payactionViewOn, setPayactionViewOn] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const [profileForm, setProfileForm] = useState<ClientProfileForm>(createEmptyProfileForm());
  const [profileSnapshot, setProfileSnapshot] = useState<ClientProfileForm>(createEmptyProfileForm());

  const [buyRatesForm, setBuyRatesForm] = useState<ClientExchangeRateForm>(createEmptyClientExchangeRateForm());
  const [buyRatesSnapshot, setBuyRatesSnapshot] = useState<ClientExchangeRateForm>(createEmptyClientExchangeRateForm());
  const [buyRateHistory, setBuyRateHistory] = useState<ClientExchangeRateHistoryItem[]>([]);
  const [buyRateHistoryLoaded, setBuyRateHistoryLoaded] = useState(false);
  const [buyRateHistoryLoading, setBuyRateHistoryLoading] = useState(false);

  const [sellRatesForm, setSellRatesForm] = useState<ClientExchangeRateForm>(createEmptyClientExchangeRateForm());
  const [sellRatesSnapshot, setSellRatesSnapshot] = useState<ClientExchangeRateForm>(createEmptyClientExchangeRateForm());
  const [sellRateHistory, setSellRateHistory] = useState<ClientExchangeRateHistoryItem[]>([]);
  const [sellRateHistoryLoaded, setSellRateHistoryLoaded] = useState(false);
  const [sellRateHistoryLoading, setSellRateHistoryLoading] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingBuyRates, setSavingBuyRates] = useState(false);
  const [savingSellRates, setSavingSellRates] = useState(false);
  const [updatingPayaction, setUpdatingPayaction] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const editable = Boolean(address) && isAdmin;
  const profileDirty =
    profileForm.name !== profileSnapshot.name
    || profileForm.description !== profileSnapshot.description;
  const buyRatesDirty = !areRateFormsEqual(buyRatesForm, buyRatesSnapshot);
  const sellRatesDirty = !areRateFormsEqual(sellRatesForm, sellRatesSnapshot);
  const pendingChangeCount = [profileDirty, buyRatesDirty, sellRatesDirty].filter(Boolean).length;
  const chainLabel = CHAIN_META[chain]?.label || chain || "Unknown";

  useEffect(() => {
    let cancelled = false;

    const loadContext = async () => {
      setLoading(true);

      try {
        const response = await fetch("/api/bff/admin/client-settings/context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: address,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(normalizeString(data?.error) || "센터 설정을 불러오지 못했습니다.");
        }

        if (cancelled) {
          return;
        }

        const result = (data?.result || {}) as Record<string, unknown>;
        const clientSettings = (result.clientSettings || {}) as Record<string, unknown>;
        const clientInfo = (clientSettings.clientInfo || {}) as Record<string, unknown>;
        const nextUser = (result.user || null) as AdminUser | null;
        const nextProfile = {
          name: normalizeString(clientInfo.name),
          description: normalizeString(clientInfo.description),
        };
        const nextBuyRates = clientExchangeRateMapToForm(clientInfo.exchangeRateUSDT);
        const nextSellRates = clientExchangeRateMapToForm(clientInfo.exchangeRateUSDTSell);

        setUser(nextUser);
        setIsAdmin(isAdminUser(nextUser));
        setChain(normalizeString(clientSettings.chain) || "arbitrum");
        setClientId(normalizeString(clientSettings.clientId));
        setAvatarUrl(normalizeString(clientInfo.avatar));
        setPayactionViewOn(Boolean(clientInfo.payactionViewOn));
        setProfileForm(nextProfile);
        setProfileSnapshot(nextProfile);
        setBuyRatesForm(nextBuyRates);
        setBuyRatesSnapshot(nextBuyRates);
        setSellRatesForm(nextSellRates);
        setSellRatesSnapshot(nextSellRates);
        setBuyRateHistory([]);
        setSellRateHistory([]);
        setBuyRateHistoryLoaded(false);
        setSellRateHistoryLoaded(false);
        setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "센터 설정을 불러오지 못했습니다.",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const updateRateField = (
    setter: React.Dispatch<React.SetStateAction<ClientExchangeRateForm>>,
    key: ClientExchangeRateKey,
    value: string,
  ) => {
    if (!isClientExchangeRateInput(value)) {
      return;
    }

    setter((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const postSignedClientAction = async ({
    route,
    signingPrefix,
    actionFields,
  }: {
    route: string;
    signingPrefix: string;
    actionFields: Record<string, unknown>;
  }) => {
    if (!activeAccount || !address) {
      throw new Error("관리자 지갑 연결이 필요합니다.");
    }

    const signedBody = await createAdminSignedBody({
      account: activeAccount,
      route,
      signingPrefix,
      actionFields,
      requesterWalletAddress: address,
    });

    const response = await fetch("/api/bff/admin/client-settings/signed-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route,
        signedBody,
      }),
    });

    const data = await response.json().catch(() => null);
    return {
      response,
      data,
    };
  };

  const applyHistoryEntry = (
    rateType: ClientExchangeRateHistoryType,
    nextHistoryEntry: ClientExchangeRateHistoryItem | null,
  ) => {
    if (!nextHistoryEntry) {
      return;
    }

    if (rateType === "buy") {
      setBuyRateHistoryLoaded(true);
      setBuyRateHistory((current) => mergeHistoryEntry(current, nextHistoryEntry));
      return;
    }

    setSellRateHistoryLoaded(true);
    setSellRateHistory((current) => mergeHistoryEntry(current, nextHistoryEntry));
  };

  const loadRateHistory = async (rateType: ClientExchangeRateHistoryType) => {
    if (!editable) {
      setFeedback({
        tone: "info",
        message: "관리자 지갑 연결 후 변경 이력을 조회할 수 있습니다.",
      });
      return;
    }

    const setLoadingState = rateType === "buy" ? setBuyRateHistoryLoading : setSellRateHistoryLoading;
    const setLoadedState = rateType === "buy" ? setBuyRateHistoryLoaded : setSellRateHistoryLoaded;
    const setHistoryState = rateType === "buy" ? setBuyRateHistory : setSellRateHistory;

    setLoadingState(true);

    try {
      const { response, data } = await postSignedClientAction({
        route: CLIENT_SETTINGS_GET_RATE_HISTORY_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_READ_SIGNING_PREFIX,
        actionFields: {
          rateType,
          limit: HISTORY_LIMIT,
        },
      });

      if (!response.ok || !Array.isArray(data?.result)) {
        throw new Error(normalizeString(data?.error) || "변경 이력을 불러오지 못했습니다.");
      }

      const items = data.result
        .map(parseClientExchangeRateHistoryItem)
        .filter(
          (item: ClientExchangeRateHistoryItem | null): item is ClientExchangeRateHistoryItem =>
            Boolean(item),
        );

      setHistoryState(items);
      setLoadedState(true);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "변경 이력을 불러오지 못했습니다.",
      });
    } finally {
      setLoadingState(false);
    }
  };

  const saveProfile = async () => {
    if (!editable || !profileDirty || savingProfile) {
      return;
    }

    setSavingProfile(true);
    setFeedback(null);

    try {
      const { response, data } = await postSignedClientAction({
        route: CLIENT_SETTINGS_UPDATE_PROFILE_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_MUTATION_SIGNING_PREFIX,
        actionFields: profileForm,
      });

      if (!response.ok || !data?.result) {
        throw new Error(normalizeString(data?.error) || "센터 정보 저장에 실패했습니다.");
      }

      setProfileSnapshot(profileForm);
      setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      setFeedback({
        tone: "success",
        message: "센터 정보가 저장되었습니다.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "센터 정보 저장에 실패했습니다.",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveBuyRates = async () => {
    if (!editable || !buyRatesDirty || savingBuyRates) {
      return;
    }

    const nextRates = parseClientExchangeRateForm(buyRatesForm);
    if (!nextRates) {
      setFeedback({
        tone: "error",
        message: "환율(살때) 값을 다시 확인해주세요.",
      });
      return;
    }

    setSavingBuyRates(true);
    setFeedback(null);

    try {
      const { response, data } = await postSignedClientAction({
        route: CLIENT_SETTINGS_UPDATE_BUY_RATE_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_MUTATION_SIGNING_PREFIX,
        actionFields: {
          exchangeRateUSDT: nextRates,
        },
      });

      if (!response.ok || !data?.result) {
        throw new Error(normalizeString(data?.error) || "환율(살때) 저장에 실패했습니다.");
      }

      const normalizedForm = clientExchangeRateMapToForm(nextRates);
      setBuyRatesForm(normalizedForm);
      setBuyRatesSnapshot(normalizedForm);
      applyHistoryEntry("buy", parseClientExchangeRateHistoryItem(data?.historyEntry));
      setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      setFeedback({
        tone: "success",
        message: "환율(살때)가 저장되었습니다.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "환율(살때) 저장에 실패했습니다.",
      });
    } finally {
      setSavingBuyRates(false);
    }
  };

  const saveSellRates = async () => {
    if (!editable || !sellRatesDirty || savingSellRates) {
      return;
    }

    const nextRates = parseClientExchangeRateForm(sellRatesForm);
    if (!nextRates) {
      setFeedback({
        tone: "error",
        message: "환율(팔때) 값을 다시 확인해주세요.",
      });
      return;
    }

    setSavingSellRates(true);
    setFeedback(null);

    try {
      const { response, data } = await postSignedClientAction({
        route: CLIENT_SETTINGS_UPDATE_SELL_RATE_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_MUTATION_SIGNING_PREFIX,
        actionFields: {
          exchangeRateUSDTSell: nextRates,
        },
      });

      if (!response.ok || !data?.result) {
        throw new Error(normalizeString(data?.error) || "환율(팔때) 저장에 실패했습니다.");
      }

      const normalizedForm = clientExchangeRateMapToForm(nextRates);
      setSellRatesForm(normalizedForm);
      setSellRatesSnapshot(normalizedForm);
      applyHistoryEntry("sell", parseClientExchangeRateHistoryItem(data?.historyEntry));
      setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      setFeedback({
        tone: "success",
        message: "환율(팔때)가 저장되었습니다.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "환율(팔때) 저장에 실패했습니다.",
      });
    } finally {
      setSavingSellRates(false);
    }
  };

  const updatePayactionView = async (nextValue: boolean) => {
    if (!editable || updatingPayaction) {
      return;
    }

    setUpdatingPayaction(true);
    setFeedback(null);

    try {
      const { response, data } = await postSignedClientAction({
        route: CLIENT_SETTINGS_UPDATE_PAYACTION_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_MUTATION_SIGNING_PREFIX,
        actionFields: {
          payactionViewOn: nextValue,
        },
      });

      if (!response.ok || !data?.result) {
        throw new Error(normalizeString(data?.error) || "페이액션 설정 저장에 실패했습니다.");
      }

      setPayactionViewOn(nextValue);
      setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      setFeedback({
        tone: "success",
        message: "페이액션 사용 설정이 저장되었습니다.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "페이액션 설정 저장에 실패했습니다.",
      });
    } finally {
      setUpdatingPayaction(false);
    }
  };

  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.currentTarget.files?.[0] || null;
    setLogoFile(nextFile);
  };

  const uploadLogo = async () => {
    if (!editable) {
      setFeedback({
        tone: "info",
        message: "관리자 지갑 연결 후 로고를 변경할 수 있습니다.",
      });
      return;
    }

    if (!logoFile) {
      setFeedback({
        tone: "error",
        message: "업로드할 로고 파일을 선택해주세요.",
      });
      return;
    }

    if (!activeAccount || !address) {
      setFeedback({
        tone: "error",
        message: "관리자 지갑 연결이 필요합니다.",
      });
      return;
    }

    setUploadingLogo(true);
    setFeedback(null);

    try {
      const contentType = logoFile.type || "application/octet-stream";
      const signedUploadBody = await createAdminSignedBody({
        account: activeAccount,
        route: CLIENT_SETTINGS_ADMIN_UPLOAD_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_UPLOAD_SIGNING_PREFIX,
        actionFields: {
          contentType,
        },
        requesterWalletAddress: address,
      });

      const uploadResponse = await fetch("/api/bff/admin/client-settings/upload", {
        method: "POST",
        headers: {
          "content-type": contentType,
          "x-admin-requester-storecode": String(signedUploadBody.requesterStorecode || "admin"),
          "x-admin-requester-wallet-address": String(signedUploadBody.requesterWalletAddress || ""),
          "x-admin-signature": String(signedUploadBody.signature || ""),
          "x-admin-signed-at": String(signedUploadBody.signedAt || ""),
          "x-admin-nonce": String(signedUploadBody.nonce || ""),
        },
        body: logoFile,
      });

      const uploadData = await uploadResponse.json().catch(() => null);
      const uploadedUrl = normalizeString(uploadData?.url);
      if (!uploadResponse.ok || !uploadedUrl) {
        throw new Error(normalizeString(uploadData?.error) || "로고 업로드에 실패했습니다.");
      }

      const { response, data } = await postSignedClientAction({
        route: CLIENT_SETTINGS_UPDATE_AVATAR_ROUTE,
        signingPrefix: CLIENT_SETTINGS_ADMIN_MUTATION_SIGNING_PREFIX,
        actionFields: {
          avatar: uploadedUrl,
        },
      });

      if (!response.ok || !data?.result) {
        throw new Error(normalizeString(data?.error) || "로고 저장에 실패했습니다.");
      }

      setAvatarUrl(uploadedUrl);
      setLogoFile(null);
      setLastSyncedAt(new Date().toLocaleString("ko-KR"));
      setFeedback({
        tone: "success",
        message: "센터 로고가 저장되었습니다.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "로고 업로드에 실패했습니다.",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <main className="console-shell px-4 py-6 lg:px-6 xl:px-8">
      <div className="mx-auto max-w-[1640px] space-y-6">
        {feedback ? <FeedbackBanner feedback={feedback} /> : null}

        <section className="console-hero overflow-hidden rounded-[34px] px-6 py-6 text-white shadow-[0_42px_110px_-68px_rgba(15,23,42,0.85)] sm:px-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_420px]">
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/12"
              >
                이전 화면
              </button>

              <div className="space-y-3">
                <div className="console-mono inline-flex rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-sky-100">
                  Client settings console
                </div>
                <h1 className="console-display text-4xl font-semibold tracking-[-0.06em] text-white">
                  센터 시스템 설정
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300">
                  본서버의 `ko/admin/client-settings` 구조를 콘솔 프로젝트에 맞춰 이식했습니다. 센터
                  프로필, 매수/매도 환율, 변경 이력, 로고, 페이액션 상태를 한 화면에서 제어합니다.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard
                  label="Client ID"
                  value={clientId || "미설정"}
                  hint="원격 본서버에서 내려온 결제/시세 기준 client 식별값"
                />
                <MetricCard
                  label="Settlement Chain"
                  value={chainLabel}
                  hint="현재 클라이언트가 사용하는 정산 체인"
                />
                <MetricCard
                  label="Sync Status"
                  value={lastSyncedAt || (loading ? "불러오는 중" : "준비완료")}
                  hint={
                    pendingChangeCount > 0
                      ? `${pendingChangeCount}개 섹션에 미저장 변경이 있습니다.`
                      : "모든 변경사항이 저장된 상태입니다."
                  }
                />
              </div>
            </div>

            <div className="rounded-[30px] border border-white/10 bg-slate-950/66 p-5 text-white backdrop-blur">
              <div className="space-y-2">
                <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  Signed access
                </div>
                <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-white">
                  Wallet signature gate
                </h2>
                <p className="text-sm leading-6 text-slate-300">
                  관리자 지갑 연결 후 `storecode=admin`, `role=admin` 사용자인 경우에만 편집 기능이
                  활성화됩니다. 연결 전에는 읽기 전용 상태로 유지됩니다.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-[24px] border px-4 py-4 ${
                    editable
                      ? "border-emerald-400/20 bg-emerald-400/10"
                      : "border-white/10 bg-white/6"
                  }`}
                >
                  <div className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Connected wallet
                  </div>
                  <div className="mt-2 break-all text-sm font-medium text-white">
                    {address || "Not connected"}
                  </div>
                  <div className="mt-2 text-sm text-slate-300">
                    {editable
                      ? `${normalizeString(user?.nickname) || "admin"} 계정으로 편집 가능`
                      : address
                        ? "연결은 되었지만 admin 권한이 확인되지 않았습니다."
                        : "지갑 연결 후 서명 기반 설정 변경을 사용할 수 있습니다."}
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
                      {editable ? "Editor mode active" : "Read-only mode"}
                    </span>
                  </div>
                </div>

                {address && !editable ? (
                  <div className="rounded-[22px] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    이 지갑은 `admin` 권한이 확인되지 않아 수정 기능이 비활성화되어 있습니다.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
          <div className="space-y-6">
            <SettingsCard
              eyebrow="Center Identity"
              title="센터 정보 변경"
              description="센터 이름과 소개 문구를 별도 API로 저장합니다. 환율과 분리되어 즉시 반영됩니다."
              action={(
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={!editable || !profileDirty || savingProfile}
                  className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                    !editable || !profileDirty || savingProfile
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {savingProfile ? "저장 중..." : profileDirty ? "센터 정보 저장" : "저장 완료"}
                </button>
              )}
            >
              <div className="grid gap-5">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">센터 이름</span>
                  <input
                    value={profileForm.name}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    disabled={!editable}
                    placeholder="센터 이름"
                    className={fieldClassName}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-700">센터 소개</span>
                  <textarea
                    value={profileForm.description}
                    onChange={(event) =>
                      setProfileForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={5}
                    disabled={!editable}
                    placeholder="센터 소개 문구를 입력하세요."
                    className={textareaClassName}
                  />
                </label>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Market Buy Rates"
              title="환율(살때)"
              description="USDT를 고객이 구매할 때 사용하는 기준 환율입니다. 저장 시 변경 이력이 자동으로 기록됩니다."
              action={(
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadRateHistory("buy")}
                    disabled={!editable || buyRateHistoryLoading}
                    className={`rounded-full border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-700 transition ${
                      !editable || buyRateHistoryLoading ? "cursor-not-allowed opacity-50" : "hover:bg-sky-50"
                    }`}
                  >
                    {buyRateHistoryLoading ? "이력 조회 중..." : buyRateHistoryLoaded ? "이력 새로고침" : "이력 보기"}
                  </button>
                  <button
                    type="button"
                    onClick={saveBuyRates}
                    disabled={!editable || !buyRatesDirty || savingBuyRates}
                    className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                      !editable || !buyRatesDirty || savingBuyRates
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-sky-600 text-white hover:bg-sky-500"
                    }`}
                  >
                    {savingBuyRates ? "저장 중..." : buyRatesDirty ? "매수 환율 저장" : "저장 완료"}
                  </button>
                </div>
              )}
            >
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-5">
                {RATE_FIELD_META.map((item) => (
                  <div
                    key={`buy-${item.key}`}
                    className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                      </div>
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                        Buy
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={buyRatesForm[item.key]}
                      onChange={(event) => updateRateField(setBuyRatesForm, item.key, event.target.value)}
                      disabled={!editable}
                      className="mt-4 h-12 w-full rounded-[18px] border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                ))}
              </div>

              <HistoryPanel
                tone="sky"
                loaded={buyRateHistoryLoaded}
                loading={buyRateHistoryLoading}
                items={buyRateHistory}
                onLoad={() => void loadRateHistory("buy")}
                disabled={!editable}
              />
            </SettingsCard>

            <SettingsCard
              eyebrow="Market Sell Rates"
              title="환율(팔때)"
              description="USDT를 고객이 판매할 때 사용하는 기준 환율입니다. 저장 시 변경 이력이 자동으로 기록됩니다."
              action={(
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadRateHistory("sell")}
                    disabled={!editable || sellRateHistoryLoading}
                    className={`rounded-full border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition ${
                      !editable || sellRateHistoryLoading ? "cursor-not-allowed opacity-50" : "hover:bg-emerald-50"
                    }`}
                  >
                    {sellRateHistoryLoading ? "이력 조회 중..." : sellRateHistoryLoaded ? "이력 새로고침" : "이력 보기"}
                  </button>
                  <button
                    type="button"
                    onClick={saveSellRates}
                    disabled={!editable || !sellRatesDirty || savingSellRates}
                    className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${
                      !editable || !sellRatesDirty || savingSellRates
                        ? "cursor-not-allowed bg-slate-100 text-slate-400"
                        : "bg-emerald-600 text-white hover:bg-emerald-500"
                    }`}
                  >
                    {savingSellRates ? "저장 중..." : sellRatesDirty ? "매도 환율 저장" : "저장 완료"}
                  </button>
                </div>
              )}
            >
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-5">
                {RATE_FIELD_META.map((item) => (
                  <div
                    key={`sell-${item.key}`}
                    className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                        Sell
                      </span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={sellRatesForm[item.key]}
                      onChange={(event) => updateRateField(setSellRatesForm, item.key, event.target.value)}
                      disabled={!editable}
                      className="mt-4 h-12 w-full rounded-[18px] border border-slate-200 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                ))}
              </div>

              <HistoryPanel
                tone="emerald"
                loaded={sellRateHistoryLoaded}
                loading={sellRateHistoryLoading}
                items={sellRateHistory}
                onLoad={() => void loadRateHistory("sell")}
                disabled={!editable}
              />
            </SettingsCard>
          </div>

          <div className="space-y-6">
            <SettingsCard
              eyebrow="Brand Asset"
              title="센터 로고"
              description="관리자 서명 후 업로드 프록시를 통해 로고 이미지를 저장하고, 원격 본서버의 avatar 값을 갱신합니다."
            >
              <div className="space-y-4">
                <div className="flex items-center gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="h-20 w-20 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarUrl || "/logo.png"}
                      alt="Client logo"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">현재 로고</div>
                    <div className="mt-1 break-all text-xs leading-5 text-slate-500">
                      {avatarUrl || "저장된 로고가 없습니다."}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white px-4 py-4">
                  <div className="text-sm font-semibold text-slate-900">새 로고 업로드</div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    PNG, JPG, JPEG, WEBP, GIF 형식을 지원합니다.
                  </div>
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleLogoFileChange}
                    disabled={!editable || uploadingLogo}
                    className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 disabled:cursor-not-allowed"
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    {logoFile ? `선택된 파일: ${logoFile.name}` : "선택된 파일이 없습니다."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={uploadLogo}
                  disabled={!editable || !logoFile || uploadingLogo}
                  className={`w-full rounded-full px-5 py-3 text-sm font-semibold transition ${
                    !editable || !logoFile || uploadingLogo
                      ? "cursor-not-allowed bg-slate-100 text-slate-400"
                      : "bg-slate-950 text-white hover:bg-slate-800"
                  }`}
                >
                  {uploadingLogo ? "업로드 중..." : "로고 업로드"}
                </button>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="Payment Control"
              title="페이액션 사용 유무"
              description="원격 본서버의 payaction 표시 상태를 콘솔에서 직접 켜고 끌 수 있습니다."
            >
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900">현재 상태</div>
                  <div className="console-display text-[2rem] font-semibold tracking-[-0.06em] text-slate-950">
                    {payactionViewOn ? "활성화" : "비활성화"}
                  </div>
                  <div className="text-sm leading-6 text-slate-500">
                    {payactionViewOn
                      ? "결제 연동 기능이 운영 화면에 노출 중입니다."
                      : "결제 연동 기능이 비활성화되어 주문 화면에서 숨겨집니다."}
                  </div>
                </div>

                <div className="mt-5 flex rounded-full border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => void updatePayactionView(true)}
                    disabled={!editable || updatingPayaction}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      payactionViewOn ? "bg-emerald-500 text-white" : "text-slate-500"
                    } ${!editable || updatingPayaction ? "cursor-not-allowed opacity-50" : "hover:text-slate-900"}`}
                  >
                    사용
                  </button>
                  <button
                    type="button"
                    onClick={() => void updatePayactionView(false)}
                    disabled={!editable || updatingPayaction}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                      !payactionViewOn ? "bg-slate-950 text-white" : "text-slate-500"
                    } ${!editable || updatingPayaction ? "cursor-not-allowed opacity-50" : "hover:text-slate-900"}`}
                  >
                    중지
                  </button>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              eyebrow="System Context"
              title="환경 정보"
              description="콘솔 프로젝트가 원격 본서버에서 참조 중인 현재 클라이언트 메타데이터입니다."
            >
              <div className="space-y-4">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Client ID
                  </div>
                  <div className="mt-3 break-all text-sm font-semibold text-slate-900">
                    {clientId || "미설정"}
                  </div>
                </div>

                <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Remote backend
                  </div>
                  <div className="mt-3 text-sm font-semibold text-slate-900">
                    {chainLabel}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {CHAIN_META[chain]?.tone ? `현재 정산 체인: ${chainLabel}` : "체인 정보를 불러오지 못했습니다."}
                  </div>
                </div>

                <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                    운영 메모
                  </div>
                  <div className="mt-3 text-sm leading-6 text-amber-900">
                    프로필, 매수환율, 매도환율은 각각 별도 서명 API로 저장됩니다. 환율 저장 시에는
                    변경 전후 값과 변경 시각이 자동으로 기록됩니다.
                  </div>
                </div>
              </div>
            </SettingsCard>
          </div>
        </section>
      </div>
    </main>
  );
}
