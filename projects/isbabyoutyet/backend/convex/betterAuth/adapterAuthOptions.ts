import { passkey } from "@better-auth/passkey";
import { convex } from "@convex-dev/better-auth/plugins";
import { anonymous } from "better-auth/plugins/anonymous";
import { bearer } from "better-auth/plugins/bearer";
import { emailOTP } from "better-auth/plugins/email-otp";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { magicLink } from "better-auth/plugins/magic-link";
import { oidcProvider } from "better-auth/plugins/oidc-provider";
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";

/**
 * Static options for `createApi` / `getAuthTables`. Must not read Convex env:
 * the adapter calls this at module init with `{}`. Plugin set matches the
 * published component schema, plus passkey, so unique-field metadata stays
 * aligned with the tables in `schema.ts`.
 */
export const adapterAuthOptions = {
  plugins: [
    twoFactor(),
    anonymous(),
    username(),
    phoneNumber(),
    magicLink({
      sendMagicLink: async () => {
        return undefined;
      },
    }),
    emailOTP({
      sendVerificationOTP: async () => {
        return undefined;
      },
    }),
    genericOAuth({
      config: [
        {
          clientId: "",
          clientSecret: "",
          providerId: "",
        },
      ],
    }),
    // Published component schema still registers this plugin so unique fields stay aligned.
    // eslint-disable-next-line typescript/no-deprecated
    oidcProvider({
      __skipDeprecationWarning: true,
      loginPage: "/login",
    }),
    bearer(),
    oneTimeToken(),
    jwt(),
    convex({
      authConfig: { providers: [{ applicationID: "convex", domain: "" }] },
    }),
    passkey(),
  ],
  rateLimit: {
    storage: "database" as const,
  },
};
