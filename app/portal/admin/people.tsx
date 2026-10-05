"use client";

/**
 * Every account, and what it can see.
 *
 * Kaycee, 2026-10-05: "people will be making their own accounts from the
 * website so I likely wont be involved most of the time." So this is the page
 * that tells her who has arrived, and the only place either permission can be
 * granted without a database client.
 *
 * The two toggles are deliberately different shapes. Admin is a switch,
 * because it is all or nothing and there is no partial version of it. Client
 * is a link between her and one person, which is why its label says whose.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Person {
  id: string;
  email: string;
  charts: number;
  admin: boolean;
  client: boolean;
  since: string;
}

export function People({ people, meId }: { people: Person[]; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [find, setFind] = useState("");

  async function change(action: string, userId: string) {
    setBusy(userId + action); setNote("");
    try {
      const r = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, userId }),
      });
      const j = await r.json();
      if (!j.ok) setNote(j.error ?? "that did not work");
      else router.refresh();
    } finally { setBusy(""); }
  }

  const needle = find.trim().toLowerCase();
  const shown = needle
    ? people.filter((p) => p.email.toLowerCase().includes(needle))
    : people;

  return (
    <>
      <p className="sub">
        Everyone with an account. Admin sees and can change everything. A client
        of yours is somebody whose charts you can read; they never see each
        other.
      </p>
      <input className="find" placeholder="Find an account" value={find}
        onChange={(e) => setFind(e.target.value)} />
      {note && <p className="note">{note}</p>}
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Charts</th>
              <th>Admin</th>
              <th>Your client</th>
              <th className="hide-sm">Since</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={5}>Nobody matches that.</td></tr>}
            {shown.map((p) => (
              <tr key={p.id}>
                <td>{p.email}{p.id === meId && <span className="tier">you</span>}</td>
                <td>{p.charts || <span className="dim">—</span>}</td>
                <td>
                  <button
                    className={p.admin ? "perm on" : "perm"}
                    disabled={busy === p.id + (p.admin ? "admin.remove" : "admin.add")}
                    onClick={() => change(p.admin ? "admin.remove" : "admin.add", p.id)}
                  >
                    {p.admin ? "Admin" : "Make admin"}
                  </button>
                </td>
                <td>
                  <button
                    className={p.client ? "perm on" : "perm"}
                    disabled={p.id === meId || busy === p.id + (p.client ? "client.unlink" : "client.link")}
                    onClick={() => change(p.client ? "client.unlink" : "client.link", p.id)}
                  >
                    {p.client ? "Your client" : "Add as client"}
                  </button>
                </td>
                <td className="hide-sm">{p.since}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="count">{shown.length} of {people.length}</p>
    </>
  );
}
