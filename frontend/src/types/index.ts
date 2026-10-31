export type Role = 'admin' | 'staff' | 'customer';
export type Profile = 'sales' | 'operations' | 'finance';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  profile: Profile | null;
  permissions: string[];
  customerId: string | null;
  customer?: Row | null;
}

/** API rows are server-validated records rendered by column definitions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LineValue {
  itemType: 'plan' | 'product';
  planId?: string;
  productId?: string;
  variantId?: string;
  quantity: number | string;
  additionalPrice?: string;
}
