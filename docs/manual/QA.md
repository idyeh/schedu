# Manual review — 4 October 2026

The released manual contains 18 A4 pages, 18 embedded screenshots, three explanatory diagrams and 18 PDF bookmarks. The contents page has working internal destinations for every topic; cross-references also resolve. The PDF language is `en-GB`.

## Scope and accuracy

The text was checked against the local application at commit `c4a2df88746b5ee15fad1115bccb7b3677cb11e4`, especially the booking API, permission rules and administration components. Coverage includes students, instructors and ordinary administrators. The system administrator is mentioned only to explain responsibilities and escalation; system maintenance procedures are excluded.

The review checked optional phone numbers, current-year cohort rules, draft behaviour, automatic approval, active-booking limits, student cancellation pauses, configurable instructor cancellation, evaluation timing, ordinary-administrator restrictions, roster import limits, account pagination and batch actions, semester recurrence, classroom selection and retention of actively booked sessions during batch removal. Button names were checked against the interface.

## Reproduction

The production app build completed with `npm run build:docker`. The isolated seed created 68 fictional accounts and 11 initial bookings; its foreign-key check passed. The documented demo launcher was then used with a fresh fixture. All seven screenshot phases completed sequentially: open, student, first-login, instructor, admin, schedule and close. The captures exercise a real student submission and instructor evaluation, alongside import and removal previews. Twenty-six screenshot assets are retained, including supplementary views not used in the PDF.

No live server or production database was used. The dedicated database, fixed clock and loopback address keep the examples separate from ordinary use. The temporary server and browser were stopped after capture.

## Visual and document checks

The final source compiled twice with XeLaTeX without compiler warnings, overfull or underfull boxes, missing glyphs or unresolved references. Every page was rendered at 150 dpi and reviewed in contact sheets; the cover, booking flow, account table, full calendar, teaching-window form and session-removal layouts were also inspected at a larger scale. The review corrected initial spill pages, logo orientation, screenshot crop positions and diagram routing.

The final page count is 18, with no blank spill pages. Text extraction found no replacement characters or unresolved-reference markers, and no text lies outside page boundaries. Tables, captions, headers and footers are contained within the layout. Screenshot excerpts end at complete rows. The calendar is deliberately a full overview; its high-resolution image remains available for zooming in the PDF.

The revised cover omits the examples box and uses “October 2026” in the edition line. Visible language labels have been removed from the cover and running footers. The rebuilt PDF was checked by text extraction and a fresh visual review of the cover and all page layouts; it remains 18 pages.

The manual uses SchedU's light-theme colours, a vector reproduction of its logo, consistent sans-serif type, green functional diagrams and restrained policy callouts. The prose uses British English. The screenshots retain the app's own wording and labels.

Automatic results and rendered pages are generated under `tmp/pdfs/schedu-manual/review/` and are excluded from the source archive. Automatic checks supplement visual review; they do not certify accessibility or replace a printer proof.

## Existing application observation

Chromium reported an existing console error for the institutional-ID field's HTML `pattern` expression. It did not prevent the tested sign-ins or screenshot workflows. This documentation task does not change that application code. Browser logs are retained locally under `output/playwright/manual/` for follow-up.
