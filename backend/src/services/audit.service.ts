import { insertAudit, insertNotification, insertNotificationForPermission } from '../repositories/system.repository.js';
import type { AuthUser } from '../types/index.js';

export const audit = (actor: AuthUser | null | undefined, action: string, entityType: string, entityId: string | null, details?: unknown) =>
  insertAudit(actor?.id ?? null, action, entityType, entityId, details);

export const notifyUser = insertNotification;
export const notifyPermission = insertNotificationForPermission;
