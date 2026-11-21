# csv-reader-speed-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/fourxxxcoder/csv-reader-speed-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/fourxxxcoder/csv-reader-speed-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: it returns exactly csv-reader's
answer (`{columns, rows, errors}`) for every input, in less CPU time. Same broken-row
policy as the reference — BOM, CRLF/CR line breaks, doubled quotes, unterminated
quotes, quote junk, stray CRs, short and long rows — scanned with native primitives
(`indexOf`, `slice`, `split`, one regex scan) instead of one character at a time: a
clean line is split in one call, a run of unquoted fields up to the next quoted field
is split in one call, and a quoted field is found by `indexOf` for its closing quote.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json` (a JSON array of
`{id, input}`), answers each one alone with `run()` from `solve.js`, and writes
`$MAKEFUN_OUTPUT_DIR/answers.json`. Node 22 or later, no dependencies, no
WebAssembly, no native addon.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ck3acpkm&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
