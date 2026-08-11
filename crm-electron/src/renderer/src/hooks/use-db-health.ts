import { useEffect, useState } from "react";
import type { DbHealth } from "@common/contract";

export function useDbHealth(): DbHealth | null {
  const [health, setHealth] = useState<DbHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.app
      .dbHealth()
      .then((res) => {
        if (!cancelled && res.ok) setHealth(res.data);
      })
      .catch(() => {
        /* keep null → "DB offline" badge */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return health;
}
