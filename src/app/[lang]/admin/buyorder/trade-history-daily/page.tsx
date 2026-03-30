import DailyTradeHistoryConsoleClient from "./daily-trade-history-console-client";

export default function AdminBuyorderTradeHistoryDailyPage({
  params,
  searchParams,
}: {
  params: {
    lang: string;
  };
  searchParams?: {
    storecode?: string;
  };
}) {
  return (
    <DailyTradeHistoryConsoleClient
      lang={params.lang}
      initialStorecode={typeof searchParams?.storecode === "string" ? searchParams.storecode : ""}
    />
  );
}
