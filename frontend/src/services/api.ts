import axios, { AxiosError } from 'axios';
import type { PageMeta, Row } from '../types';

const TOKEN_KEY = 'brightloop.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY),
  /** "Keep me logged in" survives closing the browser; otherwise the token lasts for this tab session. */
  set: (token: string, remember = localStorage.getItem(TOKEN_KEY) !== null) => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  },
};

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api' });

http.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(undefined, (error: AxiosError) => {
  // A rejected login is a form error. Any other 401 means the session has ended.
  if (error.response?.status === 401 && tokenStore.get() && !error.config?.url?.startsWith('/auth/login')) {
    tokenStore.clear();
    window.location.assign('/login');
  }
  return Promise.reject(error);
});

export interface ApiFieldError {
  path: string;
  message: string;
}

export function errorMessage(error: unknown): string {
  const data = (error as AxiosError<{ error?: { message?: string } }>)?.response?.data;
  if (data?.error?.message) return data.error.message;
  if ((error as AxiosError)?.code === 'ERR_NETWORK') return 'Cannot reach the server. Check that the API is running.';
  return 'Something went wrong. Please try again.';
}

export function fieldErrors(error: unknown): ApiFieldError[] {
  const details = (error as AxiosError<{ error?: { details?: unknown } }>)?.response?.data?.error?.details;
  return Array.isArray(details) ? (details as ApiFieldError[]) : [];
}

export const get = async <T = Row>(url: string, params?: Row): Promise<T> => (await http.get(url, { params })).data.data;
export const getPage = async <T = Row>(url: string, params?: Row): Promise<{ rows: T[]; meta: PageMeta; raw: Row }> => {
  const { data } = await http.get(url, { params });
  return { rows: Array.isArray(data.data) ? data.data : data.data.rows, meta: data.meta, raw: data.data };
};
export const post = async <T = Row>(url: string, body?: unknown): Promise<T> => (await http.post(url, body ?? {})).data.data;
export const put = async <T = Row>(url: string, body?: unknown): Promise<T> => (await http.put(url, body)).data.data;
export const patch = async <T = Row>(url: string, body?: unknown): Promise<T> => (await http.patch(url, body)).data.data;
export const del = async <T = Row>(url: string): Promise<T> => (await http.delete(url)).data.data;

export async function download(url: string, filename: string, params?: Row) {
  const { data } = await http.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}
