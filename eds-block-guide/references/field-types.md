# Universal Editor field types & authoring model reference

Read this when you need to translate a raw `component-models.json` field into
plain-language author guidance, or when you hit something you're unsure about.

## The three config files (source of truth)

An EDS / Universal Editor project defines its blocks in three root-level files. The
`blocks.js` engine joins them for you, but here's what each means:

| File | Answers | Feeds which guide section |
| --- | --- | --- |
| `component-models.json` | What fields does the author fill in? | Authoring + Variants |
| `component-definition.json` | Title, group, default content? | Overview + sample content |
| `component-filters.json` | Where can it be placed / what can it nest? | Overview + Technical |

A block is matched across all three by a shared **id**. Its rendering code lives in
`blocks/<id>/<id>.js` and `blocks/<id>/<id>.css`.

## Field `component` types → what the author sees

| `component` | Author sees | Guidance to give |
| --- | --- | --- |
| `text` | Single-line text box | Keep it short; no formatting. |
| `textarea` | Multi-line text box | Plain text, line breaks allowed. |
| `richtext` | Formatting toolbar | Bold, italic, links, lists allowed. |
| `select` | Dropdown (one choice) | List options and what each does; mention the default. |
| `multiselect` | Multi-choice picker | Authors pick several; note `maxSize` if set. |
| `boolean` | Toggle / checkbox | Describe the ON behavior vs OFF (default). |
| `radio-group` | Radio buttons | List options; exactly one chosen. |
| `reference` | Asset picker | Points at an image/file in the DAM; note size/format from the description. |
| `aem-content` | Content/link picker | Points at a page or fragment. |
| `custom-aem-tag` | Tag picker | Choose from the site's taxonomy tags. |
| `date-time` | Date & time picker | Note timezone handling if mentioned. |
| `number` | Number field | Note min/max or units if described. |

Other keys you may see on a field: `hidden` / `readOnly` (the engine passes these
through — mention if a field is author-invisible or locked), `placeholder`,
`validation`, and `condition` (see below).

## Conditional fields — the thing that confuses authors most

Many fields carry a `condition` (a JsonLogic rule) that only shows them when another
field has a certain value — e.g. a "Custom Background Color" picker that appears only
when "CTA Type" is set to Custom. The engine humanizes each rule into `conditionText`,
e.g. `First CTA Type is "custom"`, and sets `has_conditional_fields` on the spec when
any exist. Authors routinely get stuck hunting for a field that's hidden until they
flip another one, so this is high-value — but people mean different things by
"conditional fields." **When a block has conditional fields, the SKILL.md workflow asks
the user up front how they want them presented** (a "Shown when" column, a separate
callout, or both — and whether they also mean *optional* always-visible fields).
Follow their choice. If `conditionText` is empty, the field is always visible.

Two distinct kinds worth keeping straight when you explain them:
- **Conditional** — hidden by the editor until a trigger value is set (`condition`).
- **Optional** — always visible in the panel, but only render on the page when filled
  in (the JS skips empty rows). These have no `condition`; they're just not `required`.

## The special `classes` field = style variants

A `multiselect`/`select` field named **`classes`** is not content — its chosen values
become **CSS classes on the block**, which is how EDS expresses visual variants
(e.g. a "Style" dropdown, or `cards (highlight)` in document authoring). Treat it as
the **Variants & options** section, not a content field; the engine splits it into
`spec.variants`. For each option, the `value` is the literal CSS class — cross-
reference the block's `.css` (e.g. `.cards.highlight { … }`) to describe the visual
effect. A value like `bg-spectrum-blue-700` is a design-token background color; say so
rather than dumping the token.

## The field-order ↔ content-row bridge (important)

**The order of fields in the model is the order of rows/cells the block's JS reads.**
This is the most useful thing to explain, because it connects the author's view to the
developer's. Blocks often destructure their rows in model order:

```js
// "Extract properties, always same order as in model, empty string if not set"
const [backImage, eyebrow, title, description, subjectImage, cta1, cta2] = props;
```

In the Technical reference, map each model field to what the JS does with it (which
element/class it becomes). That mapping is the payoff of reading model + JS together.

## Blocks with no model (document-authored)

Some blocks have JS/CSS but no `component-models.json` entry (authored purely as
document tables). For these: `spec.has_model` is `false` and `content_fields` is empty.
Derive the structure from the JS (`block.children` / `row.children` usage) and describe
authoring as a document table — first row is the block name, each following row is one
record/cell as the JS reads it.

## Default / sample content

`spec.definition.template` holds the default content AEM inserts when an author adds
the block — a great basis for a **worked example** (show a filled-in version using
these values, trimmed if long).

## Catalog & change tracking (discovery)

`blocks.js catalog` lists all blocks and tags `[NEW]` / `[UPDATED]` relative to a
per-repo snapshot saved under `~/.eds-block-guide/`. "New/updated" means *since the
last catalog run* — so it's a running diff for whoever is browsing, not a git history.
The source files carry no dates, so untagged blocks fall back to reverse-listing order
("newest-file-first") — a heuristic, not a guarantee; don't present it as a precise
timeline.
