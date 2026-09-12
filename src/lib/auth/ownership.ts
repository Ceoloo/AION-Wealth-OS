/**
 * Application-level ownership enforcement. This is the SECOND line of defense;
 * Supabase row-level security (see supabase/migrations) is the primary, DB-level
 * guarantee. Every private record carries an ownerId and both layers must agree.
 *
 * These pure guards are unit-tested to prove reads/writes/exports cannot cross
 * ownership boundaries even if a query is constructed incorrectly.
 */

export interface Owned {
  ownerId: string;
}

export class OwnershipError extends Error {
  constructor(message = "Cross-owner access denied") {
    super(message);
    this.name = "OwnershipError";
  }
}

/** Throws unless the record belongs to the requesting user. */
export function assertOwner<T extends Owned>(record: T, requesterId: string): T {
  if (!requesterId) throw new OwnershipError("No authenticated user");
  if (record.ownerId !== requesterId) throw new OwnershipError();
  return record;
}

/** Returns only the records owned by the requester (safe filter for reads/exports). */
export function ownedOnly<T extends Owned>(records: T[], requesterId: string): T[] {
  if (!requesterId) return [];
  return records.filter((r) => r.ownerId === requesterId);
}

/** Stamps ownerId on a new record, refusing to write on behalf of another user. */
export function stampOwner<T extends Owned>(record: T, requesterId: string): T {
  if (!requesterId) throw new OwnershipError("No authenticated user");
  if (record.ownerId && record.ownerId !== requesterId) {
    throw new OwnershipError("Cannot write a record owned by another user");
  }
  return { ...record, ownerId: requesterId };
}
