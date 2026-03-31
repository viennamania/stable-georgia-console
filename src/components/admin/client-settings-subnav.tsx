"use client";

import Link from "next/link";

type ClientSettingsSubnavProps = {
  lang: string;
  active: "settings" | "bankinfo";
};

const navItems = (lang: string) => [
  {
    id: "settings" as const,
    label: "센터 설정",
    href: `/${lang}/admin/client-settings`,
  },
  {
    id: "bankinfo" as const,
    label: "은행 계좌 관리",
    href: `/${lang}/admin/client-settings/bankinfo`,
  },
];

export default function ClientSettingsSubnav({
  lang,
  active,
}: ClientSettingsSubnavProps) {
  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-[24px] border border-slate-200 bg-white/90 px-3 py-3 shadow-[0_22px_44px_rgba(15,23,42,0.06)] backdrop-blur">
      {navItems(lang).map((item) => {
        const isActive = item.id === active;

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? "bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
