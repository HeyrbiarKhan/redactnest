import { AccountShell } from "../account-shell";

/**
 * Account and the pages under it: the shell with Account current in the
 * header. Spec 0013, AC-7 and AC-24. Sign in and sign up draw their own shell,
 * with nothing current, so this frame is theirs alone.
 *
 * Only rendered with billing on: with billing off the group's layout shows
 * that accounts are not set up and renders no page under it.
 */
export default function AccountPagesLayout({ children }: LayoutProps<"/account">) {
  return <AccountShell current="account">{children}</AccountShell>;
}
