import DailyCloseConsoleClient from "@/app/[lang]/admin/daily-close/daily-close-console-client";

export default function StoreDailyClosePage({
  params,
}: {
  params: {
    lang: string;
    storecode: string;
  };
}) {
  return (
    <DailyCloseConsoleClient
      lang={params.lang}
      forcedStorecode={params.storecode}
    />
  );
}
