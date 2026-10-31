import { query } from '../config/database.js';
import type { Page, Paging } from './http.js';

/** Collects WHERE conditions. Each `?` in a condition becomes the next positional parameter. */
export class Filter {
  params: unknown[] = [];
  private clauses: string[] = [];

  add(condition: string, ...values: unknown[]) {
    let i = 0;
    this.clauses.push(
      condition.replace(/\?/g, () => {
        this.params.push(values[i++]);
        return `$${this.params.length}`;
      }),
    );
    return this;
  }

  /** Adds the condition only when the value is present. */
  when(value: unknown, condition: string, ...values: unknown[]) {
    if (value !== undefined && value !== null && value !== '') this.add(condition, ...(values.length ? values : [value]));
    return this;
  }

  search(term: string | undefined, columns: string[]) {
    if (term) {
      const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      this.add(`(${columns.map((c) => `${c} ILIKE ?`).join(' OR ')})`, ...columns.map(() => like));
    }
    return this;
  }

  get where() {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

/** Sort columns come from a server-side whitelist; client input never reaches the SQL text. */
export function orderBy(paging: Paging, sortable: Record<string, string>, fallback: string) {
  const column = paging.sortBy ? sortable[paging.sortBy] : undefined;
  if (!column) return `ORDER BY ${fallback}`;
  return `ORDER BY ${column} ${paging.sortDir === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`;
}

export async function paginate<T>(opts: {
  select: string;
  from: string;
  filter: Filter;
  order: string;
  paging: Paging;
}): Promise<Page<T>> {
  const { select, from, filter, order, paging } = opts;
  const [{ total }] = await query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${from} ${filter.where}`, filter.params);
  const n = filter.params.length;
  const rows = await query<T>(
    `SELECT ${select} FROM ${from} ${filter.where} ${order} LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...filter.params, paging.pageSize, (paging.page - 1) * paging.pageSize],
  );
  return { rows, total, page: paging.page, pageSize: paging.pageSize };
}

export const buildUpdate = (fields: Record<string, unknown>, startAt = 1) => {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  return {
    sets: entries.map(([k], i) => `${k} = $${startAt + i}`).join(', '),
    values: entries.map(([, v]) => v),
    count: entries.length,
  };
};
