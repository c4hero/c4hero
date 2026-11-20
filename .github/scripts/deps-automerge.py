#!/usr/bin/env python3
"""Keep Dependabot PRs merged in c4hero and c4hero-landing.

Run by .github/workflows/deps-automerge.yml. It authenticates as the owner of the DEPS_AUTOMERGE_TOKEN secret,
through `gh` and GH_TOKEN. It keeps no state between runs: what it has already done is read back from its own PR
comments. On each run, per repo:
  1. list open, non-draft Dependabot PRs into main. Skip a PR if it is an npm semver-major bump (majors are
     reviewed by hand, as both repos' dependabot.yml say), has a hold label, or has a commit that wasn't made by
     Dependabot (someone has edited the branch by hand);
  2. if a PR is up to date with main, every check on its head has passed (with the repo's required checks among
     them), and it is mergeable: approve it if the repo needs a code-owner review, wait for GitHub to report it
     CLEAN, and squash-merge it pinned to that head. That's one merge per repo per run, because each merge leaves
     the other PRs behind main;
  3. otherwise, if no PR is mid-rebase or mid-CI, ask Dependabot to rebase the next behind PR (`@dependabot rebase`).
     This serializes the rebase -> CI -> merge cycle instead of rebuilding every PR after every merge;
  4. a PR that is up to date and still fails CI, or that Dependabot hasn't rebased within REBASE_STALE, gets one
     comment per head commit saying why it's stuck. GitHub's notification for that comment is the alert.
     A common cause is c4hero's repo-wide `security` audit: one open advisory turns every PR red.

Never bypasses c4hero's "protect main" ruleset. Repository admins are bypass actors, so a direct merge call by the
token owner would succeed even when requirements are unmet. That's why it merges only after GitHub itself reports
mergeStateStatus CLEAN.

  deps-automerge.py             # one run
  deps-automerge.py --dry-run   # say what it would do, change nothing
"""
import datetime
import json
import subprocess
import sys
import time

REPOS = {
    # required: check names that must be present and green (the ruleset's list for c4hero; CI's job for landing).
    # approve: the repo needs an approving review before merge (code-owner rule).
    "c4hero/c4hero": {
        "required": ["lint-and-typecheck", "test", "e2e", "build", "security", "secret-scan"],
        "approve": True,
    },
    "c4hero/c4hero-landing": {
        "required": ["Typecheck and build"],
        "approve": False,
    },
}
HOLD_LABELS = {"hold", "do-not-merge", "no-automerge"}
DEPENDABOT = {"dependabot[bot]", "dependabot"}
OK_CONCLUSIONS = {"SUCCESS", "NEUTRAL", "SKIPPED"}
PENDING_STATES = {"QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED", "EXPECTED"}
REBASE_STALE = datetime.timedelta(hours=6)
REBASE_COMMAND = "@dependabot rebase"
STUCK_MARKER = "<!-- deps-automerge:stuck:{sha} -->"

DRY = "--dry-run" in sys.argv
NOW = datetime.datetime.now(datetime.timezone.utc)


def log(msg):
    print(f"{datetime.datetime.now(datetime.timezone.utc):%H:%M:%S} {msg}", flush=True)


def gh(*args, check=True):
    r = subprocess.run(["gh", *args], text=True, capture_output=True, timeout=120)
    if check and r.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed ({r.returncode}): {(r.stderr or r.stdout).strip()[-600:]}")
    return r


def gh_json(*args):
    return json.loads(gh(*args).stdout or "null")


def ts(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))


# ---------------------------------------------------------------- PR facts

PR_FIELDS = ("number,title,headRefName,headRefOid,isDraft,labels,mergeable,reviewDecision,statusCheckRollup,"
             "commits,createdAt")


def dependabot_prs(repo):
    # --limit stays small: the commits and check-rollup fields multiply GraphQL's node estimate per PR.
    prs = gh_json("pr", "list", "-R", repo, "--state", "open", "--base", "main", "--app", "dependabot",
                  "--limit", "30", "--json", PR_FIELDS)
    return sorted((p for p in prs if not p["isDraft"]), key=lambda p: p["createdAt"])


def is_npm_major(pr):
    """Dependabot writes `update-type: version-update:semver-major` into its commit message for each dependency."""
    if not pr["headRefName"].startswith("dependabot/npm_and_yarn/"):
        return False
    body = "\n".join(c.get("messageHeadline", "") + "\n" + c.get("messageBody", "") for c in pr["commits"])
    return "version-update:semver-major" in body


def foreign_commits(pr):
    """Commits on the branch not authored by Dependabot. Dependabot also refuses to rebase such a branch."""
    return [c["oid"][:7] for c in pr["commits"]
            if not {a.get("login") or "" for a in c.get("authors", [])} & DEPENDABOT]


def checks(pr, required):
    """('ok' | 'pending' | 'failed', detail). Every check on the head must be done and green, required ones present."""
    seen, failed, pending = set(), [], []
    for c in pr["statusCheckRollup"] or []:
        name = c.get("name") or c.get("context") or "?"
        seen.add(name)
        if c.get("__typename") == "StatusContext":
            if c.get("state") in PENDING_STATES:
                pending.append(name)
            elif c.get("state") != "SUCCESS":
                failed.append(name)
        elif c.get("status") != "COMPLETED":
            pending.append(name)
        elif c.get("conclusion") not in OK_CONCLUSIONS:
            failed.append(name)
    missing = [f"{r} (not started)" for r in required if r not in seen]
    if failed:
        return "failed", ", ".join(failed)
    if pending or missing:
        return "pending", ", ".join(pending + missing)
    return "ok", ""


def behind_by(repo, pr):
    return gh_json("api", f"repos/{repo}/compare/main...{pr['headRefOid']}", "--jq", "{behind_by}")["behind_by"]


def history(repo, pr, me):
    """What earlier runs did to this PR, read from the token owner's comments.

    rebase_at: when we last asked Dependabot to rebase, if that was after the head commit (i.e. still unanswered).
    stuck:     whether we already posted a stuck comment for this head commit.
    """
    comments = gh_json("pr", "view", str(pr["number"]), "-R", repo, "--json", "comments")["comments"]
    mine = [c for c in comments if (c.get("author") or {}).get("login") == me]
    head_at = ts(pr["commits"][-1]["committedDate"])
    asks = [ts(c["createdAt"]) for c in mine if c["body"].strip() == REBASE_COMMAND]
    rebase_at = max(asks) if asks and max(asks) > head_at else None
    stuck = any(STUCK_MARKER.format(sha=pr["headRefOid"]) in c["body"] for c in mine)
    return rebase_at, stuck


# ---------------------------------------------------------------- actions

def comment(repo, pr, body):
    if DRY:
        return log(f"  [dry] comment on #{pr['number']}: {body.splitlines()[0]}")
    gh("pr", "comment", str(pr["number"]), "-R", repo, "--body", body)


def note_stuck(repo, c, why):
    """One comment per head commit, so a stuck PR alerts once, not every run."""
    pr = c["pr"]
    log(f"  #{pr['number']} stuck: {why}")
    if c["stuck"]:
        return
    comment(repo, pr, f"deps-automerge: not merging this automatically: {why}.\n\n"
                      f"It will be retried when the branch changes (for example after `@dependabot rebase`).\n"
                      f"{STUCK_MARKER.format(sha=pr['headRefOid'])}")
    c["stuck"] = True


def merge(repo, cfg, pr):
    n, sha = str(pr["number"]), pr["headRefOid"]
    if cfg["approve"] and pr["reviewDecision"] != "APPROVED":
        log(f"  #{n}: approving")
        if not DRY:
            gh("pr", "review", n, "-R", repo, "--approve", "--body",
               "Automated approval (deps-automerge): Dependabot minor/patch or Actions bump, "
               "up to date with main, every check green.")
    # GitHub recomputes merge state asynchronously after a review. Merge only once it reports CLEAN, so the merge
    # satisfies the ruleset instead of riding an admin bypass.
    state = None
    for _ in range(12):
        if DRY:
            break
        v = gh_json("pr", "view", n, "-R", repo, "--json", "mergeStateStatus,headRefOid")
        if v["headRefOid"] != sha:
            log(f"  #{n}: head moved during merge; retry next run")
            return False
        state = v["mergeStateStatus"]
        if state == "CLEAN":
            break
        time.sleep(5)
    if not DRY and state != "CLEAN":
        log(f"  #{n}: merge state is {state}, not CLEAN; retry next run")
        return False
    log(f"  #{n}: squash-merging {sha[:7]}  {pr['title']}")
    if not DRY:
        gh("pr", "merge", n, "-R", repo, "--squash", "--delete-branch", "--match-head-commit", sha)
    return True


# ---------------------------------------------------------------- one repo

def process(repo, cfg, me):
    prs = dependabot_prs(repo)
    log(f"{repo}: {len(prs)} open Dependabot PR(s)")

    cands = []
    for pr in prs:
        n = pr["number"]
        if {l["name"].lower() for l in pr["labels"]} & HOLD_LABELS:
            log(f"  #{n} skipped: hold label")
            continue
        if is_npm_major(pr):
            log(f"  #{n} skipped: npm major, needs a human review ({pr['title']})")
            continue
        if bad := foreign_commits(pr):
            log(f"  #{n} skipped: non-Dependabot commits {', '.join(bad)}")
            continue
        verdict, detail = checks(pr, cfg["required"])
        behind = behind_by(repo, pr)
        rebase_at, stuck = history(repo, pr, me)
        c = dict(pr=pr, verdict=verdict, detail=detail, behind=behind, rebase_at=rebase_at, stuck=stuck,
                 conflicting=pr["mergeable"] == "CONFLICTING")
        c["current"] = behind == 0 and not c["conflicting"]
        cands.append(c)
        log(f"  #{n} checks={verdict}{' (' + detail + ')' if detail else ''} behind={behind}"
            f"{' CONFLICTING' if c['conflicting'] else ''}{' rebase-requested' if rebase_at else ''}")

    # 1. merge the first PR that is ready
    for c in cands:
        if c["verdict"] == "ok" and c["current"] and merge(repo, cfg, c["pr"]):
            return  # everything else is now behind main; the next run picks up the next one

    # stuck: up to date and red
    for c in cands:
        if c["verdict"] == "failed" and c["current"]:
            note_stuck(repo, c, f"checks failed on an up-to-date branch: {c['detail']}")

    # 2. something already in flight? wait for it
    for c in cands:
        n = c["pr"]["number"]
        if c["verdict"] == "pending" and c["current"]:
            return log(f"  waiting on #{n} CI")
        if c["rebase_at"]:
            age = NOW - c["rebase_at"]
            if age < REBASE_STALE:
                return log(f"  waiting on Dependabot to rebase #{n} (asked {int(age.total_seconds() // 60)}m ago)")
            note_stuck(repo, c, f"Dependabot hasn't rebased it within {REBASE_STALE} of `{REBASE_COMMAND}`")

    # 3. kick off the next rebase: green-but-behind first, then the rest (a newer main may fix a red PR)
    queue = sorted((c for c in cands if not c["current"] and not c["rebase_at"]),
                   key=lambda c: (c["verdict"] != "ok", c["pr"]["createdAt"]))
    if queue:
        pr = queue[0]["pr"]
        log(f"  #{pr['number']} is behind main: asking Dependabot to rebase")
        return comment(repo, pr, REBASE_COMMAND)
    log("  nothing to do")


def main():
    me = gh_json("api", "user", "--jq", "{login}")["login"]
    log(f"acting as {me}{' (dry run)' if DRY else ''}")
    failures = 0
    for repo, cfg in REPOS.items():
        try:
            process(repo, cfg, me)
        except Exception as e:  # one repo's failure shouldn't block the other
            failures += 1
            log(f"{repo}: ERROR {e}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
