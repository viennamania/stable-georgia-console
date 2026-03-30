import BuyorderConsoleClient from "./buyorder-console-client";

export default function AdminBuyorderPage({
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
    <BuyorderConsoleClient
      lang={params.lang}
      forcedStorecode={typeof searchParams?.storecode === "string" ? searchParams.storecode : ""}
    />
  );
}
