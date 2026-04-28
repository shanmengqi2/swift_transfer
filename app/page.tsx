import { Uploader } from "@/components/web/Uploader";
import { PageHeader } from "@/components/web/PageHeader";
import { getCurrentSession } from "@/lib/auth/server";

export default async function Home() {
  const session = await getCurrentSession();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Upload your Files with S3"
        description="Drop files into object storage, then jump to the manager to create download links or remove files."
        activePage="upload"
        username={session?.username}
      />
      <Uploader />
    </div>
  );
}
