# Check one PR's de-duplicated inputs against the originals

Someone removed repetition and wordy language from four texts for a PR. The rule was: **say the same, once, in
fewer words.** Nothing may be lost, added or resolved. You check that, independently.

Folder: `/private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/dedupe/PULL/`

- Originals: `intent.md`, `brief.md`, `fresh/edit.json`, `chain/edit.json`
- New: `out/intent.md`, `out/brief.md`, `out/fresh/edit.json`, `out/chain/edit.json`
- Context only: `pr.md`, `spec.md`, `fresh/graph.md`, `chain/graph.md` (component graphs as text). Do not read
  `out/changes.md` until you have made your own judgement, then use it only to understand intent.
- Read nothing else: no other folder, repository, code, git, tests, web.

Check:

1. **Intent.** List every requirement, condition, constraint, exception, name and open point in the original
   intent. Is each one still in the new intent with the same meaning? Does the new intent add or settle anything?
2. **Edits, each arm.** Does the new edit (all notes, labels, summaries, descriptions, across nodes and edges)
   carry every requirement of the **new** intent? Does it add anything the new intent doesn't say? Is any
   requirement still stated twice? Is anything that an original edit placed on a component now missing, or
   moved to a component where it doesn't belong (use the graph)? Do the two arms carry the same content?
3. **Brief.** Same goal and point as before, 1-3 sentences.

Write `PULL/verify.json`:

    { "pull": PULL, "verdict": "ok" | "minor" | "fix",
      "lost": ["requirement missing from the new version, and where"],
      "added": ["..."], "repeated": ["..."], "misplaced": ["..."], "arms_differ": ["..."],
      "notes": "one or two sentences" }

`fix` means something was lost, added, or changed in meaning. `minor` means a remaining repeat or a placement
doubt. Quote short phrases. Be exact and don't flag pure rewording.
