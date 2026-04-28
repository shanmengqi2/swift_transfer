import { Suspense } from "react";
import { LoginForm } from "@/app/login/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-normal">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use an authorized account to upload and manage files.
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
