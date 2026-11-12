import { licenseService } from '../services/licenseService';

/** Fired when an action needs the school licence; App opens the licence dialog */
export const LICENSE_REQUIRED_EVENT = 'lhhp:license-required';

/**
 * Guard for actions that are locked in trial mode (exports, certificates…).
 * Returns true when the school licence is active; otherwise asks App to open the licence dialog and returns false.
 */
export function requireLicense(feature: string): boolean {
  if (licenseService.isActivated()) return true;
  try { window.dispatchEvent(new CustomEvent(LICENSE_REQUIRED_EVENT, { detail: { feature } })); } catch (_) { /* ignore */ }
  return false;
}
