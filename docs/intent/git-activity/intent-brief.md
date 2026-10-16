# Local activity as review context

## My read

Byron wants information that static structure cannot supply. Two equally complex files may deserve different attention when one changes often and the other remains stable. Git activity can help decide what to inspect now, while complexity helps explain what may be difficult to change.

This initiative tests that distinction with bounded file histories. It should connect an activity count to the commits that produced it. A reviewer can then distinguish recurring changes from a one-time format update, merge convention, or generated file. Activity describes attention and change, not poor quality by itself.

The audience is a developer using Srcly against a local repository. The tool should remain useful without Git history. History analysis must be optional and separately observable, so a normal source scan does not acquire an unexplained cost or a hidden external dependency.

## What matters most

- Add a different prioritization question rather than another size proxy.
- Show the history window, source revision and supporting commits.
- Explain merge, rename, shallow-history and bulk-change limitations.
- Keep change frequency separate from changed-line volume.

## Boundaries

Start with file-level commit frequency in a declared window. A proposed 90-day default and 180-day comparison are reversible study settings, not user requirements. Do not reconstruct function history, infer developer ability, connect ticket systems, or introduce a hosted service.

Use only explicitly selected local repositories. Do not fetch missing history automatically. A shallow or unavailable history must remain unknown rather than displaying zero changes. Dirty source must be identified because its metrics may differ from the history revision.

## What seems settled

Filesystem modification time already exists but cannot substitute for Git activity. The research identifies activity as the first additional source to test after trustworthy structure. Its unique value has not been measured in Srcly.

The portfolio evaluation supplies a review method. A small activity proof can use that method without waiting for every portfolio candidate. Broader co-change analysis depends on this proof earning its cost first.

## Next step after confirmation

Produce a local history table for hand-checkable cases, then compare activity-assisted and source-only decisions. The [shape](shape-brief.md) and [implementation plan](implementation-plan.md) retain a rejection path if the history adds no useful prioritization. All implementation remains planned.
