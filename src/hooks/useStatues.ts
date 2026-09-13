import { useEffect, useState } from 'react';
import { sanitizeCollection } from '../lib/map';
import { loadApprovedStatues } from '../lib/contributions';
import type { StatueCollection } from '../types/statue';

interface StatueState {
  data: StatueCollection;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY_COLLECTION: StatueCollection = { type: 'FeatureCollection', features: [] };

export const useStatues = (): StatueState => {
  const [data, setData] = useState<StatueCollection>(EMPTY_COLLECTION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}statues.geojson`, {
          signal: controller.signal,
          cache: 'no-cache',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const local = sanitizeCollection(await response.json());
        const remote = await loadApprovedStatues().catch(() => []);
        const merged = new Map(local.features.map((feature) => [feature.properties.id, feature]));
        remote.forEach((feature) => merged.set(feature.properties.id, feature));
        setData({ type: 'FeatureCollection', features: [...merged.values()] });
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setData(EMPTY_COLLECTION);
        setError(reason instanceof Error ? reason.message : 'Unknown error');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  return { data, loading, error, reload: () => setAttempt((value) => value + 1) };
};
