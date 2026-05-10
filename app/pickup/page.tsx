import type { Metadata } from "next";
import { PickupPortal } from "@/components/web/PickupPortal";

export const metadata: Metadata = {
  title: "Pickup Files | Swift Transfer",
};

type PickupPageProps = {
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function PickupPage({ searchParams }: PickupPageProps) {
  const codeParam = (await searchParams).code;
  const initialCode = (Array.isArray(codeParam) ? codeParam[0] : codeParam)
    ?.replace(/[^0-9A-Za-z]/g, "")
    .slice(0, 6);

  return <PickupPortal initialCode={initialCode} />;
}
