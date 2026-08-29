/**
 * The invite acceptance page's one decision: whether accepting will
 * replace the session the visitor already holds.
 *
 * Preview and accept refusals live in failures.ts. The page fetches, asks
 * this, and hands the result on. Accepting always proceeds — a different
 * account is a warning, not a block.
 */

/**
 * What to tell a visitor already signed in as someone else, or nothing
 * when accepting will not switch the session.
 *
 * The invited email is the account the Membership will attach to. Accepting
 * signs them in as that account and replaces any session they hold, which
 * is what the accept call then does.
 */
export function sessionSwitchNotice(
  currentEmail: string | null,
  invitedEmail: string,
): string | null {
  if (currentEmail === null || currentEmail === invitedEmail) return null;
  return `This invite is for ${invitedEmail}. Accepting signs you in as that account, replacing your current session.`;
}
