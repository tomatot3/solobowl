import type pg from "pg";
import type {AccountId} from "../../domain/shared/types";
import {emptyProfile, normalizeSection, NOTICE_VERSION, removedProfileValues, safetyFields, type Grant, type ProfileSection, type Profile, type Purpose, type Section} from "../../domain/profile/sections";
import {ApiError} from "../http/envelope";
import {withTransaction} from "../db/pool";
import {approvedProfileOptions} from "../content/dictionary";

type ProfileRow = ProfileSection & {section: Section};
type Options = Parameters<typeof normalizeSection>[2];
type Revision = {baseRevision: number; deletionGeneration: number};

export function createProfileService(pool: pg.Pool, approvedOptions?: Options, transaction?: pg.PoolClient) {
  const transact = <T>(work: (client: pg.PoolClient) => Promise<T>) => transaction ? work(transaction) : withTransaction(pool,work);
  async function lock(client: pg.PoolClient, id: AccountId) {
    const result = await client.query('SELECT id FROM "user" WHERE id=$1 AND "emailVerified" FOR UPDATE', [id]);
    if (!result.rowCount) throw new ApiError("AUTH_REQUIRED");
  }

  async function readSection(client: pg.PoolClient, id: AccountId, section: Section) {
    return (await client.query<ProfileSection>(`SELECT state,payload AS values,consent_id AS "consentRef",
      revision,deletion_generation AS "deletionGeneration" FROM profile_section WHERE account_id=$1 AND section=$2`, [id,section])).rows[0];
  }

  function requireCurrent(current: ProfileSection | undefined, stamp: Revision) {
    if ((current?.revision ?? 0) !== stamp.baseRevision || (current?.deletionGeneration ?? 0) !== stamp.deletionGeneration) {
      throw new ApiError("REVISION_CONFLICT");
    }
  }

  async function write(client: pg.PoolClient, id: AccountId, section: Section, data: ProfileSection) {
    await client.query(`INSERT INTO profile_section(account_id,section,state,payload,consent_id,revision,deletion_generation)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(account_id,section) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload,
      consent_id=EXCLUDED.consent_id,revision=EXCLUDED.revision,deletion_generation=EXCLUDED.deletion_generation,updated_at=now()`,
      [id,section,data.state,data.values,data.consentRef,data.revision,data.deletionGeneration]);
    return data;
  }

  async function normalize(client:pg.PoolClient,section: Section, values: unknown) {
    const options=approvedOptions??await approvedProfileOptions(client);
    try { return normalizeSection(section, values, options); }
    catch { throw new ApiError("INVALID_INPUT"); }
  }

  return {
    read: (id: AccountId): Promise<Profile> => transact(async client => {
      await lock(client, id);
      const profile = emptyProfile();
      const sections = await client.query<ProfileRow>(`SELECT section,state,payload AS values,consent_id AS "consentRef",
        revision,deletion_generation AS "deletionGeneration" FROM profile_section WHERE account_id=$1`, [id]);
      for (const {section,...data} of sections.rows) profile.sections[section] = data;
      profile.consents = (await client.query<Grant>(`SELECT id,purpose,notice_version AS "noticeVersion",1 AS revision,deletion_generation AS "deletionGeneration"
        FROM profile_consent WHERE account_id=$1 AND revoked_at IS NULL AND purpose IN ('safety','preferences')`, [id])).rows;
      return profile;
    }),
    grant: (id: AccountId, purpose: Purpose) => transact(async client => {
      await lock(client, id);
      const current=await readSection(client,id,purpose);
      const generation=current?.deletionGeneration??0;
      const previous = (await client.query<Grant>(`SELECT id,purpose,notice_version AS "noticeVersion",1 AS revision,deletion_generation AS "deletionGeneration"
        FROM profile_consent WHERE account_id=$1 AND purpose=$2 AND revoked_at IS NULL`, [id,purpose])).rows[0];
      if (previous?.noticeVersion===NOTICE_VERSION&&previous.deletionGeneration===generation) return previous;
      if (previous) await client.query("UPDATE profile_consent SET revoked_at=now() WHERE id=$1",[previous.id]);
      return (await client.query<Grant>(`INSERT INTO profile_consent(account_id,purpose,notice_version,deletion_generation) VALUES($1,$2,$3,$4)
        RETURNING id,purpose,notice_version AS "noticeVersion",1 AS revision,deletion_generation AS "deletionGeneration"`, [id,purpose,NOTICE_VERSION,generation])).rows[0]!;
    }),
    revoke: (id: AccountId, consentId: string, baseRevision: number) => transact(async client => {
      await lock(client, id);
      const consent = (await client.query<{revoked_at: Date | null}>(
        "SELECT revoked_at FROM profile_consent WHERE account_id=$1 AND id=$2", [id,consentId])).rows[0];
      if (!consent) throw new ApiError("RESOURCE_NOT_FOUND");
      if (baseRevision !== 1 || consent.revoked_at) throw new ApiError("REVISION_CONFLICT");
      await client.query("UPDATE profile_consent SET revoked_at=now() WHERE account_id=$1 AND id=$2", [id,consentId]);
      return {revoked: true, revision: 2};
    }),
    save: (id: AccountId, section: Section, input: Revision & {values?: unknown; consentRef?: string}) => transact(async client => {
      await lock(client, id);
      const current = await readSection(client,id,section);
      requireCurrent(current,input);
      const next = await normalize(client,section,input.values);
      if (next.state === "unknown") throw new ApiError("INVALID_INPUT");
      const consentRef = section === "equipment" ? null : input.consentRef ?? null;
      if (section !== "equipment") {
        const consent = await client.query(`SELECT id FROM profile_consent
          WHERE id=$1 AND account_id=$2 AND purpose=$3 AND revoked_at IS NULL AND notice_version=$4 AND deletion_generation=$5`,
          [consentRef,id,section,NOTICE_VERSION,input.deletionGeneration]);
        if (!consent.rowCount) throw new ApiError("CONSENT_REQUIRED");
      }
      const removed=removedProfileValues(current?.values??{},next.values);
      return write(client,id,section,{...next,consentRef,revision:input.baseRevision+1,deletionGeneration:input.deletionGeneration+Number(removed)});
    }),
    remove: (id: AccountId, section: Section, item: string, input: Revision) => transact(async client => {
      await lock(client,id);
      const current = await readSection(client,id,section);
      requireCurrent(current,input);
      if (item !== "all" && (section !== "safety" || !safetyFields.some(field => field === item))) throw new ApiError("RESOURCE_NOT_FOUND");
      const values = item === "all" ? {} : {...current?.values};
      if (item !== "all") delete values[item];
      const hasValues = Object.keys(values).length > 0;
      const hasProvided = Object.values(values).some(value => typeof value === "object" && value !== null && "state" in value && value.state === "provided");
      const receipt = {revision:input.baseRevision+1,deletionGeneration:input.deletionGeneration+1};
      await write(client,id,section,{...receipt,values,state:!hasValues?"unknown":hasProvided?"provided":"explicit_none",consentRef:hasValues?current?.consentRef??null:null});
      if (!hasValues && section !== "equipment") await client.query(
        "UPDATE profile_consent SET revoked_at=now() WHERE account_id=$1 AND purpose=$2 AND revoked_at IS NULL", [id,section]);
      return receipt;
    }),
  };
}
