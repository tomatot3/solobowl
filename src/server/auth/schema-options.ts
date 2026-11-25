import type {BetterAuthOptions} from "better-auth";
import {username} from "better-auth/plugins/username";

export const usernamePattern=/^[a-z0-9_]{3,24}$/;
export const usernameEmailDomain="@login.shiyoushu.invalid";

// Both login methods use the stable account UUID for application records.
export const identitySchemaOptions={
 advanced:{database:{generateId:"uuid"}},
 emailAndPassword:{enabled:true,requireEmailVerification:true},
 plugins:[username({minUsernameLength:3,maxUsernameLength:24,displayUsername:false,immutableUsername:true,
   usernameValidator:value=>usernamePattern.test(value)})],
} satisfies Pick<BetterAuthOptions,"advanced"|"emailAndPassword"|"plugins">;
