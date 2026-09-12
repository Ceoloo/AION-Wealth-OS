/** Current date as an ISO date string (YYYY-MM-DD), UTC. */
export function todayISO(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Current instant as an ISO datetime string. */
export function nowISO(d: Date = new Date()): string {
  return d.toISOString();
}
