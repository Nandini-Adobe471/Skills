---
name: eds-block-guide
description: >-
  Discover and document the blocks of the Adobe Experience League EXLM project
  (github.com/adobe-experience-league/exlm) — an Adobe EDS / Universal Editor site. It
  works against the EXLM project live from GitHub (no local checkout needed): it lists
  the EXLM blocks available (newest and recently-changed first), then generates a
  content-authoring guide for any EXLM block — for both content authors and developers
  — as a Markdown file and a Word .docx. Use this whenever the user wants to document,
  explain, or write a guide/README for one or more EXLM blocks / Universal Editor
  components, wants to know "what blocks can I use" / see the EXLM block catalog, asks
  "how do authors use the cards block", "document this block", "authoring guide for our
  components", or "explain the fields in component-models.json". Trigger even when the
  user names a specific EXLM block (e.g. "detailed-teaser", "accordion", "carousel") or
  names no block at all.

  On first engagement in a session, open with the welcome banner in the skill body.
---

# EXLM block guide

This skill documents the **Adobe Experience League EXLM project** — the Adobe EDS /
Universal Editor site at `github.com/adobe-experience-league/exlm`. Two jobs: help a
user **find** the right EXLM block, then **document** it well for two readers at once —
a **content author** who needs to know what to fill in, and a **developer** who needs to
know what the block does with it. The whole value is bridging those views: the field an
author sees as "Heading" is the same row the developer's JS reads as
`block.children[0]`.

Per block you produce **two files**: a Markdown guide (commit next to the block) and a
Word `.docx` (share with non-technical authors).

## Welcome banner

The first time this skill engages in a conversation (a catalog request or a direct
guide request), open with this banner so the experience feels branded and clear. Keep
it to the first response of the session — don't repeat it on every follow-up.

```
📘  EXLM Block Guide
────────────────────────────────────────────
Author-ready guides for the Adobe Experience League (EXLM) blocks — for content
authors AND developers, as Markdown + Word. Pulled live from the EXLM project.

  • "list the blocks"            → browse the EXLM catalog (newest / changed first)
  • "document the <name> block"  → full authoring guide (.md + .docx)
```

Then continue with the list or the requested guide.

## Source: the EXLM project (live from GitHub)

This skill always targets the **EXLM** project — `adobe-experience-league/exlm` on the
`main` branch. (There's no need to ask the user for a repo path; EXLM is the fixed
source.)

**Fast list, latest content (cache-first + background warm).** The engine caches EXLM
under `~/.eds-block-guide/cache/`. The strategy:

- **On launch**, show the block list **instantly from cache**, and at the same time kick
  off a background **warm** that re-fetches the shared config JSON so the cache is
  up-to-date by the time the user picks a block:
  `node <skill>/scripts/blocks.js warm` (run it in the **background**, non-blocking).
- **At generation**, build the guide from the **latest** content: run
  `show <id> --fresh`, which pulls that block's `js`/`css` live from GitHub (configs come
  from the just-warmed cache). So the reference material is always current, while the
  list never makes the user wait.

`REFRESH=1` on any command still forces a full re-fetch; `--fresh` on `show` refreshes
just the selected block's source. Use `warm` + `--fresh` for the normal flow; use a full
`REFRESH=1 … catalog` only when the user explicitly asks "what's new / check for updates".

## Where the truth lives

The EXLM project describes its blocks in three root-level JSON files plus per-block
source. The
bundled `blocks.js` engine joins them for you — always use it rather than hand-parsing
(`component-models.json` alone is often >250 KB):

- `component-models.json` — the fields authors fill in (labels, widgets, options, **conditions**)
- `component-definition.json` — the block's title, group, and default/sample content
- `component-filters.json` — where a block can be placed and what it can contain
- `blocks/<id>/<id>.js` + `.css` — how authored content becomes DOM, and how variants look

For the meaning of every field type, the `classes` style field, conditional fields,
and blocks with no model, read `references/field-types.md`.

## The data engine (`scripts/blocks.js`)

Zero dependencies; targets the EXLM project live from GitHub by default (no `--repo`
needed).

- **Catalog (discover):** `node <skill>/scripts/blocks.js catalog`
  Prints a neat Markdown table (`# | Block | ID | Group | Status`) of every EXLM block,
  with `[NEW]` / `[UPDATED]` in the Status column for blocks added or changed since the
  last catalog run (snapshot in `~/.eds-block-guide/`). `--json` for structured output;
  `--peek` to look without updating the snapshot. First run has no history, so nothing
  is tagged.
- **Spec (document):** `node <skill>/scripts/blocks.js show <id> [<id> ...] [--out spec.json]`
  Emits the normalized joined spec per block. Unknown ids come back as
  `{found:false, suggestions:[...]}` — offer those near matches rather than guessing.

Each spec has: `definition`, `placements`, `content_fields` (normalized, in model
order — each with `widget`, `required`, `default`, `options`, and `conditionText`),
`variants` (the `classes` style field, split out), `source` (js/css), and
`has_conditional_fields` (true if any field is gated by a `condition`).

## Workflow

### 1. Figure out the target block(s)

If the user named a block, go to step 2. If they didn't — or they ask what's available,
or you're unsure of exact ids — run the **catalog** and present it **as the neat table
the engine outputs** (keep the `# | Block | ID | Group | Status` columns so it stacks
cleanly).

**On launch, warm the cache in the background** so the content is ready and current by
selection time: start `node <skill>/scripts/blocks.js warm` as a **background** command
(don't block the list on it). The list itself renders instantly from cache.

**Show the COMPLETE list — every block the engine returns (all ~133).** Do not
truncate, summarize, or show only "popular" / "sample" blocks — the user needs the full
catalog to choose from, and cutting it down is a recurring mistake. The full table is
long, and that's fine; output all rows. (If you also want to make it easier to scan,
you may additionally save the full table to a `exlm-catalog.md` file and mention it —
but never as a substitute for showing the complete list.)

**Always surface what's new alongside the list.** Right after the table, add a short
"What's new" line that names the newly added and updated blocks explicitly, e.g.
"🆕 Newly added: Hero V2, Quiz Scorecard · ✏️ Updated: Accordion". If nothing is tagged,
say so in one line ("No blocks are new or changed since your last check."). This is the
payoff of the change-tracking — don't bury it.

Then ask which block(s) they want, by number, id, or name.

Keep resolution smooth: if `show` returns `found:false` but there's a single clearly
closest suggestion, **just proceed with it** and note it in one line ("Documenting
`detailed-teaser` (from 'detaild teaser')"). Only pause to ask when two or more
suggestions are genuinely plausible.

**Multiple blocks are welcome.** The user can pick several at once (e.g. "document
accordion, tabs and carousel", "do the 3 new ones", or a multi-select in the picker).
When they do, produce a **separate guide pair per block**, and extract every spec in one
`show a b c` call so each config file is read once. Report all the files at the end.

**Build the picker from the live engine every time — never hard-code the block list.**
Always populate the picker's rows (and their Status tags) from a fresh
`node <skill>/scripts/blocks.js catalog --json` (use `--peek` on first render; use the
`REFRESH=1` catalog output after "Check for updates"). Embedding a stale, hand-written
list makes different sessions show different blocks and miss newly added ones — the
catalog count changes as EXLM changes (e.g. it can be 133 one day, 136 the next). Read
the engine, then render.

**Picker columns (when using a widget list).** Columns with proper headings:
**Block**, **ID**, **Group** (wide enough to show "Default Content" in full), and
**Status** (**New** / **Updated** / **No change**). Plus a leading checkbox column.
(No "Guide?" column.)

Picker behavior:
- **Whole row toggles selection** — clicking anywhere on a row checks/unchecks it and
  highlights it; the checkbox reflects the state.
- **Multi-select**; the **Generate** button is **disabled until at least one block is
  selected**, and reads "Generate N guide(s)" once blocks are picked.
- **Two-stage status message** in the top strip: on first load show *"Showing the cached
  list. Click Check for updates to pull the latest from EXLM."* After the user clicks
  **Check for updates** (which `sendPrompt("check for updates")` → you re-run the catalog
  with `REFRESH=1` and re-render), show the result: *"Checked just now — N new, M
  updated"* (naming them) or *"no blocks are new or changed."* Don't show an
  "already have a guide" count.

The **"Check for updates"** button sits by the status strip.

### 2. Extract the spec, then read the JS with it open

Run `blocks.js show <id> --fresh` (the `--fresh` flag pulls the block's live js/css so
the guide reflects the latest EXLM). Read `spec.source.js.content` and work out **what
each content field becomes** in the DOM — which element, which class, what visual role.
Fields are in the order the JS reads the rows (see `references/field-types.md`). For
variants, find the matching CSS rule so you can describe what each option does.

### 3. Handle conditional fields automatically (no prompt)

Keep the flow smooth — **don't stop to ask questions.** When `spec.has_conditional_fields`
is true, just apply the sensible default: add a **"Shown when"** column to the field
table (each row is "Always" or its exact `conditionText`) **and** a short **"Fields that
appear only sometimes"** call-out explaining the reveal chain in plain words. Also briefly
note that the "Always" fields are still *optional* (visible but only render when filled).

Only ask the user something if the request is genuinely ambiguous or they explicitly
asked to choose a format. Otherwise proceed straight to writing.

### 4. Draft the guide, then present it for review

Write the guide following the template below (don't save files yet). Write for a smart
reader who isn't steeped in EDS jargon: explain *why* an author reaches for this block,
not just *that* it has fields. Keep author-facing sections free of code; put code detail
in the Technical reference. Flag conditional fields with the default from step 3
("**Shown only when** First CTA Type is Custom").

**Present the drafted guide itself as a rendered UI, not as plain markdown text in the
response.** If a visualization/widget tool is available (e.g. `show_widget`), render the
guide as a clean document card (title header, the four sections, tables) with an action
bar at the bottom. Only fall back to plain markdown if no widget tool exists.

**Add NO chat narration around these steps.** Do not write "here's the draft", "on it",
"saved", "delivered above", or similar. The guide card, the file cards, and the picker
ARE the response — let them speak. Emit the widget (and, on save, the files) with
essentially no surrounding text. The only time to add a sentence is a genuine caveat
(e.g. you had to infer something, or a block wasn't found).

**Keep the widget lean so it renders fast.** A big guide with per-cell inline styles
streams slowly (users see a long "rendering…" wait and get confused). Put shared styles
in ONE small `<style>` block with a few classes (e.g. `.tbl th/td`, `.h`, `.note`) and
keep the markup minimal — don't repeat `style="…"` on every cell. Prefer concise tables.
If a block's field list is very long, summarize grouped/repeated fields in one row (e.g.
"Second CTA (same 6 fields)") rather than emitting dozens of styled rows.

The action bar has two buttons (no preview), calling `sendPrompt`:

- **✏️ Edit** → `sendPrompt("I'd like to edit the <id> guide: ")` (user types changes)
- **💾 Save (MD + Word)** → `sendPrompt("save the <id> guide as markdown and word")`

Keep the buttons branded and clean (see the catalog picker for the visual style). Only
fall back to a plain-text question if no widget tool is available.

- If the user chooses **Edit**, apply the changes, show the updated draft, and present
  the action card again. Repeat until they're happy.
- If they choose **Save**, go to step 5.

For **multiple blocks**, present each draft the same way (or, if the user prefers, offer
one combined review) before saving anything.

### 5. Ask before saving, then write the files

When the user is happy, **ask whether to save** ("Shall I save it as Markdown + Word?")
and, if useful, where. On confirmation:

1. Write the Markdown to `<id>-authoring-guide.md`.
2. Build the Word doc:
   `node <skill>/scripts/build_docx.js --in <id>-authoring-guide.md --out <id>-authoring-guide.docx`
   (Dependency-free, offline. Keep tables as GitHub pipe tables so they become real Word
   tables.)

If the user says not to save, leave it as an on-screen draft — don't write files.

### 6. Deliver (silently)

On save, write the files and **deliver them via the file-attachment card with no
accompanying message** — no "saved", no file-path recap, no summary. The file cards are
the confirmation. Only speak if there's a real caveat (something inferred, or a block
not found).

## Guide template

```markdown
# <Block title> — Authoring guide

> One-sentence summary of what this block puts on the page.

## Overview & purpose
- What the block does and looks like to a visitor.
- When an author should choose it (and when not to).
- Where it can be used (`placements.can_be_placed_in`); if it's a container, what it
  can hold (`placements.can_contain`). Its editor group (`definition.group`).

## Authoring
How an author adds and fills the block, then the field table (one row per content
field, in model order). Include the conditional presentation chosen in step 3:

| Field | What it's for | Control | Required | Shown when |
| --- | --- | --- | --- | --- |
| <label> | <plain-language purpose> | <widget> | Yes/No | Always, or "<conditionText>" |

Then a **worked example** built from `definition.template` (the default content).

## Variants & options
If `variants` exists, one row per option describing the visual effect (cross-referenced
with the CSS), grouped by the option's `group`. If none, say so. Also cover any
`select`/`boolean`/`radio-group` content fields that are configuration, not content.

| Variant | Effect | CSS class |
| --- | --- | --- |
| <label> | <what it changes visually> | `<value>` |

## Technical reference
For developers:
- **Files**: `blocks/<id>/<id>.js`, `.css`.
- **Component id / resourceType**: from `definition`.
- **Field → DOM mapping**: for each content field, the element/class the JS produces.
- **Behavior**: notable JS logic (responsive, author-mode branches, async data,
  conditional rendering, dependencies).
- **Nesting**: placement/containment rules from `placements`.
```

Adapt sensibly — if a block genuinely has no variants or no notable JS, say so briefly.
The template is a spine, not a cage.

## Blocks without a model

If `has_model` is false and `content_fields` is empty, the block is authored as a
**document table**. Derive its structure from the JS (`block.children` / `row.children`
usage) and describe authoring as a table: first row is the block name, each following
row is one record/cell as the JS reads it.

## Multiple blocks at once

For several blocks (or "all of them"), generate one guide pair per block by default.
Only produce a single combined document if the user explicitly asks. Extract all specs
in one `show` call so each config file is read once.
