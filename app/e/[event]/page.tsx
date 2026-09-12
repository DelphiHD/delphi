/**
 * A short, permanent address for an event.
 *
 * This is what a QR code points at. Once a code is printed on a card or sent to
 * an organiser it is out of our hands forever, so the address behind it has to
 * be settled before the code exists and must never need to change. What sits
 * behind it can grow all it likes: today it is the chart form carrying the
 * event's name, and it can become a full registration page without a single
 * code being reprinted.
 *
 * Anything unknown still lands on the plain form rather than an error. Somebody
 * at an event who mistypes a URL should get a chart, not a 404.
 */

import { redirect } from "next/navigation";

/** The events with a live code. Kept here so a stray /e/anything cannot invent one. */
const EVENTS: Record<string, string> = {
  bfki: "The Big Fucking Kick It",
};

export function generateStaticParams() {
  return Object.keys(EVENTS).map((event) => ({ event }));
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  const slug = (event ?? "").toLowerCase();
  if (!EVENTS[slug]) redirect("/chart");
  redirect(`/chart?e=${encodeURIComponent(slug)}`);
}
