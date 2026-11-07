import { useEffect, useState } from "react";
import type { BarangayFeature } from "@/lib/barangay";
import { loadBarangayFeatures } from "@/lib/fiestas";

// The barangay boundaries, or null until they load. If the file can't be
// loaded it stays null and barangay cells show a dash instead of failing the page.
export function useBarangayFeatures(): BarangayFeature[] | null {
  const [features, setFeatures] = useState<BarangayFeature[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBarangayFeatures()
      .then((loaded) => {
        if (!cancelled) setFeatures(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
