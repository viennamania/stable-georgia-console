"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { getContract, sendAndConfirmTransaction } from "thirdweb";
import { bsc } from "thirdweb/chains";
import { balanceOf, transfer } from "thirdweb/extensions/erc20";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { createAdminSignedBody } from "@/lib/client/create-admin-signed-body";
import { thirdwebClient } from "@/lib/thirdweb-client";

type ServerWalletUser = {
  _id?: string;
  nickname?: string;
  avatar?: string;
  walletAddress?: string;
  signerAddress?: string;
  storecode?: string;
  store?: {
    storeName?: string;
    storeLogo?: string;
  } | null;
};

type AlertState = {
  tone: "info" | "success" | "error";
  message: string;
};

const GET_USER_BY_WALLET_ADDRESS_ADMIN_SIGNING_PREFIX =
  "stable-georgia:get-user-by-wallet:admin:v1";

const chainName = "bsc";
const activeChain = bsc;
const contractAddress = "0x55d398326f99059fF775485246999027B3197955";
const usdtDecimals = 18;

const wallets = [
  inAppWallet({
    auth: {
      options: ["email", "google", "apple"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
];

const formatUsdt = (value: unknown) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0.000";
  }
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const normalizeWalletAddress = (value: unknown) => normalizeText(value).toLowerCase();

const isValidEvmAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

const shortAddress = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) {
    return "-";
  }
  if (text.length <= 14) {
    return text;
  }
  return `${text.slice(0, 8)}...${text.slice(-6)}`;
};

const isAdminStorecode = (value: unknown) => normalizeText(value).toLowerCase() === "admin";

const getRecipientName = (recipient: ServerWalletUser | null) => {
  if (!recipient) {
    return "";
  }
  return normalizeText(recipient.store?.storeName)
    || normalizeText(recipient.nickname)
    || "Server wallet";
};

export default function WithdrawUsdtConsoleClient({ lang }: { lang: string }) {
  const activeAccount = useActiveAccount();
  const address = activeAccount?.address || "";
  const [adminVerified, setAdminVerified] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [serverWalletUsers, setServerWalletUsers] = useState<ServerWalletUser[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [balance, setBalance] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const [recipient, setRecipient] = useState<ServerWalletUser | null>(null);
  const [recipientConfirmSuffix, setRecipientConfirmSuffix] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transactionHash, setTransactionHash] = useState("");
  const [alert, setAlert] = useState<AlertState | null>(null);

  const contract = useMemo(() => {
    return getContract({
      client: thirdwebClient,
      chain: activeChain,
      address: contractAddress,
    });
  }, []);

  const selectedRecipientName = getRecipientName(recipient);
  const amount = Number(amountInput);
  const recipientWalletAddress = normalizeText(recipient?.walletAddress);
  const recipientSuffix = recipientWalletAddress.slice(-6);
  const recipientSuffixMatched =
    recipientSuffix.length === 0
    || recipientConfirmSuffix.trim().toLowerCase() === recipientSuffix.toLowerCase();

  const createAdminVerificationBody = useCallback(async () => {
    const adminWalletAddress = normalizeWalletAddress(activeAccount?.address || address);

    return createAdminSignedBody({
      account: activeAccount,
      route: "/api/user/getUserByWalletAddress",
      signingPrefix: GET_USER_BY_WALLET_ADDRESS_ADMIN_SIGNING_PREFIX,
      requesterWalletAddress: adminWalletAddress,
      actionFields: {
        storecode: "admin",
        walletAddress: adminWalletAddress,
      },
    });
  }, [activeAccount, address]);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(0);
      return;
    }

    const result = await balanceOf({
      contract,
      address,
    });
    setBalance(Number(result) / 10 ** usdtDecimals);
  }, [address, contract]);

  useEffect(() => {
    if (!address) {
      setAdminVerified(false);
      setServerWalletUsers([]);
      setTotalCount(0);
      setBalance(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingContext(true);
      setAlert(null);

      try {
        const signedAdminUserBody = await createAdminVerificationBody();
        const response = await fetch("/api/bff/admin/withdraw-usdt/context", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            signedAdminUserBody,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setAdminVerified(false);
          setServerWalletUsers([]);
          setTotalCount(0);
          const remoteMessage = String(payload?.error || "");
          setAlert({
            tone: "error",
            message: remoteMessage === "Invalid signature"
              ? "관리자 서명 검증에 실패했습니다. BSC 네트워크에서 관리자 지갑을 다시 연결한 뒤 시도해주세요."
              : (remoteMessage || "관리자 권한 확인에 실패했습니다."),
          });
          return;
        }

        const result = payload?.result || {};
        const nextAdminVerified = Boolean(result.isAdmin);
        setAdminVerified(nextAdminVerified);

        if (!nextAdminVerified) {
          setServerWalletUsers([]);
          setTotalCount(0);
          setAlert({
            tone: "error",
            message: "본사 관리자 지갑만 USDT 출금 기능을 사용할 수 있습니다.",
          });
        }
      } catch (error: any) {
        if (cancelled || error?.name === "AbortError") {
          return;
        }

        setAdminVerified(false);
        setServerWalletUsers([]);
        setTotalCount(0);
        setAlert({
          tone: "error",
          message: error instanceof Error ? error.message : "출금 컨텍스트를 불러오지 못했습니다.",
        });
      } finally {
        if (!cancelled) {
          setLoadingContext(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [address, createAdminVerificationBody]);

  useEffect(() => {
    if (!address || !adminVerified) {
      setServerWalletUsers([]);
      setTotalCount(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingContext(true);

      try {
        const response = await fetch("/api/bff/admin/withdraw-usdt/recipients", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            keyword,
            limit: 20,
            page: 1,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setServerWalletUsers([]);
          setTotalCount(0);
          setAlert({
            tone: "error",
            message: String(payload?.error || "server wallet 목록을 불러오지 못했습니다."),
          });
          return;
        }

        const result = payload?.result || {};
        const nextUsers = Array.isArray(result.users)
          ? result.users
            .filter((item: ServerWalletUser) => (
              normalizeText(item.walletAddress).toLowerCase() !== address.toLowerCase()
            ))
            .sort((left: ServerWalletUser, right: ServerWalletUser) => {
              const leftAdmin = isAdminStorecode(left.storecode);
              const rightAdmin = isAdminStorecode(right.storecode);
              if (leftAdmin !== rightAdmin) {
                return leftAdmin ? -1 : 1;
              }
              return getRecipientName(left).localeCompare(getRecipientName(right), "ko");
            })
          : [];
        setServerWalletUsers(nextUsers);
        setTotalCount(Number(result.totalCount || 0));
      } catch (error: any) {
        if (cancelled || error?.name === "AbortError") {
          return;
        }
        setServerWalletUsers([]);
        setTotalCount(0);
        setAlert({
          tone: "error",
          message: error instanceof Error ? error.message : "server wallet 목록을 불러오지 못했습니다.",
        });
      } finally {
        if (!cancelled) {
          setLoadingContext(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [address, adminVerified, keyword]);

  useEffect(() => {
    let cancelled = false;

    if (!address) {
      return;
    }

    refreshBalance().catch((error) => {
      if (!cancelled) {
        setAlert({
          tone: "error",
          message: error instanceof Error ? error.message : "USDT 잔고를 불러오지 못했습니다.",
        });
      }
    });

    const interval = setInterval(() => {
      refreshBalance().catch(() => undefined);
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, refreshBalance]);

  useEffect(() => {
    setRecipientConfirmSuffix("");
    setConfirmOpen(false);
    setTransactionHash("");
  }, [recipientWalletAddress, amountInput]);

  const validationError = useMemo(() => {
    if (!address) {
      return "관리자 지갑을 연결해주세요.";
    }
    if (!adminVerified) {
      return "관리자 권한 확인이 필요합니다.";
    }
    if (!recipientWalletAddress) {
      return "받는 server wallet을 선택해주세요.";
    }
    if (!isValidEvmAddress(recipientWalletAddress)) {
      return "선택된 받는 지갑주소가 올바르지 않습니다.";
    }
    if (recipientWalletAddress.toLowerCase() === address.toLowerCase()) {
      return "내 지갑으로는 출금할 수 없습니다.";
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return "출금 금액을 입력해주세요.";
    }
    if (amount > balance) {
      return "출금 가능 잔고보다 큰 금액입니다.";
    }
    if (!recipientSuffixMatched) {
      return "수신 지갑주소 끝 6자리를 확인해주세요.";
    }
    return "";
  }, [address, adminVerified, amount, balance, recipientSuffixMatched, recipientWalletAddress]);

  const canSend = !validationError && !sending;

  const openConfirm = () => {
    if (validationError) {
      setAlert({
        tone: "error",
        message: validationError,
      });
      return;
    }
    setAlert(null);
    setConfirmOpen(true);
  };

  const sendUsdt = async () => {
    if (validationError || sending || !activeAccount) {
      setAlert({
        tone: "error",
        message: validationError || "전송을 시작할 수 없습니다.",
      });
      return;
    }

    setSending(true);
    setTransactionHash("");
    setAlert({
      tone: "info",
      message: "지갑 서명과 네트워크 처리를 기다리는 중입니다.",
    });

    try {
      const transaction = transfer({
        contract,
        to: recipientWalletAddress,
        amount,
      });

      const result = await sendAndConfirmTransaction({
        transaction,
        account: activeAccount,
      });

      const nextTransactionHash = result.transactionHash || "";
      setTransactionHash(nextTransactionHash);

      try {
        const signedAdminUserBody = await createAdminVerificationBody();
        const logResponse = await fetch("/api/bff/admin/withdraw-usdt/transfer-log", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signedAdminUserBody,
            lang,
            chain: chainName,
            walletAddress: address,
            toWalletAddress: recipientWalletAddress,
            amount,
          }),
        });
        if (!logResponse.ok) {
          throw new Error("transfer log failed");
        }
      } catch {
        setAlert({
          tone: "success",
          message: "USDT 전송은 완료됐지만 전송 로그 저장은 확인이 필요합니다.",
        });
        await refreshBalance().catch(() => undefined);
        setAmountInput("");
        setRecipientConfirmSuffix("");
        setConfirmOpen(false);
        return;
      }

      await refreshBalance().catch(() => undefined);
      setAmountInput("");
      setRecipientConfirmSuffix("");
      setConfirmOpen(false);
      setAlert({
        tone: "success",
        message: "USDT 전송이 완료되었습니다.",
      });
    } catch (error) {
      setAlert({
        tone: "error",
        message: error instanceof Error ? error.message : "USDT 전송에 실패했습니다.",
      });
    } finally {
      setSending(false);
    }
  };

  const alertClassName = alert?.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : alert?.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <main className="console-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1380px] flex-col gap-5">
        <section className="console-hero rounded-[34px] px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="console-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sky-100/75">
                Admin transfer
              </p>
              <h1 className="console-display mt-3 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                USDT 출금
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                본사 관리자 지갑에서 선택한 server wallet으로 USDT를 전송합니다. OTP 단계는 제외되어 있으며, 전송 전 수신 지갑 끝자리를 확인합니다.
              </p>
            </div>

            <div className="console-dark-card rounded-[28px] p-4">
              <div className="flex flex-wrap items-center gap-3">
                <ConnectButton
                  client={thirdwebClient}
                  wallets={wallets}
                  theme="dark"
                  chain={activeChain}
                  connectButton={{
                    label: "관리자 지갑 연결",
                  }}
                />
                <div className="text-sm text-slate-300">
                  {address ? shortAddress(address) : "지갑 연결 필요"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {alert ? (
          <div className={`rounded-[24px] border px-5 py-4 text-sm font-semibold ${alertClassName}`}>
            {alert.message}
            {transactionHash ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                <span className="console-mono truncate">{transactionHash}</span>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(transactionHash)}
                  className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-slate-700"
                >
                  해시 복사
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
          <section className="console-panel rounded-[30px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  Wallet
                </p>
                <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  출금 지갑
                </h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                {chainName}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                <div className="text-xs font-semibold text-slate-500">관리자 지갑</div>
                <div className="console-mono mt-2 text-lg font-semibold text-slate-950">
                  {shortAddress(address)}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {adminVerified ? "권한 확인 완료" : loadingContext ? "권한 확인 중" : "권한 미확인"}
                </div>
              </div>

              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 text-right">
                <div className="text-xs font-semibold text-emerald-700">출금 가능 잔고</div>
                <div className="console-mono mt-2 text-3xl font-semibold tracking-[-0.04em] text-emerald-700">
                  {formatUsdt(balance)}
                </div>
                <div className="mt-1 text-xs font-semibold text-emerald-700">USDT</div>
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-500">출금 금액</label>
              <div className="mt-2 flex items-center rounded-[24px] border border-slate-200 bg-white px-4">
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  disabled={sending || !adminVerified}
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 outline-none disabled:text-slate-400"
                  placeholder="0.000"
                />
                <span className="text-sm font-semibold text-slate-500">USDT</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[0.25, 0.5, 0.75, 1].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    disabled={sending || !adminVerified || balance <= 0}
                    onClick={() => setAmountInput(String(Number((balance * ratio).toFixed(3))))}
                    className="rounded-2xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {Math.round(ratio * 100)}%
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label className="text-xs font-semibold text-slate-500">수신 지갑 끝 6자리 확인</label>
              <input
                type="text"
                disabled={sending || !recipientWalletAddress}
                value={recipientConfirmSuffix}
                onChange={(event) => setRecipientConfirmSuffix(event.target.value)}
                placeholder={recipientSuffix || "수신 지갑 선택 후 입력"}
                className="mt-2 w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-sky-300 disabled:text-slate-400"
              />
            </div>

            <button
              type="button"
              disabled={!canSend}
              onClick={openConfirm}
              className={`mt-5 w-full rounded-[24px] py-4 text-sm font-semibold transition ${
                canSend
                  ? "bg-slate-950 text-white hover:bg-slate-800"
                  : "cursor-not-allowed bg-slate-200 text-slate-400"
              }`}
            >
              {sending ? "전송중..." : "USDT 전송"}
            </button>
          </section>

          <section className="console-panel rounded-[30px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="console-mono text-[11px] uppercase tracking-[0.16em] text-slate-500">
                  Recipients
                </p>
                <h2 className="console-display mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  Server wallet 선택
                </h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                {totalCount.toLocaleString("ko-KR")} wallets
              </span>
            </div>

            <input
              type="text"
              disabled={!address || sending}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="가맹점명 / 닉네임 / 지갑주소 검색"
              className="mt-5 w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-sky-300 disabled:text-slate-400"
            />

            {recipient ? (
              <div className={`mt-4 rounded-[24px] border p-4 ${
                isAdminStorecode(recipient.storecode)
                  ? "border-amber-200 bg-amber-50"
                  : "border-emerald-200 bg-emerald-50"
              }`}>
                <div className="text-xs font-semibold text-slate-500">선택된 수신 지갑</div>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-slate-950">
                      {selectedRecipientName}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">
                      {isAdminStorecode(recipient.storecode) ? "본사 관리 지갑" : normalizeText(recipient.storecode)}
                      {recipient.nickname ? ` · ${recipient.nickname}` : ""}
                    </div>
                    <div className="console-mono mt-1 truncate text-xs text-slate-600">
                      {recipient.walletAddress}
                    </div>
                  </div>
                  {isAdminStorecode(recipient.storecode) ? (
                    <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                      ADMIN
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {loadingContext ? (
                <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 text-sm text-slate-500">
                  server wallet 목록을 불러오는 중입니다.
                </div>
              ) : serverWalletUsers.length > 0 ? (
                serverWalletUsers.map((item) => {
                  const itemWalletAddress = normalizeText(item.walletAddress);
                  const selected = itemWalletAddress.toLowerCase() === recipientWalletAddress.toLowerCase();
                  const adminRecipient = isAdminStorecode(item.storecode);

                  return (
                    <button
                      key={item._id || itemWalletAddress}
                      type="button"
                      disabled={sending}
                      onClick={() => setRecipient(item)}
                      className={`w-full rounded-[24px] border p-4 text-left transition ${
                        selected
                          ? adminRecipient
                            ? "border-amber-300 bg-amber-50"
                            : "border-emerald-300 bg-emerald-50"
                          : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-semibold text-slate-950">
                              {getRecipientName(item)}
                            </div>
                            {adminRecipient ? (
                              <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                                ADMIN
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {adminRecipient ? "본사 관리 지갑" : normalizeText(item.storecode)}
                            {item.nickname ? ` · ${item.nickname}` : ""}
                          </div>
                          <div className="console-mono mt-1 truncate text-xs text-slate-500">
                            {itemWalletAddress}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
                          selected ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"
                        }`}>
                          {selected ? "선택됨" : "선택"}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-500">
                  표시할 server wallet이 없습니다.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-lg rounded-[30px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="console-display text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  USDT 전송 확인
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  OTP 없이 바로 지갑 서명이 진행됩니다. 수신 지갑과 금액을 다시 확인하세요.
                </p>
              </div>
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-45"
              >
                닫기
              </button>
            </div>

            <div className="mt-5 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">받는 사람</span>
                <span className="text-right text-sm font-semibold text-slate-950">{selectedRecipientName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">수신 지갑</span>
                <span className="console-mono min-w-0 truncate text-right text-xs font-semibold text-slate-950">
                  {recipientWalletAddress}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-500">금액</span>
                <span className="console-mono text-xl font-semibold text-slate-950">
                  {formatUsdt(amount)} USDT
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={sending}
                onClick={() => setConfirmOpen(false)}
                className="rounded-[22px] border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45"
              >
                취소
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={sendUsdt}
                className="rounded-[22px] bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sending ? "전송중..." : "전송하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
