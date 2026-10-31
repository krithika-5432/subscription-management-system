import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Modal } from '../components/common/ui';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  /** Asks for a reason. The promise then resolves to the text entered. */
  reasonLabel?: string;
  reasonRequired?: boolean;
}

interface Feedback {
  success: (message: string) => void;
  error: (message: string) => void;
  /** Resolves false on cancel, true on confirm, or the reason text when one was requested. */
  confirm: (options: ConfirmOptions) => Promise<false | true | string>;
}

const FeedbackContext = createContext<Feedback | null>(null);

interface Toast {
  id: number;
  kind: 'success' | 'error';
  message: string;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<(value: false | true | string) => void>(() => undefined);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo<Feedback>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      confirm: (options) =>
        new Promise((resolve) => {
          resolver.current = resolve;
          setReason('');
          setDialog(options);
        }),
    }),
    [push],
  );

  const close = (result: false | true | string) => {
    setDialog(null);
    resolver.current(result);
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="no-print fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className="flex items-start gap-2.5 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg">
            {toast.kind === 'success' ? <CheckCircle2 size={18} className="mt-px shrink-0 text-ok" /> : <AlertCircle size={18} className="mt-px shrink-0 text-bad" />}
            <span className="flex-1 text-ink">{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="text-ink-3 hover:text-ink">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => close(false)}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button
                variant={dialog.danger ? 'danger' : 'primary'}
                disabled={!!dialog.reasonRequired && !reason.trim()}
                onClick={() => close(dialog.reasonLabel ? reason.trim() || true : true)}
              >
                {dialog.confirmLabel ?? 'Confirm'}
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-2">{dialog.message}</p>
          {dialog.reasonLabel && (
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-ink-2">{dialog.reasonLabel}</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
              />
            </label>
          )}
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
