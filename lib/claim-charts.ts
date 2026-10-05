/**
 * Charts waiting for the person they belong to.
 *
 * A chart can carry the address of whoever should hold it long before that
 * person has an account: Kaycee's roster has had charts since August and none
 * of those people have signed in. The moment they do, their charts should be
 * there, and a family's should come with them.
 *
 * Kaycee, 2026-10-05: "Paul Hollingshead owns Jack's Annie's and Izzie's
 * charts. Erlene Goodin owns joe's parker's and russell's charts." Those eight
 * charts carry the two adults' addresses. Without this they would stay
 * ownerless forever and the portal would be empty for both of them.
 *
 * Only charts with NO owner are ever claimed. A chart that already belongs to
 * somebody is never moved by an address matching, because an address is a
 * label and ownership is not: Kaycee, 2026-10-05, "charts always stay with
 * their owners".
 */

import { createClient } from "@supabase/supabase-js";

export async function claimChartsFor(userId: string, email: string | null | undefined): Promise<number> {
  const address = (email ?? "").trim().toLowerCase();
  if (!userId || !address) return 0;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 0;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("charts")
    .update({ owner_id: userId })
    .is("owner_id", null)
    .ilike("for_email", address)
    .select("id");
  if (error) {
    console.warn(`could not claim charts for ${address}: ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}
