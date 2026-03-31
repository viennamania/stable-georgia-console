import BankInfoConsoleClient from "./bankinfo-console-client";

export default function AdminClientSettingsBankInfoPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <BankInfoConsoleClient lang={params.lang} />;
}
