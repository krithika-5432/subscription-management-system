import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPage } from '../services/api';
import type { PageMeta, Row } from '../types';
import { useFetch } from './useFetch';

export interface ListState {
  rows: Row[];
  meta: PageMeta | null;
  raw: Row | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  param: (key: string) => string;
  setParam: (key: string, value: string) => void;
  setParams: (values: Record<string, string>) => void;
  searchText: string;
  setSearchText: (value: string) => void;
  sortBy: string;
  sortDir: string;
  toggleSort: (key: string) => void;
  setPage: (page: number) => void;
  queryParams: Row;
}

/**
 * Server-side list state. Filters, search, sorting and page live in the URL, so a list can be
 * linked to and survives reload. `prefix` keeps two lists on one page from sharing parameters.
 */
export function useList(endpoint: string, options: { fixed?: Row; pageSize?: number; prefix?: string; enabled?: boolean } = {}): ListState {
  const { fixed, pageSize = 20, prefix = '', enabled = true } = options;
  const [search, setSearch] = useSearchParams();
  const name = useCallback((key: string) => `${prefix}${key}`, [prefix]);
  const urlSearch = search.get(name('search')) ?? '';
  const [searchText, setSearchText] = useState(urlSearch);

  const setParams = useCallback(
    (values: Record<string, string>) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(values)) {
            if (value) next.set(name(key), value);
            else next.delete(name(key));
          }
          // Any filter change returns to page one, unless the page itself is what changed.
          if (!('page' in values)) next.delete(name('page'));
          return next;
        },
        { replace: true },
      );
    },
    [name, setSearch],
  );

  useEffect(() => {
    if (searchText === urlSearch) return;
    const timer = setTimeout(() => setParams({ search: searchText }), 300);
    return () => clearTimeout(timer);
  }, [searchText, urlSearch, setParams]);

  const queryParams = useMemo(() => {
    const params: Row = { pageSize, ...fixed };
    search.forEach((value, key) => {
      if (key.startsWith(prefix) && key !== 'tab') {
        const bare = key.slice(prefix.length);
        if (!prefix && /^(i_|p_|q_|s_|r_)/.test(bare)) return;
        params[bare] = value;
      }
    });
    return params;
  }, [search, prefix, pageSize, fixed]);

  const key = JSON.stringify(queryParams);
  const { data, loading, error, reload } = useFetch(
    () => (enabled ? getPage(endpoint, queryParams) : Promise.resolve({ rows: [], meta: null as unknown as PageMeta, raw: null as unknown as Row })),
    [endpoint, key, enabled],
  );

  const sortBy = search.get(name('sortBy')) ?? '';
  const sortDir = search.get(name('sortDir')) ?? 'asc';

  return {
    rows: data?.rows ?? [],
    meta: data?.meta ?? null,
    raw: data?.raw ?? null,
    loading,
    error,
    reload,
    param: (k) => search.get(name(k)) ?? '',
    setParam: (k, value) => setParams({ [k]: value }),
    setParams,
    searchText,
    setSearchText,
    sortBy,
    sortDir,
    toggleSort: (k) => setParams({ sortBy: k, sortDir: sortBy === k && sortDir === 'asc' ? 'desc' : 'asc' }),
    setPage: (page) => setParams({ page: String(page) }),
    queryParams,
  };
}
