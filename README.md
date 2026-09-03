# Deckhand

**A slide editor agents can actually operate.**

Deckhand is an agent-native presentation editor built for the OpenAI WebMCP Challenge. Humans edit a visual 16:9 canvas directly; browser agents inspect and mutate the exact same client-side scene graph through typed WebMCP tools.

Traditional AI slide generators produce a deck, then lose context as soon as a person starts refining it. Deckhand keeps the collaboration alive. The open slide, selected elements, design grammar, and recent direct edits are shared state. A person can drag a title, shorten copy, or select three cards; an agent can immediately reason over those choices and continue the work through semantic operations instead of brittle coordinates.

## What people and agents do together

- People create, select, multi-select, drag, resize, edit text, restyle, reorder, present, undo, and export.
- Agents inspect the deck or the smallest relevant context, focus a human-visible selection, create and reorder slides, add/update/arrange/delete elements, apply theme tokens, and undo.
- Bring an existing `.pptx` or `.potx`. Deckhand extracts its theme, fonts, palette, masters, and layouts locally, then turns them into reusable, editable starting points for both the person and the agent.
- A person’s recent geometry and style changes can be propagated to matching semantic roles on other slides. Direct manipulation becomes context: **show, don’t prompt**.
- Start a whole deck from a blank canvas, startup pitch, project update, or the original WebMCP showcase. Narrative templates generate editable English or Japanese content.
- Switch the application UI between English and Japanese without changing an existing deck’s content. The preference is saved in the browser.
- Every agent operation changes the visible page, appears in the live activity rail, persists locally, and remains undoable.

## Why WebMCP

Slide editing is a large visual state space: many objects × geometry × style × relationships × selection × history. Screenshot-and-click automation must repeatedly infer both the target and the intent. A backend MCP server would duplicate browser-local state and detach actions from the canvas the person is judging.

WebMCP is the natural fit because the page can expose domain semantics (`slide`, `element`, `selection`, `design grammar`, `recent human edit`) while keeping the human interface primary. Tools run in the open tab, reuse the current session and local state, update the UI visibly, and disappear with the page.

## Tool surface

| Tool | Purpose |
| --- | --- |
| `inspect_project` | Read a compact project summary, the current slide, selection, design system, or recent human edits |
| `plan_deck` | Turn an audience, objective, and semantic slide briefs into a validated deck plan without mutating the canvas |
| `compose_deck` | Materialize a whole planned deck atomically using either the built-in design system or imported PowerPoint sources |
| `revise_slide` | Recompose one slide from its intended purpose and takeaway while preserving its stable slide ID |
| `edit_slide` | Precisely refine inspected elements when semantic recomposition is not the right tool |
| `manage_deck` | Focus, rename, duplicate, reorder, or delete slides through one constrained management surface |
| `validate_deck` | Run structural checks plus measurements from the actual rendered canvas |
| `undo_last_change` | Recover the latest atomic mutation |
| `propagate_human_edits` | Contextual tool that appears only after a direct human edit |

Read-only tools declare `readOnlyHint`; deck content is marked with `untrustedContentHint`. Tool descriptions and outputs stay within the WebMCP guidance budgets. Inputs are validated in application code and errors tell the agent how to recover.

## Use your own template

Choose **New deck → Open a PowerPoint**, then drop a `.pptx` or `.potx` file. Two workflows are available:

- **Open this PowerPoint as-is** is the recommended, normal import path. It converts every source slide into an editable Deckhand slide and also keeps the imported layouts for future slides.
- **Create a new deck with this design** does not import the source slides. It creates a small starter deck only from the reusable layouts you select.

Imported layouts stay available in the slide rail and are exposed through `inspect_project(scope="design_system")`. An agent can reference a `source_slide_id` or `template_layout_id` in `plan_deck`, then materialize the complete plan with `compose_deck`, instead of guessing the brand system from a screenshot. Without an imported template, the same pipeline selects from eleven purpose-built layouts and four art directions.

Google Slides templates work through **File → Download → Microsoft PowerPoint (.pptx)**. Direct Google OAuth/API import is intentionally deferred; the PPTX path is faster to authorize, simpler to demo, and preserves a portable source file. Parsing happens entirely in the browser. External links are ignored, and complex charts or SmartArt are represented by editable semantic placeholders with clear fidelity warnings.

## Run locally

Requirements: Node.js 22.13+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` in the ChatGPT desktop in-app browser, which supports WebMCP, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

Suggested test prompt:

> Inspect this project. Plan and compose a five-slide executive update without a template, validate the rendered result, then improve the weakest slide. Keep every change reversible.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The deterministic deck-operation tests cover validation, batching, arrangement, narrative order, template structure, and localization.

## Architecture

- `app/` — Vinext route, metadata, and shared visual tokens
- `components/deckhand/` — editor shell, canvas renderer, slide rail, inspector, and dialogs
- `hooks/use-deck-editor.ts` — local-first deck state, history, activity, and human-edit deltas
- `hooks/use-webmcp-tools.ts` — lifecycle-safe WebMCP registration and execution adapters
- `lib/deck/` — serializable domain model, local PPTX/POTX import, localized templates, demo deck, and pure operations
- `lib/i18n.ts` — type-safe English and Japanese application copy

The build produces Cloudflare Worker-compatible ESM output through the Cloudflare Vite plugin.

## License

MIT — see [`LICENSE`](LICENSE).
