import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ListState } from '../../hooks/useList';
import type { PageMeta, Row } from '../../types';
import { Button, EmptyState, ErrorState, Spinner } from '../common/ui';

export interface Column {
  key: string;
  header: string;
  render?: (row: Row) => ReactNode;
  sort?: string;
  align?: 'right';
  /** Less important columns drop away on narrow screens. */
  optional?: boolean;
}

interface TableProps {
  columns: Column[];
  rows: Row[];
  rowLink?: (row: Row) => string;
  sortBy?: string;
  sortDir?: string;
  onSort?: (key: string) => void;
  empty?: ReactNode;
}

export function Table({ columns, rows, rowLink, sortBy, sortDir, onSort, empty }: TableProps) {
  const navigate = useNavigate();
  if (!rows.length) return <>{empty ?? <EmptyState />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sortBy === c.sort && c.sort ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined}
                className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap text-ink-2 ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.optional ? 'hidden lg:table-cell' : ''}`}
              >
                {c.sort && onSort ? (
                  <button onClick={() => onSort(c.sort!)} className="inline-flex items-center gap-1 font-semibold hover:text-ink">
                    {c.header}
                    {sortBy === c.sort && (sortDir === 'desc' ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={
                rowLink
                  ? (e) => {
                      if (!(e.target as HTMLElement).closest('a,button,input,select,label')) navigate(rowLink(row));
                    }
                  : undefined
              }
              className={`border-b border-line last:border-0 ${rowLink ? 'cursor-pointer hover:bg-surface-2' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 text-ink ${c.align === 'right' ? 'tnum text-right whitespace-nowrap' : ''} ${c.optional ? 'hidden lg:table-cell' : ''}`}>
                  {c.render ? c.render(row) : (row[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  if (!meta.total) return null;
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-ink-2">
      <span className="tnum">
        {first.toLocaleString('en-IN')}-{last.toLocaleString('en-IN')} of {meta.total.toLocaleString('en-IN')}
      </span>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" small icon={ChevronLeft} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <span className="tnum px-1">
          Page {meta.page} of {Math.max(meta.totalPages, 1)}
        </span>
        <Button variant="secondary" small disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next
          <ChevronRight size={14} />
        </Button>
      </div>
    </nav>
  );
}

export function ListCard({ list, columns, rowLink, filters, empty, placeholder = 'Search', hideSearch }: { list: ListState; columns: Column[]; rowLink?: (row: Row) => string; filters?: ReactNode; empty?: ReactNode; placeholder?: string; hideSearch?: boolean }) {
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface">
      {(!hideSearch || filters) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          {!hideSearch && (
            <label className="relative min-w-48 flex-1 sm:max-w-xs">
              <span className="sr-only">{placeholder}</span>
              <Search size={15} className="absolute top-2.5 left-2.5 text-ink-3" aria-hidden />
              <input
                type="search"
                value={list.searchText}
                onChange={(e) => list.setSearchText(e.target.value)}
                placeholder={placeholder}
                className="h-9 w-full rounded-md border border-line-strong bg-surface pr-3 pl-8 text-sm text-ink placeholder:text-ink-3"
              />
            </label>
          )}
          {filters}
        </div>
      )}
      {list.error ? (
        <ErrorState message={list.error} onRetry={() => void list.reload()} />
      ) : list.loading && !list.rows.length ? (
        <Spinner />
      ) : (
        <div className={list.loading ? 'opacity-60 transition-opacity' : ''} aria-busy={list.loading}>
          <Table columns={columns} rows={list.rows} rowLink={rowLink} sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.toggleSort} empty={empty} />
        </div>
      )}
      {list.meta && <Pagination meta={list.meta} onPage={list.setPage} />}
    </section>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink">
        <option value="">{label}: All</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterDate({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border border-line-strong bg-surface px-2 text-sm font-normal text-ink" />
    </label>
  );
}
