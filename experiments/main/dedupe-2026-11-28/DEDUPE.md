# Remove repetition and redundant wording from one PR's inputs

The experiment gives a coding agent the same requested change in different forms. For one PR you edit four of
them so each says its content once, in as few words as it can, **without changing what it says**:

- `intent.md`: the prose intent (a teammate's text; the prose-intent agent gets it)
- `brief.md`: a 1-3 sentence request (the prose-brief agent gets it)
- `fresh/edit.json` and `chain/edit.json`: the same intent as an edit of two different component graphs (the
  graph agents get these)

## What you may read

Only the files in your PR's folder, `/private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/dedupe/PULL/`:

- the four files above;
- `pr.md` (PR description) and `spec.md` (the interface the tests expect). Every agent gets both, word for word;
- `fresh/graph.md`, `chain/graph.md` (the graphs as text) and `graph.yaml` next to each (exact ids);
- `feedback.md`: an independent AI check of the edits and the human reviewers' comments. The check was made
  on the edits before some fixes, so a finding may already be fixed; check the current file.

Do not read anything else: no other PR folder, repository, source code, git history, test, benchmark file, or
web. Nobody may use the PR's real solution. The only command you may run is the validation below.

## Rules

**Intent**
- Remove sentences or clauses that restate another part of the intent, and wordy phrasing ("in a way that",
  "make sure that ... is", "as specified", "the existing ... that already exists"). Merge two sentences that say
  one thing.
- Keep every requirement, condition, constraint, exception, name and open point. Do not add anything, do not
  resolve what it leaves open (if it says "make the failure policy explicit", keep that), and do not reword
  sentences that are already tight. Keep the author's terms.
- Text that restates the spec stays (whether to drop it is a separate decision), but say it once and briefly.

**Edits (both graphs)**
- Each requirement in the intent appears **exactly once** across the whole edit, on the most specific entry it
  belongs to (a node, or an edge when it is about the dependency). Do not repeat it on the node, its edges and
  the description.
- An edge whose content is all on a node still needs a note: keep it to a short phrase saying what the
  dependency is for, with nothing a node already says.
- Nothing the intent does not say: no file paths, function or type names, or details from the spec or PR
  description that the intent leaves out. A new node's `files` list keeps only paths the intent names (else
  `[]`), and its `description` must not repeat its `note` (drop the description if it would).
- Both edits carry the same content. They differ only where the graphs differ (ids, which component a part lands
  on).
- If you change the intent, the edits follow the new intent.
- Do not add, remove or retarget nodes or edges unless feedback shows a requirement sits on the wrong entry or a
  repeated entry is now empty. Keep ids. Every marked entry keeps a non-empty note.

**Brief**
- Change it only if it repeats itself or uses more words than needed. 1-3 sentences, no code names a developer
  would not say.

**Human comments.** Act on any comment about repetition, extra detail, or wording. A question about what the
intent means (for example "this doesn't say what the behaviour should be") is for the intent's author: don't
answer it in the text; list it in `changes.md`.

## Output

Write to `/private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/dedupe/PULL/out/`: `intent.md`, `brief.md`, `fresh/edit.json`, `chain/edit.json` (always all four,
copied unchanged if nothing changed) and `changes.md`: one line per change and why (repetition / wording /
added detail / reviewer comment), the word counts before and after for each of the four, and any open questions
for the intent's author.

Validate each edit (the run fails on a bad id or an empty note):

    node /Users/andg/Desktop/cs-329m-experiment/tools/llm-only/apply-edit.mjs /private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/dedupe/PULL/ARM/graph.yaml /private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/dedupe/PULL/out/ARM/edit.json /private/tmp/claude-501/-Users-andg-Desktop-CS-329M/7c53770b-be93-4fe5-bcd8-a992d7eeacad/scratchpad/dedupe/PULL/out/ARM/edit.yaml
