import P2PTradeHistoryConsoleClient from "./p2p-trade-history-console-client";

export default function AdminBuyorderTradeHistoryPage({
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
    <P2PTradeHistoryConsoleClient
      lang={params.lang}
      initialStorecode={typeof searchParams?.storecode === "string" ? searchParams.storecode : ""}
    />
  );
}
