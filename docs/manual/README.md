# SchedU user manual

The manual is written in British English for students, instructors and ordinary administrators. It covers everyday use, not system administration. The illustrated PDF is `output/pdf/schedu-user-manual.pdf`; the editable source is `docs/manual/schedu-user-manual.tex`.

The green (`#176d5b`), ink (`#202e35`) and pale green (`#e9f3ee`) come from `app/globals.css`. The cover reproduces the existing SchedU SVG logo as vector paths. Screenshots are genuine browser captures, with crops at complete component or row boundaries. No interface text or screenshot pixels are substituted. The role, booking-state and appointment-timing diagrams are native TikZ vectors.

## Rebuild the PDF

The committed screenshots are sufficient to compile the manual without running the app. Install Python 3 and XeLaTeX (TeX Live or MacTeX), including the TeX Gyre fonts, TikZ, tcolorbox, fontspec, babel, microtype, booktabs, tabularx and hyperref. No additional CJK font is needed: Chinese labels are contained in the screenshots.

From the repository root:

```sh
python3 docs/manual/scripts/build.py
```

`XELATEX` can name an alternative compiler path. The script compiles twice for links and page references, refuses known overflow/missing-glyph/reference warnings, and writes the PDF to `output/pdf/`. Intermediate files stay in `tmp/pdfs/schedu-manual/`.

For layout checks, install Poppler (`pdftoppm`) and the Python packages `Pillow`, `pypdf` and `pdfplumber`, then run:

```sh
python3 docs/manual/scripts/check-layout.py
```

This renders every page at 150 dpi, creates contact sheets, extracts text and checks page count, references and text bounds. Inspect all rendered pages before release; those automatic checks cannot establish whether a screenshot is legible. The current edition has 24 pages. Use `--expected-pages N` if an intentional revision changes that count.

## Recreate the demonstration and screenshots

Use the SchedU repository with its normal locked dependencies installed. The fixture script uses Node's built-in SQLite and TypeScript support; Node 22.18 or later is recommended. Earlier supported Node 22 releases may require `--experimental-strip-types` when running `seed.mts`.

The sample database is always `tmp/pdfs/schedu-manual/demo.sqlite`. It is separate from the app's normal database. It contains 68 fictional accounts, 23 starting bookings, a semester from 7 September 2026 to 15 January 2027, recurring windows, a one-off slot, an unstaffed occurrence, a date off and examples of each booking state. The records pages draw on a run of Thursday tutorials recorded by one instructor, a request approved by that instructor, a request still waiting, and a tutorial approved and recorded by the administrator. Fixture generation checks foreign keys. It does not import into or reset a live installation.

```sh
node docs/manual/scripts/seed.mts
npm run build:docker
python3 docs/manual/scripts/serve-demo.py
```

Keep the last process running in its terminal. It serves the demo only at `http://127.0.0.1:3004`. The preloaded clock fixes server time at 4 October 2026, 18:35 in China. The browser uses the same date. The clock refuses to run unless the database path identifies the manual fixture.

To start again, stop the demo server, then use `node docs/manual/scripts/seed.mts --replace-fixture`. That switch replaces only the dedicated manual database. Run all screenshot phases from the beginning after reseeding: the student phase creates a booking, first-login keeps a fictional initial password, and the instructor phase completes a tutorial. Administrator captures preview imports and removals without confirming them. The records phase only reads. The records-qa phase ends by approving the waiting request, so reseed before running earlier phases again.

Capture uses Playwright CLI, tested with `@playwright/cli` 0.1.22 and installed Google Chrome in headless mode. It does not add a browser test dependency to the app. The default CLI wrapper is `~/.codex/skills/playwright/scripts/playwright_cli.sh`. On another machine, install the same CLI version separately and set `PLAYWRIGHT_CLI` to its executable. The browser configuration is `scripts/playwright-cli.json`; change its Chrome channel only if your installed browser requires it.

In a second terminal, run these phases in order, waiting for each to finish:

```sh
python3 docs/manual/scripts/capture.py open
python3 docs/manual/scripts/capture.py student
python3 docs/manual/scripts/capture.py first-login
python3 docs/manual/scripts/capture.py instructor
python3 docs/manual/scripts/capture.py admin
python3 docs/manual/scripts/capture.py schedule
python3 docs/manual/scripts/capture.py records
python3 docs/manual/scripts/capture.py records-qa
python3 docs/manual/scripts/capture.py close
python3 docs/manual/scripts/build.py
python3 docs/manual/scripts/check-layout.py
```

The script accepts only the loopback demonstration address. Screenshots are saved in `docs/manual/assets/`; browser logs and snapshots are kept separately under `output/playwright/manual/` and ignored by Git. `records-qa` is optional for the PDF. It checks the records and statistics pages rather than illustrating them: filters, pagination, search, details, the chart tooltip, empty states, Simplified Chinese, the dark theme and a phone-width layout, then one approval followed through each role's view. It stops at the first failed check and saves its screenshots in `output/screenshots/records-statistics/`. A script failure stops that phase and names its log. Rebuild from a fresh fixture if a failed phase has already changed sample data.

### Fictional accounts

All fixture accounts use `SchedU-demo-2026!`. This password belongs only to the disposable sample database. The manual and its screenshots do not publish real credentials.

| ID | Role and example |
| --- | --- |
| `20260001` | Student Mei Chen: complete profile, draft and past feedback |
| `20260002` | Student Hao Wang: first sign-in prompt |
| `20260005` | Student Qi Sun: learning profile and appointment history, with a request awaiting approval |
| `20260020` | Student with no appointments: empty records |
| `20250003` | Student Ning Liu: earlier cohort, no teaching class, booking pause |
| `STAFF1001` | Instructor Wei Lin: current and future tutorials |
| `STAFF1002` | Instructor Emma Zhou: shared teaching windows; approval and guidance history |
| `STAFF0001` | Ordinary administrator Alex Morgan: Statistics |
| `OWNER0001` | Required fixture system owner; never used to capture maintenance pages |

`assets/roster-example.csv` and `assets/timetable-example.csv` are valid examples for the fixture. They are previewed by the capture script; no real institution roster is used. The seed also creates a further set of fictional students to demonstrate pagination and account filters.

## Release checks

Check policy statements against `README.md`, `lib/model.ts`, `lib/permissions.ts`, `lib/records.ts`, `app/api/app/route.ts`, `app/page.tsx`, `components/records.tsx` and the administration components when updating this manual. In particular, ordinary administrators cannot change global configuration or perform full-system export, restore or reset. Instructor cancellation depends on the system setting; student cancellation has a separate booking-pause rule.

All 24 PDF pages must be reviewed visually after substantive edits. Check the cover logo, diagrams, table wrapping, screenshot text, captions, internal links and page endings. See `QA.md` for the review of this edition. Application source and live deployments are not changed by this documentation package.
