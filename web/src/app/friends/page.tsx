import { permanentRedirect } from "next/navigation";

/** Friends moved under the account section; the old path still resolves. */
export default function FriendsMoved() {
  permanentRedirect("/account/friends");
}
