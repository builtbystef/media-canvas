export function sessionSwitchNotice(
  currentEmail: string | null,
  invitedEmail: string,
): string | null {
  if (currentEmail === null || currentEmail === invitedEmail) return null;
  return `This invite is for ${invitedEmail}. Accepting signs you in as that account, replacing your current session.`;
}
