import type {BetterAuthOptions} from "better-auth";
// Shared by migrations and the future authentication service. Never use email as the immutable ID.
export const identitySchemaOptions={
 advanced:{database:{generateId:"uuid"}},
 emailAndPassword:{enabled:true,requireEmailVerification:true},
} satisfies Pick<BetterAuthOptions,"advanced"|"emailAndPassword">;
