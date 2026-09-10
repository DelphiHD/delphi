/**
 * The scaffolding's placeholder. It said "your portal is being built" and showed
 * an email address. The portal is now at /portal and lists the person's charts,
 * so anything still pointing here goes there rather than to a dead end.
 */
import { redirect } from "next/navigation";

export default function WelcomePage() {
  redirect("/portal");
}
