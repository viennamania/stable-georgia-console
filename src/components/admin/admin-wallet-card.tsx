"use client";

import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

import { thirdwebClient } from "@/lib/thirdweb-client";

type AdminWalletCardProps = {
  address?: string | null;
  disconnectedMessage: string;
  errorMessage?: string | null;
  accessLabel?: string;
  title?: string;
};

const normalizeText = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
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

export default function AdminWalletCard({
  address,
  disconnectedMessage,
  errorMessage,
  accessLabel = "Signed access",
  title = "Admin wallet",
}: AdminWalletCardProps) {
  const normalizedAddress = normalizeText(address);

  return (
    <div className="console-dark-card relative overflow-hidden rounded-[30px] p-5 text-white backdrop-blur">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_58%)]" />
      <div className="space-y-2">
        <p className="console-mono text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          {accessLabel}
        </p>
        <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-white">
          {title}
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
            {normalizedAddress ? shortAddress(normalizedAddress) : disconnectedMessage}
          </span>
        </div>

        {errorMessage ? (
          <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
