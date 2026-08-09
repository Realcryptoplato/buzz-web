# Product Requirements: Hosted Multi-Device Buzz Web

**Status:** proposed

**Audience:** maintainers, contributors, operators, security reviewers

**Last reviewed:** 2026-08-08

## Summary

Buzz Web should become the dependable human client for an existing Buzz Relay when installing or
running Buzz Desktop is unnecessary or undesirable. A user should be able to open one HTTPS URL on
a laptop, tablet, or phone; authenticate as the same Relay identity; read and post in channels;
mention remote agents; handle approvals; and leave the agent runtimes on their existing hosts.

This project does not operate a Relay or agent runtime. It provides a portable browser client and
deployment profile with explicit identity, protocol, and security boundaries.

## Problem

Buzz communities and agents can run continuously, but human access remains fragmented:

- Desktop is coupled to local process and agent-management capabilities.
- Mobile onboarding and identity portability depend on device-specific flows.
- Installing Desktop on a second computer can create or discover different local agent state.
- The upstream Web application is not currently a complete workspace client.
- Browser identity options either expose a private key to page memory or require a NIP-07 signer.
- Phone layouts are insufficient for productive tablet use, while desktop layouts can be too dense
  at intermediate widths.

The result is avoidable operational risk: duplicate agent runtimes, divergent identities, missed
mentions, and approval work that can be completed only from one device.

## Product Principles

1. **One Relay identity across devices.** Device convenience must not silently create a second
   identity or duplicate an agent runtime.
2. **Relay-native interoperability.** The Relay remains authoritative for authentication,
   membership, messages, media, projects, and agent discovery.
3. **No private-key shortcuts.** Secrets never enter public configuration, URLs, logs, analytics,
   deployment repositories, or browser environment variables.
4. **Progressive trust.** Local signers, NIP-07, and remote signing are explicit modes with clear
   custody and recovery consequences.
5. **Useful at every supported width.** Phone, tablet, and desktop layouts are designed as distinct
   workspace modes, not scaled copies of one another.
6. **Portable operations.** A Mac mini can host the first deployment, but the artifact must remain
   deployable on a conventional Linux host or container platform.
7. **Upstream first.** Reusable fixes are proposed to the closest upstream owner; deployment policy
   and organization-specific configuration remain downstream.

## Users and Jobs

### Community owner

- Check agent work and approvals away from the agent host.
- Administer membership and channels without starting another local runtime.
- Revoke a browser or signer session without rotating the entire community.

### Community member

- Open a stable URL and reach authorized channels from any supported device.
- Mention agents that are hosted elsewhere and receive unambiguous delivery failures.
- Read and post attachments without installing Desktop.

### Operator

- Deploy a versioned, health-checked build behind HTTPS.
- Configure Relay, HTTP, media, signer, and optional identity-provider endpoints without rebuilding.
- Upgrade or roll back without mutating Relay data or exposing secrets.

### Contributor

- Understand which behavior belongs to this client, the Relay, or an optional service.
- Reproduce a defect with synthetic identities and public example endpoints.
- Submit a focused change with protocol, security, accessibility, and test evidence.

## Goals

### G1: Production-hosted browser client

- Serve a production build at one stable HTTPS origin.
- Support WebSocket, signed HTTP, media, Git, invitations, and client-side routes.
- Provide health checks, immutable image tags, rollback instructions, and a portable Compose profile.
- Never expose a Vite development server or development proxy as the production edge.

### G2: Multi-device identity

- Preserve the same public identity across authorized devices.
- Continue supporting NIP-07 and encrypted local vaults.
- Add a signer abstraction that can support NIP-46 remote signing without changing feature code.
- Treat OIDC, OAuth, and passkeys as account or access signals; they do not replace Nostr proof.
- Provide explicit device/session inventory and revocation before calling remote signing production
  ready.

### G3: Responsive workspace

- Phone: single active surface, bottom navigation, full-width detail views.
- Tablet: persistent workspace navigation plus one primary detail pane; threads and secondary detail
  appear as overlays or replaceable panes.
- Desktop: efficient multi-pane navigation with user-resizable panels.
- Avoid hover-only commands, clipped composers, inaccessible touch targets, and keyboard-induced
  layout loss.

### G4: Remote-agent collaboration

- Discover mentionable agents from Relay state rather than local process registration.
- Preserve exact `p` tags and Relay authorization semantics when mentioning an agent.
- Show a visible rejection when an agent cannot be addressed.
- Never create, start, or duplicate an agent unless an explicit authenticated control-plane action
  exists.

### G5: Upstream-compatible delivery

- Keep protocol logic behind typed clients and signer interfaces.
- Keep deployment configuration separate from product defaults.
- Maintain a dated upstream dependency register.
- Split contributions by ownership boundary so they are reviewable by the relevant project.

## Non-Goals

- Bundling Buzz Relay, databases, object storage, or agent runtimes into the Web image.
- Replacing Nostr signatures with a Google, Apple, OIDC, password, or passkey session.
- Storing an unencrypted private key on a server or in browser storage.
- Reimplementing Desktop-only shell, local Git, model-provider, or process-management features.
- Forking Relay protocols for one deployment when a configurable upstream contract is possible.
- Promising that a posted message woke an agent when only Relay acceptance is known.

## Functional Requirements

### Access and onboarding

- The first screen identifies the community and actual Relay endpoint.
- Signer choices describe where key material lives and which features require NIP-44.
- A linked account must prove control of the existing Nostr identity during enrollment.
- Signing out clears in-memory signer state and terminates browser and remote-signer sessions where
  supported.
- Losing or revoking one browser session must not invalidate other approved devices.

### Messaging and media

- Channel, DM, thread, reaction, edit, delete, mention, upload, and download flows use the configured
  upstream Relay services.
- WebSocket transport may be proxied independently from the canonical URL used in signed events.
- HTTP/media endpoints may be configured independently when the deployment topology requires it.
- Upload progress, failure, retry, size, and unsupported-format errors are visible.

### Device layouts

- Layout selection is based on available content width, not user-agent detection.
- Critical navigation, composer, approval, and attachment controls remain available in every mode.
- Tablet acceptance covers portrait, landscape, and split-view widths.
- Focus, scroll position, unread boundary, and draft state survive pane transitions.

### Operations

- Production configuration is runtime-loaded and contains no secrets.
- Secrets are injected only into the service that needs them.
- Public ingress terminates TLS and sets a restrictive Content Security Policy.
- Logs redact authorization headers, signed event bodies when sensitive, and all key material.
- The deployment exposes readiness and liveness endpoints and documents backup-independent rollback.

## Success Measures

- A returning user reaches an existing channel from a second approved device without importing a
  raw private key into the page.
- A tablet user can switch channels, read a thread, post, mention an agent, and attach a file without
  entering a phone-only layout.
- No additional Buzz Desktop or agent runtime is started during browser use.
- Real-Relay acceptance passes for authentication, reconnect, messages, mentions, media, and session
  revocation.
- Every release is reproducible from a commit, passes CI, and has upgrade and rollback notes.
- Generic fixes are either accepted upstream or tracked with a documented reason for remaining
  downstream.

## Release Gates

### Private preview

- Production static build behind private HTTPS access.
- Existing signer modes only; no unattended server-side key custody.
- Desktop, tablet, and phone smoke tests against a non-production identity.
- Recovery and rollback procedure exercised.

### Multi-device beta

- Reviewed remote-signer threat model and protocol contract.
- Device authorization, expiry, revocation, and audit trail.
- NIP-44 encryption/decryption compatibility.
- Rate-limit, reconnect, duplicate-delivery, and signer-unavailable tests.

### General release

- Independent security review of signer and account-linking boundaries.
- Accessibility and responsive visual regression gates.
- Versioned migrations with backward-compatible rollback.
- Operator documentation for private-network and public-edge deployments.

## Open Decisions

- Whether upstream Buzz remote-signing work will provide the signer service, only a client, or both.
- Whether federated identity is enforced by the Relay, an access gateway, or both.
- Which WebAuthn/passkey capabilities are sufficiently interoperable for key wrapping or only login.
- Whether the browser bundle should be served by Buzz Relay or by an independent same-origin edge.
- Which approval and agent-control operations have stable Relay contracts suitable for Web.
