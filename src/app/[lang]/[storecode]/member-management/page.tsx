import MemberManagementConsoleClient from "@/app/[lang]/admin/member-management/member-management-console-client";

export default function StoreMemberManagementPage({
  params,
}: {
  params: {
    lang: string;
    storecode: string;
  };
}) {
  return (
    <MemberManagementConsoleClient
      lang={params.lang}
      forcedStorecode={params.storecode}
    />
  );
}
