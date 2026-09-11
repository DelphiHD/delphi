# The chart tool on her home page

The hero on www.delphihd.com holds a Wix **HTML Element** (accessible name
"Chart Widget"). Until 10 September 2026 it ran bodygraph.com's embed.

## What was there before, kept so it can always go back

```html
<script src="https://app.bodygraph.com/integrate-chart/js" defer></script><bodygraph-embed chart-id="28088" token="9f9a156c-3547-4470-bd1d-a4f9e225dc99"></bodygraph-embed>
```

That form asked for a name, a birth place, a birth date and time, and an email
address. The email went to bodygraph.com. Her own hook was filling somebody
else's list.

## What replaced it

```html
<iframe src="https://charts.delphihd.com/chart" width="100%" height="900" style="border:0" title="Delphi Human Design chart"></iframe>
```

Her own form, on her own domain, writing to her own database, sending from her
own address, and producing the branded chart rather than a generic one.

## Why the embed is allowed at all

Every page on charts.delphihd.com refuses to be put inside a frame, which is the
right default and the reason this did not work at first. `/chart` alone carries
an exception naming her domains and the Wix editor's, set in `vercel.json`. No
other page can be framed by anyone, including the login page and the portal.
