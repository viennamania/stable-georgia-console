"use client";

import { BANKTRANSFER_ABLY_EVENT_NAME } from "@/lib/realtime/banktransfer";

import {
  NUMBER_FORMATTER,
  formatKrwValue,
  formatRealtimeDateTime,
  formatRealtimeRelative,
  getStoreConfiguredBankInfoByAccountNumber,
  getStoreDisplayName,
  getStoreLogoSrc,
  getWithdrawalRealtimePrimaryDateTime,
  getWithdrawalRealtimeStatusMeta,
  normalizeAccountNumber,
  normalizeText,
  type StoreItem,
  type WithdrawalRealtimeItem,
} from "./clearance-management-shared";

type ClearanceWithdrawalLiveSectionProps = {
  storeCoverageLabel: string;
  latestWithdrawalRealtimeAt: string | null;
  withdrawalRealtimeNowMs: number;
  refreshing: boolean;
  connectionState: string;
  connectionIndicatorClassName: string;
  withdrawalRealtimeEventCount: number;
  withdrawalRealtimeAmountTotal: number;
  connectionError: string;
  withdrawalSyncError: string;
  filteredWithdrawalRealtimeItems: WithdrawalRealtimeItem[];
  stores: StoreItem[];
};

export default function ClearanceWithdrawalLiveSection({
  storeCoverageLabel,
  latestWithdrawalRealtimeAt,
  withdrawalRealtimeNowMs,
  refreshing,
  connectionState,
  connectionIndicatorClassName,
  withdrawalRealtimeEventCount,
  withdrawalRealtimeAmountTotal,
  connectionError,
  withdrawalSyncError,
  filteredWithdrawalRealtimeItems,
  stores,
}: ClearanceWithdrawalLiveSectionProps) {
  return (
    <section className="console-panel overflow-hidden rounded-[30px]">
      <div className="border-b border-slate-200/80 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                Live
              </div>
              <h2 className="console-display text-3xl font-semibold tracking-[-0.05em] text-slate-950">
                webhook 통장출금 LIVE
              </h2>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                Ably
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {BANKTRANSFER_ABLY_EVENT_NAME}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                범위 {storeCoverageLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                최근 {latestWithdrawalRealtimeAt ? formatRealtimeRelative(latestWithdrawalRealtimeAt, withdrawalRealtimeNowMs) : "-"}
              </span>
              {refreshing ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  silent refresh
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Connection
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${connectionIndicatorClassName}`} />
                {connectionState}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Events
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                {NUMBER_FORMATTER.format(withdrawalRealtimeEventCount)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Withdrawn
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-rose-600">
                {formatKrwValue(withdrawalRealtimeAmountTotal)} KRW
              </div>
            </div>
          </div>
        </div>

        {connectionError || withdrawalSyncError ? (
          <div className="mt-4 space-y-2">
            {connectionError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                연결 오류: {connectionError}
              </div>
            ) : null}
            {withdrawalSyncError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                동기화 오류: {withdrawalSyncError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="px-6 py-5">
        {withdrawalRealtimeEventCount === 0 ? (
          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            아직 표시할 통장출금 webhook 이벤트가 없습니다.
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="inline-flex min-w-max items-start gap-3">
              {filteredWithdrawalRealtimeItems.map((item) => {
                const event = item.data;
                const isHighlighted = item.highlightUntil > withdrawalRealtimeNowMs;
                const publishedAt = getWithdrawalRealtimePrimaryDateTime(event, item.receivedAt);
                const matchedStore =
                  stores.find((store) => {
                    return String(store.storecode || "").trim() === String(event.storecode || "").trim();
                  }) || null;
                const configuredFromBankInfo = getStoreConfiguredBankInfoByAccountNumber(
                  matchedStore,
                  event.bankAccountNumber,
                );
                const isConfiguredAccountMatched = Boolean(configuredFromBankInfo);
                const normalizedWebhookName = normalizeText(event.transactionName);
                const normalizedConfiguredHolder = normalizeText(configuredFromBankInfo?.accountHolder);
                const isConfiguredHolderMatched =
                  Boolean(normalizedWebhookName)
                  && Boolean(normalizedConfiguredHolder)
                  && normalizedWebhookName === normalizedConfiguredHolder;
                const receiverAccountHolder =
                  normalizeText(event.receiver?.accountHolder) || normalizeText(event.receiver?.nickname) || "-";
                const receiverBankName = normalizeText(event.receiver?.bankName) || "-";
                const receiverAccountNumber =
                  normalizeAccountNumber(event.receiver?.accountNumber) || "-";
                const eventStoreName =
                  normalizeText(event.store?.name)
                  || getStoreDisplayName(matchedStore)
                  || normalizeText(event.storecode)
                  || "미매칭";
                const eventStoreLogo = normalizeText(event.store?.logo) || getStoreLogoSrc(matchedStore);
                const eventStatusMeta = getWithdrawalRealtimeStatusMeta(event);

                return (
                  <article
                    key={item.id}
                    className={`flex h-fit w-[322px] min-w-[322px] shrink-0 self-start flex-col rounded-[26px] border px-4 py-3.5 transition-all ${
                      isHighlighted
                        ? "border-sky-300 bg-sky-50 shadow-[0_14px_30px_-20px_rgba(14,165,233,0.75)]"
                        : "border-slate-200 bg-white shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-rose-700">
                            출금
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${eventStatusMeta.className}`}>
                            {eventStatusMeta.label}
                          </span>
                          {isHighlighted ? (
                            <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                              NEW
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-rose-600">
                          {formatKrwValue(event.amount)} KRW
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {formatRealtimeDateTime(publishedAt)}
                        </div>
                      </div>

                      <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <img
                          src={eventStoreLogo}
                          alt={eventStoreName}
                          className="h-9 w-9 rounded-full border border-slate-200 bg-white object-cover"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-slate-900">
                            {eventStoreName}
                          </div>
                          <div className="truncate text-[10px] text-slate-500">
                            {event.storecode || "-"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 items-start gap-2">
                      <div className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                            송금인
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isConfiguredAccountMatched
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-amber-200 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {isConfiguredAccountMatched ? "계좌 일치" : "계좌 미일치"}
                          </span>
                          {isConfiguredAccountMatched && isConfiguredHolderMatched ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              예금주 일치
                            </span>
                          ) : null}
                        </div>

                        {isConfiguredAccountMatched ? (
                          <div className="mt-1.5 min-w-0 space-y-0.5">
                            <div className="truncate text-xs font-semibold text-slate-900">
                              {normalizeText(configuredFromBankInfo?.bankName) || "-"}
                            </div>
                            <div className="truncate text-[11px] text-slate-600">
                              {(normalizeText(configuredFromBankInfo?.accountHolder) || "-")
                                + " · "
                                + (normalizeAccountNumber(
                                  configuredFromBankInfo?.realAccountNumber || configuredFromBankInfo?.accountNumber,
                                ) || "-")}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-0 self-start rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">수취인</div>
                        <div className="mt-1 truncate text-xs font-semibold text-slate-900">{receiverBankName}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-600">
                          {receiverAccountHolder} · {receiverAccountNumber}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                        TID {event.tradeId || "-"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                        매칭 {event.match || "-"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                        {formatRealtimeRelative(publishedAt, withdrawalRealtimeNowMs)}
                      </span>
                    </div>

                    {normalizeText(event.errorMessage) ? (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                        {event.errorMessage}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
