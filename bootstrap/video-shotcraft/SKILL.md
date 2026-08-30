---
name: video-shotcraft
description: Create cinematic product videos from shot recipe cards, a validated Remotion template, and code/audio assets (real page screenshots, 2.5D camera moves, beat-synced cuts, sound design). Use when the user asks to turn a frontend project or webpage into a product video, says "use video-shotcraft to make a video/promo", names the Ink Press template, or wants a single shot card's motion. 用镜头配方卡和 Remotion 模板制作电影感产品视频（真实页面截图、2.5D 运镜、节奏卡点、声音设计）。当用户要求把前端项目或网页做成产品视频、点名 video-shotcraft 或 Ink Press 模板，或要用镜头卡做单个动效镜头时使用。
---

# video-shotcraft (loader)

This is a loader. The real skill — 104 shot recipe cards, the motion-preview
gallery, the Ink Press template, reusable components, 5 BGM tracks and 149 SFX —
is ~49 MB across ~660 files, too much to ship as an uploaded skill. It lives in
a public git repository and you fetch it on first use.

## Step 1 — put the library on disk

Run this before anything else. It is idempotent: it clones once, then reuses the
copy for the rest of the session.

```bash
VSC="${HOME}/.cache/video-shotcraft"
[ -f "$VSC/SKILL.md" ] || git clone --depth 1 \
  https://github.com/Vincentwei1021/video-shotcraft.git "$VSC"
ls "$VSC"
```

Report the outcome honestly:

- **Clone succeeded** → go to step 2.
- **No network access** (the clone fails to resolve or connect) → stop and tell
  the user the library can't be fetched, and that the fix is either network
  access to `github.com` for this session or installing the full skill locally
  from `~/.claude/skills/`. Do not improvise the shot cards from memory: the
  value of this skill is the specific recipes and assets, and inventing
  substitutes produces a generic result while looking like the real thing.
- **`git` missing** → download the tarball instead:
  `curl -L https://github.com/Vincentwei1021/video-shotcraft/archive/refs/heads/main.tar.gz | tar xz`
  and point `$VSC` at the extracted directory.

## Step 2 — follow the real skill

Read `$VSC/SKILL.md` and follow it as the authoritative instructions for this
task. Everything it references resolves inside `$VSC`:

| Path | What it holds |
|---|---|
| `$VSC/references/pipeline.md` | the six-stage end-to-end workflow |
| `$VSC/references/shots/` | 104 shot recipe cards |
| `$VSC/references/sequences/` | full-video structures |
| `$VSC/references/aesthetic-rules.md` | visual QA criteria |
| `$VSC/references/music-beat-sync.md`, `sound-design.md` | audio methodology |
| `$VSC/demos/` | Remotion implementations per shot |
| `$VSC/gallery/` | motion previews |
| `$VSC/template/` | the complete Ink Press template |
| `$VSC/assets/lib/`, `scripts/`, `audio/` | components, capture scripts, BGM + SFX |

When `$VSC/SKILL.md` names a path like `references/pipeline.md`, it means
`$VSC/references/pipeline.md`. When it tells you to copy the template into a
working project, copy from `$VSC/template/`, and work in the user's project
directory rather than editing anything inside `$VSC`.

## Requirements

Rendering needs Node.js 22+ and Chrome or chrome-headless-shell. In a headless
or CI environment render with `--concurrency=1` and point Remotion at the
chrome-headless-shell binary. Check these before promising a rendered MP4; if
the environment can't render, you can still produce the composition code and say
plainly that the render step needs a machine that meets the requirements.

## Provenance

video-shotcraft is by [Vincentwei1021](https://github.com/Vincentwei1021/video-shotcraft),
Apache-2.0. Audio assets carry their own licenses, listed in
`$VSC/assets/audio/ATTRIBUTION.md`. This loader is the only part written here.
