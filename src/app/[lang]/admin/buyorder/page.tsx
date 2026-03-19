import BuyorderConsoleClient from "./buyorder-console-client";

export default function AdminBuyorderPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <BuyorderConsoleClient lang={params.lang} />;
}
