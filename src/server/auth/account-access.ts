import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import {ApiError} from "../http/envelope";

export function hasAccountCredentials(session: {emailVerified: boolean; username?: string | null}) {
  return session.emailVerified || Boolean(session.username);
}

export async function lockAccount(client: pg.PoolClient, id: AccountId) {
  const result = await client.query(
    'SELECT id FROM "user" WHERE id=$1 AND ("emailVerified" OR username IS NOT NULL) FOR UPDATE', [id],
  );
  if (!result.rowCount) throw new ApiError("AUTH_REQUIRED");
}
