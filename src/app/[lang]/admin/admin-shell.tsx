"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/admin/buyorder",
    label: "Buyorder",
    description: "실시간 주문 스트림",
  },
  {
    href: "/admin/clearance-management",
    label: "Clearance",
    description: "청산 주문 상황판",
  },
];

export default function AdminShell({
  lang,
  children,
}: {
  lang: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#edf3f8] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1880px] gap-0">
        <aside className="hidden w-[272px] shrink-0 border-r border-slate-200 bg-slate-950 px-5 py-6 text-white lg:flex lg:flex-col">
          <div className="rounded-[28px] border border-white/10 bg-white/5 px-4 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
              Stable Georgia
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">
              Console
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-300">
              운영 페이지를 한 곳에서 보고, 각 화면은 BFF와 Ably로 실시간 상태를 동기화합니다.
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {NAV_ITEMS.map((item) => {
              const href = `/${lang}${item.href}`;
              const active = pathname === href;

              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`block rounded-[24px] border px-4 py-4 transition ${
                    active
                      ? "border-sky-300/40 bg-sky-400/15 text-white shadow-[0_12px_30px_-18px_rgba(56,189,248,0.9)]"
                      : "border-white/8 bg-white/5 text-slate-200 hover:border-white/14 hover:bg-white/8"
                  }`}
                >
                  <div className="text-sm font-semibold tracking-[-0.03em]">{item.label}</div>
                  <div className="mt-1 text-xs text-slate-400">{item.description}</div>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
