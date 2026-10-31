import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/api';

/** Loads data on mount and whenever deps change. A slower, older response can never overwrite a newer one. */
export function useFetch<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader.current();
      if (ticket === latest.current) setData(result);
    } catch (err) {
      if (ticket === latest.current) setError(errorMessage(err));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}
