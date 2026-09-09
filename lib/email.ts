/**
 * Sending mail, for the one thing that needs it: getting somebody their chart.
 *
 * A chart currently exists only as a link in whichever tab made it. Close the
 * tab and it is gone, which at an event means a stranger loses the thing they
 * just gave their birth details for.
 *
 * Resend, on a subdomain. Kaycee's mail is Google Workspace and her SPF record
 * already points at Google; a domain gets one SPF record, so putting a second
 * sender on the root domain risks her actual email. Records on send.delphihd.com
 * cannot affect hello@delphihd.com at all.
 *
 * Nothing here is allowed to be fatal. Mail is a convenience on top of a chart
 * that already exists at a link the person is looking at.
 */

const ENDPOINT = "https://api.resend.com/emails";

export interface SendResult {
  sent: boolean;
  reason?: string;
}

/** Configured only when there is a key and an address to send from. */
export function canSendEmail(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The chart, as an email. Plain and short: one line about what it is, the link
 * as a button, and the same link as text underneath because plenty of mail
 * clients and forwarding chains eat buttons.
 */
function chartEmailHtml(name: string, url: string): string {
  const who = esc(name.split(" ")[0] || name);
  return `<!doctype html>
<html><body style="margin:0;background:#f6f3f7;font-family:Montserrat,Helvetica,Arial,sans-serif;color:#1c1a2e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:18px;padding:32px 30px">
        <tr><td>
          <p style="margin:0 0 6px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#845095;font-weight:600">
            Delphi Human Design</p>
          <h1 style="margin:0 0 14px;font-size:23px;font-weight:400;color:#1c1a2e">Your chart, ${who}</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#423d55">
            Here it is. The link is yours and it stays live, so keep this email
            and you can always find your way back to it.
          </p>
          <a href="${url}"
             style="display:inline-block;background:#845095;color:#ffffff;text-decoration:none;
                    font-weight:600;font-size:15px;padding:14px 30px;border-radius:999px">
            Open My Chart</a>
          <p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#6f6880">
            Or paste this into any browser:<br>
            <a href="${url}" style="color:#845095;word-break:break-all">${esc(url)}</a>
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11.5px;color:#6f6880">Know thyself.</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Send somebody their chart. Returns whether it went, never throws: a chart
 * that exists must not be undone by a mail server having a bad afternoon.
 */
export async function sendChartEmail(args: {
  to: string;
  name: string;
  url: string;
}): Promise<SendResult> {
  if (!canSendEmail()) return { sent: false, reason: "email is not configured" };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [args.to],
        // Replies land in her actual inbox. send.delphihd.com only sends;
        // somebody answering their chart email must not vanish into it.
        reply_to: "hello@delphihd.com",
        subject: "Your Human Design chart",
        html: chartEmailHtml(args.name, args.url),
        text: `Your chart: ${args.url}\n\nThe link is yours and it stays live.`,
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: `${res.status} ${(await res.text()).slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
