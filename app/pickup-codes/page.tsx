import { PickupCodesManager } from "@/components/web/PickupCodesManager";
import { PageHeader } from "@/components/web/PageHeader";
import { getCurrentSession } from "@/lib/auth/server";

export default async function PickupCodesPage() {
  const session = await getCurrentSession();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        titleKey="pages.pickupCodes.title"
        descriptionKey="pages.pickupCodes.description"
        activePage="pickup-codes"
        username={session?.username}
      />
      <PickupCodesManager />
    </main>
  );
}
