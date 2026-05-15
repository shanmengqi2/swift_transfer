import { Suspense } from "react";
import { LoginForm } from "@/app/login/LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
