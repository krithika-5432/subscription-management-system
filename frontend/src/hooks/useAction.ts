import { useFeedback } from '../context/FeedbackContext';
import { errorMessage } from '../services/api';

/** Runs a user action, reporting the outcome as a toast. Resolves true only when the action succeeded. */
export function useAction() {
  const feedback = useFeedback();
  return async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) feedback.success(success);
      return true;
    } catch (err) {
      feedback.error(errorMessage(err));
      return false;
    }
  };
}
