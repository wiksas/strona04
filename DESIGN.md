# DESIGN.md: Podsieci

Direction was not supplied by the owner. This file was written by the assistant from the brief (a study and self-test tool for IPv4 subnetting exercises, Polish, one student user). Owner can replace any line below.

Design Read: study and test tool for a student preparing for a networking exam, in a worksheet-like, matte, two-theme style. Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Identity motif: the prefix boundary

Every subnetting task is the same question: where does the network part end and the host part begin. The motif is a strip of bit cells with a visible boundary:
- network bits: solid filled cells
- host bits: hollow cells
- the boundary between them: one amber edge

It appears in the brand mark, in worked solutions (address, mask, network rows), in the prefix slider on the theory page, and in the calculator. Nowhere else. Reason: it is the concept being taught, so it carries information instead of decoration.

## Palette

| Role | Light | Dark | Reason |
|---|---|---|---|
| Paper (base) | `#F6F3EB` | `#14181B` | warm paper reads as a worksheet, low glare for long sessions |
| Surface | `#FFFFFF` | `#1D2327` | inputs and solution panels sit one step off the paper |
| Ink | `#1C2125` | `#ECE8DE` | body text, network bits |
| Muted | `#565B5F` | `#A5ABAD` | secondary text, 6:1 or better on paper |
| Teal (core) | `#0B6B63` | `#5FCABB` | brand, primary action, "correct" feedback |
| Amber (accent) | `#B26B00` | `#E9B44C` | the prefix boundary only, never on text |
| Error | `#A3261D` | `#FF9B91` | wrong-answer feedback only |

Core: ink + teal, accent: amber, status: error. Contrast pairs verified against WCAG AA (see verification notes in the commit).

Theme: both ship. A student studies day and night and no fixed theme is justified, so the default follows `prefers-color-scheme` and a header toggle overrides it, stored in `localStorage`.

## Typography

- Atkinson Hyperlegible Next for headings and body, Atkinson Hyperlegible Mono for addresses, binary and masks.
- Reason: the family was designed to separate look-alike glyphs. In this tool the confusables are `0/O`, `1/l/I`, and the mono cut has a slashed zero. A misread bit is a wrong answer.
- Mono is used only for values the student types or reads digit by digit, never for headings or labels.
- Self-hosted woff2 (latin and latin-ext for Polish letters), no third-party request. SIL OFL 1.1.

## Shape, depth, motion

- Radius scale: 3px (inputs, bit cells), 6px (panels, dialog). Nothing is pill-shaped.
- Shadow: only the modal dialog (it sits above the page). Everything else is flat with a 1px border.
- No gradient, glass, glow, grid background, icons, emoji, or arrows on buttons.
- Motion: hover and focus colour changes only (MOTION 1). No loops, no reveal animations.

## Structure

The product has four parts, each a real route: Ćwiczenia (per-type practice with live accuracy), Test (two sheets, scored at the end), Teoria (reference with an interactive prefix slider), Kalkulator (checks a worked answer). No landing page: the first screen is the practice list because that is the job of the tool.

## Content rules

- Every number shown is computed from stored answers or from the arithmetic being taught. No sample statistics.
- The tasks from the owner's two class sheets (nine and four) are shipped verbatim as the fixed test sets. Random tasks use the same task types.
- Product name "Podsieci" is a text placeholder, not a final brand.
