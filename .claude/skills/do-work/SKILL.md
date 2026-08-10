---
name: do-work
description: 'Execute a unit of work end-to-end against a GitHub issue: set up a branch, plan, implement, validate with typecheck and tests, commit, close the sub-issue, and open a PR when the parent PRD is complete. The PR closes the PRD on merge. Use when user wants to do work, build a feature, fix a bug, or implement a phase from a plan.'
---

# Do Work

Execute a complete unit of work tied to a GitHub issue: resolve it, branch for it, plan, build, validate, commit, and close the sub-issue. If it was the final phase of a PRD, open a PR. The PR closes the parent PRD on merge via `Closes #<PRD>` in its body.

## Input

The user may invoke this skill with:

- **An issue number** — e.g., `/do-work 14`
- **An issue title or title fragment** — resolve with `gh issue list --search "<fragment>"`
- **Nothing** — fall back to the first open sub-issue (in GitHub's sub-issue priority order) of whatever PRD the user most recently worked on

## Workflow

### 1. Resolve the target issue

Look up the issue with `gh issue view <n>`.

- If the issue is a PRD (it has open sub-issues), pick the **first open sub-issue in priority order** and work on that one. The order is what GitHub's sub-issues API returns; it can be changed via the sub-issues priority endpoint, and it does **not** correspond to issue number (a later-created sub-issue can be promoted above an older one):

  ```
  gh api /repos/:owner/:repo/issues/<PRD>/sub_issues \
    --jq '[.[] | select(.state=="open")] | .[0].number'
  ```

- If the issue is a phase sub-issue, work on it directly.
- Identify the parent PRD. Each phase body starts with `Part of #<PRD>` — parse that line. You need the PRD number for branch naming and PR creation.

### 2. Set up the branch

Branch name: `<prd-issue-number>-<prd-title-slug>` — for example, `12-interrupted-job-recovery`. The branch is keyed to the PRD, not the phase, so all phases of one PRD share a branch.

- If the branch exists locally or on the remote, check it out.
- If not, create it fresh from `main`:

  ```
  git checkout main
  git pull
  git checkout -b <branch>
  ```

- If the working tree has uncommitted changes on a different branch, **stop and ask the user** before touching anything — do not stash or discard silently.

### 3. Understand the task

Read the sub-issue body: What to build, Acceptance criteria, referenced ADRs. Read the parent PRD if broader context is needed. Explore relevant code. If anything is ambiguous, ask before coding.

### 4. Implement

**For backend code**: red/green/refactor, one test at a time, tracer-bullet style.

1. Write a single failing test for the smallest vertical slice of behavior
2. Run it — confirm it fails (red)
3. Write the minimum code to make it pass (green)
4. Repeat from step 1 for the next slice
5. Refactor when needed, with tests kept green

Do not write all tests upfront. One at a time.

**For frontend code**: implement directly without TDD. Start the dev server and verify the change in a browser before declaring it done. Typecheck and unit tests verify code correctness, not feature correctness.

### 5. Validate

Run the feedback loops until both pass cleanly:

```
npx nx affected -t typecheck
npx nx affected -t lint --fix
npx nx affected -t test
```

### 6. Commit

Once typecheck and tests pass, commit. Short imperative subject, optional body for the "why".

### 7. Tick acceptance criteria and close the sub-issue

Tick completed acceptance checkboxes on the sub-issue body, then close it:

```
gh issue view <n> --json body --jq .body > /tmp/body.md
# edit /tmp/body.md: turn matching `- [ ]` into `- [x]`
gh issue edit <n> --body-file /tmp/body.md
gh issue close <n>
```

The sub-issue is closed once its phase is committed on the branch. The **PRD stays open** — it is only closed when the PR merges.

If a previously-closed sub-issue needs follow-up work (bugs found in review, acceptance miss), fix it **in place on the same branch**, push, and let the open PR update. Do not reopen the sub-issue or create a new branch — the PR is the unit of review for the whole PRD.

### 8. Open a PR when the PRD is complete

Check whether the parent PRD has any remaining open sub-issues whose work hasn't been done on this branch yet:

```
gh api /repos/:owner/:repo/issues/<PRD>/sub_issues \
  --jq '[.[] | select(.state=="open")] | length'
```

If there are phases left, stop — subsequent `/do-work` runs will pick them up. If every phase has been implemented, committed, and its sub-issue closed, push and open a PR:

```
git push -u origin <branch>
gh pr create --base main \
  --title "<PRD title>" \
  --body "$(cat <<'EOF'
Closes #<PRD>
EOF
)"
```

Only the PRD goes in the PR body — sub-issues were already closed as each phase landed. GitHub closes the PRD when the PR merges.

### CI and branch protection

CI does not yet exist for this repo. Once a continuous build is in place, enable branch protection on `main` to require a green build before merge. Until then, the human reviewer is the merge gate — do not merge without one.
