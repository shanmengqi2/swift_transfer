import { PickupCodesManager } from "@/components/web/PickupCodesManager";
import { PageHeader } from "@/components/web/PageHeader";
import { getCurrentSession } from "@/lib/auth/server";

export default async function PickupCodesPage() {
  const session = await getCurrentSession();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Manage Pickup Codes"
        description="Review active sharing codes, scan their file contents, and copy pickup links."
        activePage="pickup-codes"
        username={session?.username}
      />
      <PickupCodesManager />
    </main>
  );
}
