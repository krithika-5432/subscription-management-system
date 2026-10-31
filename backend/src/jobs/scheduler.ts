import { runBillingCycle } from '../services/billing.service.js';

const INTERVAL_MS = 5 * 60 * 1000;

/** Runs on start and every five minutes. Overlaps are harmless: runBillingCycle takes a database-wide advisory lock. */
export function startScheduler() {
  const tick = () =>
    runBillingCycle()
      .then((result) => {
        if (!result.skipped && (result.generated || result.failed || result.processedExpiries || result.expiredQuotations || result.reminders)) {
          console.log('Billing cycle:', result);
        }
      })
      .catch((err) => console.error('Billing cycle failed:', err));
  void tick();
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
}
