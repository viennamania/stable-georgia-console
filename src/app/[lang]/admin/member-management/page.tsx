import AdminMemberManagementPageClient from "./page-client";

export default function AdminMemberManagementPage({
  params,
}: {
  params: {
    lang: string;
  };
}) {
  return <AdminMemberManagementPageClient lang={params.lang} />;
}
