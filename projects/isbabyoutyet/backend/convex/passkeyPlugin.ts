import { getAuthenticatorName, passkey } from "@better-auth/passkey";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { isJsonObjectValue, parseOptionalString } from "@workspace/runtime/json";
import {
  PASSKEY_ANONYMOUS_DEVICE_NAME,
  PASSKEY_EMAIL_TAKEN_CODE,
  PASSKEY_LAST_METHOD_CODE,
  PASSKEY_SIGNUP_INVALID_CODE,
  credentialPassword,
  parsePasskeySignupContext,
  passkeyRemovalBlockReason,
  pendingPasskeyUserId,
} from "../src/passkey";

type SignupInput = {
  email: string;
  name: string;
};

function deviceLabel(aaguid: string | null) {
  return getAuthenticatorName(aaguid) ?? PASSKEY_ANONYMOUS_DEVICE_NAME;
}

function emailTakenError() {
  return APIError.from("BAD_REQUEST", {
    code: PASSKEY_EMAIL_TAKEN_CODE,
    message: PASSKEY_EMAIL_TAKEN_CODE,
  });
}

function invalidSignupError() {
  return APIError.from("BAD_REQUEST", {
    code: PASSKEY_SIGNUP_INVALID_CODE,
    message: PASSKEY_SIGNUP_INVALID_CODE,
  });
}

async function provisionOrThrow(
  provisionSignup: (input: SignupInput) => Promise<string>,
  signup: SignupInput,
) {
  try {
    return await provisionSignup(signup);
  } catch (error) {
    if (error instanceof Error && error.message.includes(PASSKEY_EMAIL_TAKEN_CODE)) {
      throw emailTakenError();
    }
    throw error;
  }
}

/**
 * Passkey sign-up creates the user only after the authenticator succeeds, then
 * opens a session in the same response. Adding a device while signed in keeps
 * the current user. `requireSession: false` is what lets the first prompt run
 * before an account exists.
 */
export function createPasskeyPlugin(deps: {
  prepareSignup: (input: SignupInput) => Promise<string | null>;
  provisionSignup: (input: SignupInput) => Promise<string>;
}) {
  return passkey({
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "preferred",
    },
    registration: {
      afterVerification: async (args) => {
        const name = deviceLabel(args.verification.registrationInfo?.aaguid ?? null);
        // The registration route already loaded the cookie into `context.session`.
        const existing = args.ctx.context.session;
        if (existing?.user.id) {
          return { name };
        }
        const signup = parsePasskeySignupContext(args.context ?? null);
        if (signup === null) {
          throw invalidSignupError();
        }
        const userId = await provisionOrThrow(deps.provisionSignup, signup);
        const user = await args.ctx.context.internalAdapter.findUserById(userId);
        if (!user) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "User not found" });
        }
        const created = await args.ctx.context.internalAdapter.createSession(userId);
        if (!created) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Unable to create session" });
        }
        await args.ctx.setSignedCookie(
          args.ctx.context.authCookies.sessionToken.name,
          created.token,
          args.ctx.context.secret,
          {
            ...args.ctx.context.authCookies.sessionToken.attributes,
            maxAge: args.ctx.context.sessionConfig.expiresIn,
          },
        );
        args.ctx.context.setNewSession({ session: created, user });
        return { name, userId };
      },
      requireSession: false,
      resolveUser: async (args) => {
        const signup = parsePasskeySignupContext(args.context ?? null);
        if (signup === null) {
          throw invalidSignupError();
        }
        let existingId: string | null = null;
        try {
          existingId = await deps.prepareSignup(signup);
        } catch (error) {
          if (error instanceof Error && error.message.includes(PASSKEY_EMAIL_TAKEN_CODE)) {
            throw emailTakenError();
          }
          throw error;
        }
        return {
          id: existingId ?? pendingPasskeyUserId(signup.email),
          name: signup.name,
        };
      },
    },
    rpName: "Is Baby Out Yet?",
  });
}

/**
 * Runs before passkey deletion. Endpoint session middleware has not run yet,
 * so the cookie is read directly. Blocks removing the last device when there
 * is no password.
 */
export function passkeyRemovalGuard() {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/passkey/delete-passkey") {
      return;
    }
    const session = await getSessionFromCtx(ctx);
    if (!session?.user.id) {
      return;
    }
    const userId = session.user.id;
    const passkeys = await ctx.context.adapter.findMany({
      model: "passkey",
      where: [{ field: "userId", value: userId }],
    });
    const accounts = await ctx.context.adapter.findMany({
      model: "account",
      where: [{ field: "userId", value: userId }],
    });
    const body = ctx.body;
    const passkeyId = isJsonObjectValue(body) && "id" in body ? parseOptionalString(body.id) : null;
    let matched = false;
    let remaining = 0;
    for (const row of passkeys) {
      if (!isJsonObjectValue(row)) {
        continue;
      }
      const id = "id" in row ? parseOptionalString(row.id) : null;
      const fallbackId = "_id" in row ? parseOptionalString(row._id) : null;
      const rowId = id ?? fallbackId;
      if (rowId === null) {
        continue;
      }
      if (rowId === passkeyId) {
        matched = true;
      } else {
        remaining += 1;
      }
    }
    if (!matched) {
      return;
    }
    let hasPassword = false;
    for (const row of accounts) {
      if (!isJsonObjectValue(row)) {
        continue;
      }
      if (credentialPassword(row) !== null) {
        hasPassword = true;
      }
    }
    if (passkeyRemovalBlockReason({ hasPassword, remainingAfterRemoval: remaining }) !== null) {
      throw APIError.from("BAD_REQUEST", {
        code: PASSKEY_LAST_METHOD_CODE,
        message: PASSKEY_LAST_METHOD_CODE,
      });
    }
  });
}
