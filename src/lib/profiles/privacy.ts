export function canViewContactDetails(
  profileUid: string,
  viewerUid: string | null,
  sharesContactInfo: boolean,
): boolean {
  return viewerUid === profileUid || sharesContactInfo;
}
