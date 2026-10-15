<!-- Title: type(scope): subject (#<issue>) — the same as the commit subject. Open as a draft. -->

Closes #<!-- issue number; use "Refs #n" for an issue this PR does not finish -->

## Summary

<!-- 1–3 bullets: what changed and why. -->
-

## Blocks

<!-- One line per pushed block while the PR is a draft: short sha + what it does. -->
- [ ] `<sha>` —

## Migration slot

<!-- The claimed version, e.g. 20261015100000 (+1 for each further migration in this branch), or "none". -->
none

## Test plan

<!-- Tick only what was actually run on the PR head; attach outputs or links. -->
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] db reset + pgTAP (with a migration)
- [ ] browser walk, desktop 1440 + mobile 390, no console errors (screenshots below)

## Notes for the reviewer

<!-- Trade-offs, known gaps, questions; legacy behaviour kept and the workaround not copied (D20). -->
