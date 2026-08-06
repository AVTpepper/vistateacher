import { AdminNavigation } from "@/features/admin/admin-navigation";
import { requirePlatformAdmin } from "@/lib/admin/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();
  return (
    <div className="px-4 py-5 lg:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-primary font-mono text-[10px] font-bold uppercase">
              Trusted operations
            </p>
            <h1 className="mt-2 font-serif text-3xl">Administration</h1>
          </div>
          <AdminNavigation />
        </div>
        {children}
      </div>
    </div>
  );
}
