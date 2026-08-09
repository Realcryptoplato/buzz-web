# Maintenance Policy

## Repository Roles

- `main` is releasable and protected by CI.
- Feature branches contain one coherent behavior or documentation concern.
- Deployment-specific configuration and secrets belong in a separate private repository.
- `hardy4yooz/buzz-web` is the direct project upstream; `block/buzz` owns the Relay and official
  client/protocol surfaces.

## Issue Triage

Every accepted issue should identify:

- user-visible outcome and current behavior;
- affected Relay/client version or commit;
- protocol and authorization boundary;
- security and privacy impact;
- reproducible acceptance checks;
- related upstream issue, PR, or explicit statement that none was found.

Use `blocked-upstream` only when a concrete upstream contract or release is required. A related
upstream discussion alone is not a blocker.

Security vulnerabilities and private Relay data never belong in public issues. Follow
[SECURITY.md](../SECURITY.md).

## Pull Request Standard

- One behavioral concern per PR.
- Conventional Commit title and DCO-signed commits.
- Focused tests first, then repository-required checks.
- Screenshots at relevant phone, tablet, and desktop widths for visual changes.
- Explicit account of protocol, custody, privacy, migration, and rollback effects.
- No generated reports, local runtime configuration, credentials, or private hostnames.
- Link the upstream issue/PR when behavior should eventually converge.

Draft PRs are preferred until implementation and required checks are complete. Reviews should
prioritize correctness, security, interoperability, regressions, and missing evidence before style.

## Upstream Synchronization

At least monthly, and before protocol or identity work:

1. Fetch the direct upstream default branch and review its changelog.
2. Recheck the dependency register in [Architecture Evolution](architecture-evolution.md).
3. Search `block/buzz` issues, PRs, branches, and recent commits for overlapping work.
4. Rebase or merge upstream according to repository policy without rewriting other contributors'
   work.
5. Record superseded downstream patches and remove them only after the upstream release is verified.

Contribution destinations:

| Change | Preferred destination |
| --- | --- |
| Browser UI, vault, responsive behavior, Web tests | `hardy4yooz/buzz-web` |
| Relay routing, authentication, media or Git contract | `block/buzz` |
| Reusable Rust client/protocol behavior | `block/buzz` |
| Generic container and edge examples | closest project that owns the served bundle |
| Organization domain, IdP, access policy, host inventory | private deployment repository |

## Dependency and Release Hygiene

- Review dependency updates weekly; merge only with relevant checks and changelog review.
- Pin CI actions by commit and production images by immutable digest.
- Generate releases from tagged commits with release notes covering user impact, migrations,
  security, known limitations, and rollback.
- Maintain a supported-version statement and retire unsupported versions explicitly.
- Run secret, dependency, and container scanning before a general release.

## Operational Evidence

Production readiness requires evidence, not only successful compilation:

- exact source commit and image digest;
- configuration schema version, without values that reveal private infrastructure;
- real-Relay acceptance result using a non-production identity;
- responsive and accessibility evidence;
- health/readiness result;
- upgrade and rollback result;
- known limitations and upstream dependencies.

Do not paste raw logs into public issues. Reduce them to the smallest secret-free evidence that
supports the claim.
