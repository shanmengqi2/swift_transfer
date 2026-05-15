import { Uploader } from "@/components/web/Uploader";
import { PageHeader } from "@/components/web/PageHeader";
import { getCurrentSession } from "@/lib/auth/server";
import { getUploadLimits } from "@/lib/uploadLimits";

export default async function Home() {
  const session = await getCurrentSession();
  const uploadLimits = getUploadLimits();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-16 sm:px-6 lg:px-8">
      <PageHeader
        titleKey="pages.upload.title"
        descriptionKey="pages.upload.description"
        activePage="upload"
        username={session?.username}
      />
      <Uploader limits={uploadLimits} />
    </div>
  );
}
