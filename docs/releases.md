# Releases

## Normal changes

Use a Conventional Commit PR title. Squash merge after the `PR title` and `build` checks pass.
GitHub uses the PR title as the squash commit title.

| PR title prefix | Version change |
| --- | --- |
| `fix:`, `perf:`, `deps:`, `revert:`, `docs:` | Patch |
| `feat:` | Minor |
| Any accepted type with `!`, such as `feat!:` | Major |
| `refactor:`, `test:`, `build:`, `ci:`, `chore:`, `style:` | No release by itself |

Scopes are optional. For example, use `fix(scan): stop cancelled scans`.
Use a short description after the colon. Use `!` only for a breaking change.
These version rules also apply before version 1.0.0.

Do not update versions or add change fragments for normal PRs.
Client and server changes share one release. The private client is built into the Python package.

## Publish a release

1. Merge normal PRs into `main`.
2. Wait for Release Please to open or update its release PR.
3. Review the version, changelog, and checks. Obtain user approval before merging a release PR.
4. Squash merge the release PR.
5. Confirm the Release action passes and the new version appears on PyPI.

Release Please updates four files:

- `CHANGELOG.md`
- `.release-please-manifest.json`
- `server/pyproject.toml`
- `server/uv.lock`

The root release configuration includes all repository changes.
The TOML updater changes the version of the editable package in the lockfile. External dependency versions stay unchanged.
The initial manifest starts at the published version, 0.1.33.

Release Please creates a `v<version>` tag and a GitHub release with changelog notes.
The tag starts the Release action. It checks the tag, tests both packages, and builds the frontend and Python distributions.
It tests the installed wheel before publishing to PyPI, then attaches the distributions to the existing GitHub release.
A GitHub release alone does not confirm PyPI publication.

## Credentials and repository settings

The only stored secret is `PYPI_TOKEN`, the PyPI API token used by `uv publish`.
Release Please uses GitHub's temporary `GITHUB_TOKEN`. No GitHub user token is stored.
Its job grants contents, issues, pull-request, and Actions write permissions.

GitHub does not automatically run tag workflows for tags created with `GITHUB_TOKEN`.
Generated PR workflows can also need manual approval.
Release Please explicitly dispatches title and build checks on its PR branch, and publication on its release tag.
Dispatch events work with `GITHUB_TOKEN` and need no extra credential.
The normal PR and tag triggers remain available.

Renew the PyPI secret in Settings > Secrets and variables > Actions if it expires or is revoked.
Never print token values or commit them to the repository.

Apply these repository settings after owner approval:

- Allow squash merges. Disable merge commits and rebase merges.
- Use the PR title as the squash commit title. Use no commit-message body.
- Require the `PR title` and `build` checks on `main`, including for administrators.
- Do not require extra reviews or an up-to-date branch.
- Enable Settings > Actions > General > Allow GitHub Actions to create and approve pull requests.

The Actions setting permits PR creation. This workflow does not approve or merge PRs.
Until these settings are applied, the checks report failures but do not block merging.
Use these commands to apply the approved settings:

```bash
gh api --method PATCH repos/byronwall/srcly \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK

gh api --method PUT repos/byronwall/srcly/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

gh api --method PUT repos/byronwall/srcly/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {"strict": false, "contexts": ["PR title", "build"]},
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

## Recovery

If no release PR appears, check the Release Please action.
Hidden maintenance types do not create a release by themselves.
Run Release Please manually on `main` to retry PR or tag creation.
If dispatched PR checks fail to start, run PR title and Release manually on the release PR branch.

If a PR title fails, edit it. The title check runs again on title edits.
If a release PR fails the lock check, investigate the updater before merging.
Do not remove `--locked` to hide a version mismatch.

If publication fails, fix its cause and rerun the failed Release job.
If PyPI already has both distributions, rerun the failed publish job.
`uv publish` checks PyPI and skips files already uploaded with the same content.
Do not move a published tag or reuse a published version for different files.

The manual Release action runs checks on the selected branch or tag.
It publishes only when a version tag is selected.
The old `publish-srcly.sh` script is an emergency local path. It bumps the package version and needs reconciliation with Release Please.
Do not use that script for normal releases.
