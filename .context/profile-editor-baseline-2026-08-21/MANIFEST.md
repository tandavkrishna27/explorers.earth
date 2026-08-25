# Profile editor source baseline

Captured: 2026-08-21 Asia/Calcutta
Branch: `codex/profile-settings-tabs`

This snapshot records pre-implementation staged, unstaged, and untracked work that
must be preserved. Do not stash, reset, checkout, or overwrite these files. Any
rollback must remove only the feature delta created after this baseline.

## Snapshot files

- `index.patch` — staged delta for planned tracked targets
  - bytes: 1744
  - SHA-256: `154B1156F201EA4F1C5918A4935DF58B1FCA1AEBEEF43C970135C04638996282`
- `worktree.patch` — unstaged delta for planned tracked targets
  - bytes: 33471
  - SHA-256: `EC9DB1FC82F90B80B1CF04F208D9050D413829CD43DBB8522537DB791CEBC195`
- `untracked/RecommendationsPresentationControls.tsx`
  - bytes: 13026
  - SHA-256: `A9D9C0C6EC6798BDA3BE2C640DBB7130884EFEE857AED51C56BF964AF8EA64D9`
- `untracked/ThemeAppearanceSection.tsx`
  - bytes: 9139
  - SHA-256: `F1C0507BA8FA97C947AC7BDE7D664F4E41F27EE63AC1D61A7B89FF285AC862E9`

## Planned source targets

- `explorers-earth/src/pages/Profile.tsx`
- `explorers-earth/src/features/Profile/components/ProfileForm.tsx`
- `explorers-earth/src/features/Profile/components/FeedFields.tsx`
- `explorers-earth/src/features/Profile/components/ThemeAppearanceSection.tsx`
- `explorers-earth/src/features/Profile/components/RecommendationsPresentationControls.tsx`
- `explorers-earth/src/components/ui/Accordian.tsx`
- `explorers-earth/src/index.css`
- related focused tests and the dedicated profile-editor Playwright spec

The `source/` tree contains byte-for-byte pre-implementation copies of all 15 existing
planned source/test/E2E targets. Per-task review packages use `git diff --no-index`
against these copies so pre-existing staged/unstaged work is excluded from review.

Verification rule: after any scoped rollback, regenerate the tracked patches and
hash the two untracked source files; they must match this manifest exactly.
