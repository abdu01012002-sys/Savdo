import { User, AuditLog } from '../types';
import { generateId } from './utils';

export const createAuditLog = (
  user: User,
  action: string,
  entity: string,
  details: string,
  severity: 'info' | 'warning' | 'high' = 'info'
): AuditLog => ({
  id: generateId(),
  date: new Date().toISOString(),
  user: user.ism,
  action,
  entity,
  details,
  severity
});
