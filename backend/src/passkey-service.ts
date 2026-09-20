import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { ENV } from "./env.ts";
import { findProfileById, type Profile } from "./repo/profiles.ts";
import {
  MAX_PASSKEYS,
  createPasskey,
  findPasskey,
  listPasskeys,
  touchPasskey,
} from "./repo/passkeys.ts";

/**
 * The two WebAuthn ceremonies.
 *
 * Verification is delegated to @simplewebauthn rather than hand-rolled: it
 * means parsing CBOR, validating an attestation chain and checking an ECDSA
 * signature, and a subtle mistake in any of those is a silent authentication
 * bypass rather than a visible bug.
 *
 * The challenge is not stored here. The route puts it in a short-lived
 * httpOnly cookie and hands it back on verify, so a ceremony needs no server
 * state and cannot be completed with a challenge from someone else's attempt.
 */

/**
 * The relying party is the origin users actually visit. Getting this wrong is
 * not a soft failure: a credential registered under one rpID cannot be used
 * under another, so a change here invalidates every existing passkey.
 */
function relyingParty(): { id: string; origin: string; name: string } {
  const url = new URL(ENV.publicUrl);
  return { id: url.hostname, origin: url.origin, name: "tokn" };
}

export type PasskeyError = { error: string; status: number };

const fail = (status: number, error: string): PasskeyError => ({ status, error });

/* ---------------------------------------------------------- registration */

export async function passkeyRegisterOptions(
  userId: string,
): Promise<{ options: unknown; challenge: string } | PasskeyError> {
  const profile = await findProfileById(userId);
  if (!profile) return fail(404, "no such account");

  const existing = await listPasskeys(userId);
  if (existing.length >= MAX_PASSKEYS) {
    return fail(400, `you can have at most ${MAX_PASSKEYS} passkeys`);
  }

  const rp = relyingParty();

  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userID: new TextEncoder().encode(profile.$id),
    userName: profile.handle,
    userDisplayName: profile.name?.trim() || profile.handle,
    // No attestation: we do not care which authenticator this is, only that it
    // holds a key. Asking for it would collect identifying data for nothing.
    attestationType: "none",
    // Stops a device registering itself twice and producing a duplicate.
    excludeCredentials: existing.map((key) => ({
      id: key.credentialId,
      transports: parseTransports(key.transports),
    })),
    authenticatorSelection: {
      // Discoverable, so signing in needs no handle typed first.
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  return { options, challenge: options.challenge };
}

export async function passkeyRegisterVerify(
  userId: string,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
  label?: string,
): Promise<{ ok: true; label: string } | PasskeyError> {
  const rp = relyingParty();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
    });
  } catch (error) {
    return fail(400, (error as Error).message);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return fail(400, "that passkey could not be verified");
  }

  const { credential } = verification.registrationInfo;
  const name = (label ?? "").trim().slice(0, 64) || "passkey";

  await createPasskey({
    userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: response.response.transports,
    label: name,
  });

  return { ok: true, label: name };
}

/* -------------------------------------------------------- authentication */

export async function passkeyAuthOptions(): Promise<{ options: unknown; challenge: string }> {
  const rp = relyingParty();

  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    // Deliberately empty: the authenticator offers whichever of its resident
    // credentials matches this site, so nothing has to be typed and we do not
    // reveal which handles have passkeys.
    allowCredentials: [],
    userVerification: "preferred",
  });

  return { options, challenge: options.challenge };
}

export async function passkeyAuthVerify(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
): Promise<{ ok: true; profile: Profile } | PasskeyError> {
  const stored = await findPasskey(response.id);
  if (!stored) return fail(401, "that passkey is not registered here");

  const profile = await findProfileById(stored.userId);
  if (!profile) return fail(401, "that passkey is not registered here");

  const rp = relyingParty();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64")),
        counter: stored.counter,
        transports: parseTransports(stored.transports),
      },
    });
  } catch (error) {
    return fail(401, (error as Error).message);
  }

  if (!verification.verified) return fail(401, "that passkey could not be verified");

  await touchPasskey(stored.$id, verification.authenticationInfo.newCounter);

  return { ok: true, profile };
}

/** Transports are a UI hint from the browser; a malformed blob is not fatal. */
function parseTransports(raw: string | null | undefined) {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuthenticatorTransportFuture[]) : undefined;
  } catch {
    return undefined;
  }
}

type AuthenticatorTransportFuture = NonNullable<
  Parameters<typeof generateRegistrationOptions>[0]["excludeCredentials"]
>[number]["transports"] extends (infer T)[] | undefined
  ? T
  : never;
