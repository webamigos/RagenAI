type Props = Readonly<{
  children: React.ReactNode;
}>;

/**
 * No menu column of its own: inside this section the sidebar lists the user's
 * settings pages in place of the main menu, as it does for the organization's
 * (#1399), so the content has the width the second column used to take.
 *
 * The menu lists only the user's own pages. The organization's screens —
 * including Knowledge analytics and PII policy, which used to sit here under
 * "Privacy" — are in the organization menu, behind that section's guard.
 */
export default function SettingsLayout({ children }: Props) {
  return <div className="min-h-full flex-1 overflow-auto p-6">{children}</div>;
}
