import { PoolMapView } from "@/components/PoolMapView";
import { poolMaps } from "@/lib/pool";

export default async function LearningTankMapPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; error?: string; success?: string; bookingBlockId?: string; tab?: string }>;
}) {
  return <PoolMapView mapConfig={poolMaps.tanqueAprendizagem} searchParams={searchParams} />;
}
