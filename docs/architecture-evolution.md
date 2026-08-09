# Architecture Evolution

**Status:** proposed

**Last reviewed:** 2026-08-08

## Context

Buzz Web is already a browser client for an existing Buzz Relay. The next architecture increment is
not a new collaboration backend. It is a production deployment and identity boundary that allows
the same client to operate safely from multiple devices.

## Target System

```text
Browser or installed PWA
  |-- HTTPS application assets and runtime config
  |-- WSS Relay events (NIP-42)
  |-- HTTPS Relay operations (NIP-98, media, Git, invites)
  `-- signer requests (local, NIP-07, or NIP-46)

Portable Web edge
  |-- immutable static bundle
  |-- same-origin WebSocket/HTTP routing when required
  |-- CSP, TLS, rate limits, health checks
  `-- optional access-gateway session

Existing Buzz services
  |-- Buzz Relay: membership, authorization, events, media, Git
  |-- remote agent hosts: agent processes and workspaces
  `-- optional remote signer: Nostr signing and NIP-44 operations
```

The first deployment may run on a Mac mini. Nothing in the application or image may depend on
macOS paths, launch agents, a home directory, or a particular edge provider.

## Endpoint Model

A browser deployment can require different URLs for different responsibilities. Treating one
`relayUrl` as every endpoint is unsafe once a WebSocket proxy or same-origin edge is introduced.

The target runtime model is:

| Setting | Purpose | Used in signatures |
| --- | --- | --- |
| `websocketUrl` | Browser transport, possibly same-origin or proxied | No |
| `canonicalRelayUrl` | Relay identity and NIP-42 authentication | Yes |
| `httpOrigin` | NIP-98, media, Git, invite operations | Yes |
| `signerUrl` | Optional NIP-46 connection metadata | Per NIP-46 |
| `agentControlUrl` | Optional allowlisted lifecycle service | Yes, NIP-98 |

Defaults may derive these values from `canonicalRelayUrl`, but the resolved configuration must be
explicit, validated, and visible in diagnostics without revealing credentials.

## Signer Contract

Feature code should depend on one asynchronous signer interface:

```ts
type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  close(): Promise<void>;
};
```

Implementations may include:

- local page-memory signer backed by an encrypted browser vault;
- NIP-07 browser extension signer;
- NIP-46 remote signer using a disposable client key and revocable session.

The interface does not imply that all signers have equal custody, recovery, availability, or
privacy properties. UI and audit events must preserve those distinctions.

## Federated Identity

OIDC, OAuth, passwords, and passkeys authenticate an account to a relying party. Buzz Relay actions
still require proof from a Nostr key. The architecture therefore separates:

1. **Account authentication:** who may open or administer a hosted Web session.
2. **Identity binding:** which Nostr public key is linked to that account.
3. **Nostr proof:** which signer authorizes a specific Relay action.

An OIDC assertion must never be converted directly into a Nostr signature. Enrollment requires a
one-time proof from the existing Nostr identity or an explicit administrator-controlled binding.
Revocation and rotation must be modeled rather than inferred from email ownership.

Upstream work in `block/buzz` is defining federated identity as an additional authorization check,
not a replacement for NIP-42 or NIP-98. This project should align with that contract instead of
inventing a provider-specific login protocol.

## Remote Signing

NIP-46 is the preferred protocol direction for multi-device signing because it supports
`get_public_key`, `sign_event`, NIP-44 operations, permission requests, and session logout without
placing the user's long-term key in every browser.

Production remote signing requires more than protocol messages:

- explicit client enrollment and human-readable device names;
- least-privilege permissions and bounded session lifetime;
- replay protection, rate limits, and audit events;
- online availability and deterministic failure behavior;
- revocation independent of browser cooperation;
- protected key storage and a tested recovery process;
- clear disclosure that the signer can observe plaintext submitted for encryption.

No production implementation should begin until the current upstream remote-signing direction has
been reviewed and the ownership boundary is documented in an issue.

## Deployment Profiles

### Private network

- Static application and same-origin proxy on one portable host.
- Reachable only through a private network or authenticated tunnel.
- Appropriate for early testing across personally controlled devices.
- Does not solve signer portability by itself.

### Public edge with private services

- Public HTTPS application behind an access gateway.
- Relay and signer reachable through scoped edge routes.
- Strong CSP, origin policy, request limits, and service-level authentication.
- Suitable after account-linking and revocation are implemented.

### Relay-served application

- Relay serves the versioned SPA and owns fallback routing.
- Simplifies same-origin WebSocket and HTTP access.
- Depends on upstream support for full SPA routing and operational separation.

## Data Classification

| Data | Browser | Web edge | Relay | Remote signer |
| --- | --- | --- | --- | --- |
| Public runtime configuration | yes | yes | no | no |
| Nostr public key | yes | optional | yes | yes |
| Long-term private key | local signer only | never | never | yes, if configured |
| Unsigned event content | yes | route only | after signing | yes, when signing |
| NIP-44 plaintext | yes | never | never | yes, for remote encryption/decryption |
| OAuth/OIDC assertion | optional | access gateway | only if upstream contract requires | no |
| Agent/provider credentials | never | never | never | never |

## Failure Semantics

- Transport connection is not authentication success.
- Relay acceptance is not proof that an agent woke or completed work.
- Signer timeout must not be retried as a new user intent without an idempotency decision.
- Ambiguous publish outcomes must remain visible and reconciled by event identity.
- A failed account or signer check fails closed without clearing another valid device session.
- A stale browser bundle must receive an explicit compatibility error when Relay contracts change.

## Upstream Dependency Register

Reviewed on 2026-08-08:

| Work | State | Project implication |
| --- | --- | --- |
| `block/buzz#2682` browser workspace request | open; no linked implementation | Validate the product need; avoid claiming official status |
| `block/buzz#3027` full SPA Relay serving | open; conflicting, review required | Track before maintaining a permanent SPA fallback patch |
| `block/buzz#4717` reusable client boundary | draft; mergeable, review required | Candidate source of typed protocol behavior |
| `block/buzz#5084` remote channel-agent discovery | open; checks green | Align mention behavior and regression tests |
| `block/buzz#2700` NIP-46 support | open | Coordinate before implementing a signer service |
| `block/buzz#1758` earlier NIP-46 implementation | closed, not merged | Maintainer announced broader replacement work |
| `block/buzz#1476` Relay federated identity | open; review required | Candidate OIDC/JWT authorization contract |
| `block/buzz#1485` federated identity specification | open; changes requested | Treat as evolving, not stable protocol |
| `block/buzz#4274` tablet workspace | open on Block branch; mobile checks green | Native iPad may improve independently of Web |
| `block/buzz#3606` adaptive iPad workspace | open; review required | Compare behavior, avoid duplicating native work |

Review this register before beginning identity, Relay routing, agent discovery, or tablet work and at
least monthly while those workstreams remain active.

## Architecture Decision Rules

1. Prefer a typed upstream protocol client over copying CLI or Desktop implementation details.
2. Prefer a configurable endpoint contract over a deployment-specific source patch.
3. Keep static hosting and signer custody as independently replaceable services.
4. Keep organization-specific identity providers and access policies outside the public repository.
5. Add a threat model before changing key custody, cross-origin routing, or remote control.
6. Record rejected alternatives and migration consequences in an issue or ADR before implementation.
