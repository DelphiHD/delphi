"use client";

/**
 * The dashboard's tables, online, with the sorting her own dashboard has.
 *
 * Kaycee, 2026-09-28: "I can't sort my client list and all of the pages are
 * missing... I WANT THE DASHBOARD THAT WE ARE CURRENTLY WORKING FROM TO EXIST
 * ONLINE. EVERY FUCKING PART OF IT."
 */

import { useMemo, useState } from "react";

export interface Column {
  key: string;
  label: string;
  /** a link, drawn as one, with this label */
  link?: string;
  /** hide on a phone */
  small?: boolean;
  /** sort as a number rather than as words */
  numeric?: boolean;
}

export type Row = Record<string, string | number | null>;

export function SortableTable({ columns, rows, initial, empty }: {
  columns: Column[];
  rows: Row[];
  initial?: { key: string; dir: 1 | -1 };
  empty?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>(
    initial ?? { key: columns[0].key, dir: 1 },
  );
  const [find, setFind] = useState("");

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const kept = needle
      ? rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(needle)))
      : rows;
    const col = columns.find((c) => c.key === sort.key);
    return [...kept].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x === null || x === undefined || x === "") return 1;
      if (y === null || y === undefined || y === "") return -1;
      if (col?.numeric) return (Number(x) - Number(y)) * sort.dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * sort.dir;
    });
  }, [rows, sort, find, columns]);

  return (
    <>
      <input
        className="find"
        placeholder="Find anyone"
        value={find}
        onChange={(e) => setFind(e.target.value)}
      />
      <div className="tbl">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={(c.small ? "hide-sm " : "") + (sort.key === c.key ? "on" : "")}
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                >
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={columns.length}>{empty ?? "Nothing here."}</td></tr>
            )}
            {shown.map((r, i) => (
              <tr key={String(r.id ?? i)}>
                {columns.map((c) => {
                  const v = r[c.key];
                  const href = c.link ? String(r[c.link] ?? "") : "";
                  return (
                    <td key={c.key} className={c.small ? "hide-sm" : ""}>
                      {href
                        ? <a href={href} target="_blank" rel="noreferrer">{String(v ?? "open")}</a>
                        : (v === null || v === undefined || v === "" ? <span className="dim">—</span> : String(v))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="count">{shown.length} of {rows.length}</p>
    </>
  );
}

export function Tabs({ names, children }: { names: string[]; children: React.ReactNode[] }) {
  const [on, setOn] = useState(0);
  return (
    <>
      <div className="tabs">
        {names.map((n, i) => (
          <button key={n} className={i === on ? "tab on" : "tab"} onClick={() => setOn(i)}>{n}</button>
        ))}
      </div>
      {children[on]}
    </>
  );
}
