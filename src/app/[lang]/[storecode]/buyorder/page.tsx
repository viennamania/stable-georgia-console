import BuyorderConsoleClient from "@/app/[lang]/admin/buyorder/buyorder-console-client";

export default function StoreBuyorderPage({
  params,
}: {
  params: {
    lang: string;
    storecode: string;
  };
}) {
  return (
    <BuyorderConsoleClient
      lang={params.lang}
      forcedStorecode={params.storecode}
      hideStoreFilter
    />
  );
}
