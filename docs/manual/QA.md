# Manual review — edition 2, 10 October 2026

Edition 2 adds six pages for the records and statistics features. The manual now has 24 A4 pages, 25 embedded screenshots, three explanatory diagrams and 24 PDF bookmarks. The PDF language is `en-GB`.

## What changed

- Students: Follow your learning profile; Review your appointment history.
- Instructors: Check your approval history; Review your guidance history.
- Administrators: Read the statistics; Open student and teacher records.
- The cover, contents, the profile page and the common-problems table refer to the new pages. The contents table and the common-problems table are set slightly tighter to stay on one page each.

## Accuracy

The new text was checked against `lib/records.ts`, `components/records.tsx` and the instructor part of `app/api/app/route.ts` in the working tree based on commit `c8d876715071883fca5733048c2dfa528cb5baa1`. The checks covered which bookings count as appointments, attended and absent marks, the attendance rate and average mark, the six approval outcomes, how a tutorial is credited to a member of staff, which requests and sessions each instructor sees, page sizes, and who appears in the teacher list. Figures quoted in captions were read from the screenshots and compared with a count taken directly from the fixture database.

## Reproduction

The app was built with `npm run build:docker` and served from a fresh fixture of 68 fictional accounts and 23 bookings. All nine phases completed in order: open, student, first-login, instructor, admin, schedule, records, records-qa and close. Thirty-five screenshot assets are retained; ten are supplementary views not used in the PDF.

Of the 26 screenshots from edition 1, 24 were reproduced byte for byte by the new build. Two changed as intended: the availability calendar and the student overview each show three free Thursday slots where there were four, because the fixture now includes a request waiting on that day. In one intermediate run a third capture differed from the committed file by 24 anti-aliased pixels; the final run reproduced it exactly. The record-feedback capture previously depended on focus timing; the script now removes focus from the text box before capturing, which reproduces the committed image.

No live server or production database was used.

## Visual and document checks

The source compiled twice with XeLaTeX without overfull boxes, missing glyphs or unresolved references. `check-layout.py` reported 24 pages, no text outside the page bounds and no replacement characters. A first build ran to 28 pages with four short spill pages; the contents table, the learning-profile page, the appointment-history page and the common-problems table were tightened to remove them.

Every page was rendered at 150 dpi and reviewed in contact sheets. The seven pages with new or changed layout (8, 9, 12, 13, 22, 23 and 24) were also read at full size.

The edition 1 review follows unchanged.

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
