import { PickupCodeDetail } from "@/components/web/PickupCodeDetail";
import { PageHeader } from "@/components/web/PageHeader";
import { getCurrentSession } from "@/lib/auth/server";

type PickupCodeDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function PickupCodeDetailPage({
  params,
}: PickupCodeDetailPageProps) {
  const [{ id }, session] = await Promise.all([params, getCurrentSession()]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Pickup Code Detail"
        description="Update expiration, inspect shared files, and revoke access."
        activePage="pickup-codes"
        username={session?.username}
      />
      <PickupCodeDetail id={id} />
    </main>
  );
}
