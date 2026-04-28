import { FilesManager } from "@/components/web/FilesManager";
import { PageHeader } from "@/components/web/PageHeader";
import { getCurrentSession } from "@/lib/auth/server";

export default async function FilesPage() {
  const session = await getCurrentSession();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        title="Manage S3 Files"
        description="Browse objects, create presigned download links, and remove files from the configured bucket."
        activePage="files"
        username={session?.username}
      />
      <FilesManager />
    </main>
  );
}
