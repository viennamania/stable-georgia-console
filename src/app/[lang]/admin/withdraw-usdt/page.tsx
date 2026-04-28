import WithdrawUsdtConsoleClient from "./withdraw-usdt-console-client";

export default function AdminWithdrawUsdtPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <WithdrawUsdtConsoleClient lang={params.lang} />;
}
