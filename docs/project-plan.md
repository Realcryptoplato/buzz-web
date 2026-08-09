# Project Plan

**Status:** proposed

**Last reviewed:** 2026-08-08

## Outcome

Deliver a production-hosted, multi-device Buzz Web client that can be evaluated privately, improved
in the open, and contributed upstream in focused pieces. The work must not duplicate Relay or agent
runtimes and must not create a new private-key distribution problem.

The [Product Requirements](product-requirements.md) define user outcomes. The
[Architecture Evolution](architecture-evolution.md) defines system and trust boundaries.

## Workstreams

| Workstream | Outcome | Upstream owner to watch |
| --- | --- | --- |
| Product and UX | Phone, tablet, and desktop workflows with explicit acceptance tests | `block/buzz#4274`, `#3606` |
| Client protocol | Typed, reconnect-safe Relay and media behavior | `block/buzz#4717`, `#5084` |
| Hosting | Portable production image and same-origin routing | `block/buzz#3027` |
| Identity | Local, NIP-07, then reviewed NIP-46 signer modes | `block/buzz#2700` |
| Federated access | Optional OIDC/access-gateway policy without replacing Nostr proof | `block/buzz#1476`, `#1485` |
| Quality | Real-Relay, responsive, accessibility, security, and rollback evidence | upstream CI and release practices |

## Phase 0: Project Foundation

**Exit criteria**

- Public fork with explicit upstream remote and Apache-2.0 notices preserved.
- PRD, architecture, maintenance policy, contribution templates, and implementation epic.
- No deployment-specific hostname, account identifier, internal path, or secret in the public tree.
- Current baseline checks documented and reproducible.

## Phase 1: Production Private Preview

**Scope**

- Convert the local transport/media fixes into generic runtime endpoint configuration.
- Replace the development WebSocket proxy with a reviewed production edge configuration.
- Build and publish an immutable production image.
- Deploy privately on a portable always-on host behind HTTPS.
- Add desktop, tablet, and phone smoke coverage against a synthetic test identity.

**Exit criteria**

- No Vite development server or ad hoc development proxy is exposed.
- WebSocket, NIP-42, NIP-98, media upload/download, reconnect, and routes pass real-Relay acceptance.
- Health check, logs, upgrade, rollback, and incident-disable procedures are exercised.
- Existing local/NIP-07 signer behavior is unchanged.

## Phase 2: Responsive Workspace

**Scope**

- Define phone, tablet, and desktop layout contracts from available content width.
- Add tablet master/detail navigation and overlay behavior for threads and secondary panels.
- Remove hover-only actions and validate touch, keyboard, and assistive-technology paths.
- Add screenshot and interaction coverage for portrait, landscape, and split-view widths.

**Exit criteria**

- Channel switching, thread reading, posting, mentions, approvals, and attachments remain usable at
  all supported widths.
- Draft, focus, scroll position, and unread state survive layout transitions.
- English and Simplified Chinese layouts pass visual and interaction checks.

## Phase 3: Multi-Device Signer

**Entry gate**

- Re-review `block/buzz#2700` and any replacement for closed PR `#1758`.
- Publish a threat model and protocol compatibility decision.
- Decide whether this repository owns only a client adapter or also an independently deployed
  signer service.

**Scope**

- Add the NIP-46 signer adapter behind the common signer contract.
- Implement enrollment, named devices, scoped permissions, expiry, audit, and revocation.
- Cover NIP-44 and ambiguous signing/publish outcomes.
- Keep remote signing optional and preserve NIP-07/local-vault fallback.

**Exit criteria**

- A second approved device uses the existing public identity without receiving the raw private key.
- Revoking one device prevents further signatures without disrupting another approved device.
- Signer unavailability and timeout never produce duplicate user actions silently.
- Independent security review is complete.

## Phase 4: Optional Federated Access

**Entry gate**

- Re-review upstream federated identity implementation and specification.
- Confirm the identity provider and Relay can bind one issuer-qualified subject to one active Nostr
  identity without weakening NIP-42/NIP-98.

**Scope**

- Add provider-neutral OIDC discovery and account-linking UI where the deployment advertises it.
- Prefer passkeys for returning account authentication where supported.
- Add administrator recovery and explicit key-binding transition flows.
- Keep provider credentials and organization policy in the private deployment repository.

**Exit criteria**

- OAuth/OIDC failure cannot authorize a Nostr key or leak whether another account exists.
- Account recovery cannot silently rotate or replace the bound Nostr identity.
- Session and binding revocation are independently testable and auditable.

## Phase 5: Upstream Contribution and Release

- Split changes by ownership: client fixes to this repository's upstream, Relay/client-library
  changes to `block/buzz`, and operator policy to the private deployment repository.
- Open an issue before each substantial protocol or custody change.
- Provide minimal reproductions, focused tests, security impact, screenshots when visual, and DCO
  sign-off.
- Remove downstream patches promptly after an accepted upstream equivalent is released and verified.

## Issue Structure

Use one implementation epic with linked issues for:

- runtime endpoint contract;
- production same-origin edge;
- private-preview deployment;
- tablet interaction specification;
- responsive implementation and visual tests;
- signer threat model;
- NIP-46 adapter and conformance tests;
- device enrollment and revocation;
- optional federated identity evaluation;
- upstream contribution register.

Each issue must state the user outcome, ownership boundary, protocol impact, security impact,
acceptance tests, upstream dependencies, and excluded work.

## Buzz Channel and Team Handoff

A dedicated Buzz channel can coordinate implementation after this specification is accepted. The
channel should contain no private keys, provider credentials, raw authentication headers, or private
deployment logs.

Suggested team roles:

| Role | Responsibility |
| --- | --- |
| Product lead | Scope, acceptance criteria, issue ordering, user validation |
| Web lead | React client, responsive interaction, accessibility, browser tests |
| Protocol lead | NIP-42/46/98, media, delivery semantics, upstream compatibility |
| Security reviewer | Threat models, custody, OIDC binding, logging and revocation |
| Operations lead | Images, edge routing, health, rollout, rollback, monitoring |
| Upstream liaison | Dependency register, issue/PR coordination, patch retirement |

Suggested channel kickoff:

```text
Outcome: ship a production-hosted, multi-device Buzz Web client without duplicating Relay or agent
runtimes and without distributing the long-term private key to each browser.

Sources of truth:
- GitHub implementation epic and linked issues
- docs/product-requirements.md
- docs/architecture-evolution.md
- docs/project-plan.md
- docs/maintenance.md

Working rules:
- one owner and one GitHub issue per active work item;
- post evidence, commit/PR links, test results, blockers, and next action;
- no secrets or private deployment data in Buzz or GitHub;
- check the upstream dependency register before protocol work;
- do not start or copy agent runtimes as part of browser-client testing.
```

The GitHub issue remains authoritative for status and acceptance. Buzz is the coordination and
handoff surface, not a second backlog.
