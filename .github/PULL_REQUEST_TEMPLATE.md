# Summary

<!-- What does this change and why? -->

## Type

- [ ] New game / variant / content pack
- [ ] Bug fix
- [ ] Engine / UI change
- [ ] Docs / tooling

## Checklist

- [ ] `node scripts/run-tests.js` passes
- [ ] No hidden info leaks on shared screens (secret/role/location/colour/icon); a regression test
      was added if this touched the UI
- [ ] Engine changes stay pure & deterministic (seeded PRNG only; JSON-serializable state)
- [ ] Invalid configs are blocked by `validateConfig` (errors) and the UI disables proceeding
- [ ] No generated artifacts (`app.html`) or secrets/tokens committed
- [ ] Updated `CHANGELOG.md` if user-facing

## Testing

<!-- How did you verify this? -->
