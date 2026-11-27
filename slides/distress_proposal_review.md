# Review: "Who Pays When Firms Keep Losing?" (10-minute class proposal)

Files: original `distress_proposal_original.tex` (unchanged copy) · revision `distress_proposal_revised.tex` / `.pdf`

## 1. Verdict

This is a strong proposal. The question is economic, not just a gap in the literature. The three-views tension is real. The linked owner data are a genuine selling point. The caveats are honest. As a 10-minute talk, though, the deck reads more like a compressed paper than a performance. Most titles are labels, not claims, and three slides carry two or three ideas each (question + sub-questions; diagram + data + design; two identities + estimand). The key object, θ_g(h), shows up as math before it is explained in words, and it never gets a picture. The talk also ends on "Caveats and next steps" rather than a bottom line. The revision keeps every claim and citation and the full visual identity. It reorders the talk into nine timed slides plus the title, ending on a bottom line. It adds one clearly labelled illustrative picture of the conjecture and moves the overflow to a linked appendix.

## 2. What works (kept)

- **The opening slide.** "Insurance against losses has to be paid for" is already an assertion, and the gap box ends on "Who, and when?", which is a good hook. It is kept almost verbatim.
- **The three-views slide.** It sets up a real tension: three literatures name three different payers. The conjecture ("all three hold, at different stages") resolves it with something the design can measure: timing.
- **The life-cycle TikZ diagram.** It is the clearest visual in the deck. It is kept, enlarged, and given its own slide.
- **Honest identification.** "Value-added falls are not random … accounting, not causal" and "Zombie status is a stage, never a treatment" are exactly Shapiro's "pause to discuss vulnerabilities".
- **The falsification line.** "If not, lead with financing + exit" was buried as item 3 of "First three months". It is now the "what would change my mind" box on the closing slide.
- **Visual system.** The SlateTeal/WarmAmber palette, the keybox/cardbox/accentbox styles, the safe-zone footline and the appendix with Back buttons all already follow the academic-beamer-deck skill.

## 3. Issues, ranked, with the fix applied

1. **No bottom line, and the talk ends on caveats.** Shapiro says to "have a bottom line"; Cunningham says the last slide is what people remember. The original's last main slide was "Caveats and next steps".
   *Fix:* a new closing slide, **"Bottom line: the answer is about timing"**. One boxed sentence restates the author's own "benefit of knowing" as the take-away. Below it are two small cards: **What would change my mind** (a flat workers' share means dropping the timing story and leading with financing + exit; this is the author's own line) and **Feedback I would like** (two asks drawn from the deck: credibility of the matched-firm accounting, and where export shocks belong). Buttons go to First three months and Contribution.
2. **The core object is math before words, with no picture.** Approach II put two identities and the θ_g(h) ratio on one slide. The only plain-language gloss was a small grey line at the bottom.
   *Fix:* this content is now two slides that follow Narrative → Picture → Technical:
   - **"Every lost dollar must show up on someone's ledger"**: first the "pie" sentence in words. Then each identity sits to the right of its plain-English question ("Who gets less income?" / "Who funds the shortfall?").
   - **"Conjecture: owners and debt pay first, workers later"**: θ_g(h) defined in words, then the formula, with a one-line gloss of β_k. Beside it is a **new TikZ picture** of the conjectured θ_g(h) paths: workers, workers with a thin buffer, and owners + debt. It is labelled in red "Illustrative conjecture, not data". The curves are hand-chosen functional forms, documented in the coordinate-map comment. No numbers appear on the y-axis.
3. **Overloaded slides (MB/MC imbalance).**
   - The research-question slide had a long box plus four numbered sub-questions. The sub-questions moved to the appendix behind a button, with a one-line muted strip left on the slide. The "benefit of knowing" stakes line moved here from the "who cares" slide, so the slide is now question + stakes.
   - Approach I mixed the diagram, data and design. It is now three slides: the life cycle on its own; **"CEEDD links each firm to its workers, books, and owners"** (three source cards); and the design, which is paired with its vulnerabilities (issue 5).
   - The "Why it matters, and who cares" slide (three audience cards) moved to the appendix. Its key sentence now sits on the question slide.
4. **Label titles instead of assertions.** "Research question", "Why it matters, and who cares", "Approach I/II", "Contribution", "Caveats and next steps", "Hypotheses" and "Data map" were all rewritten as claims (titles in §4). Read in sequence, the main-deck titles now tell the argument.
5. **Identification is honest but placed late.** The caveats came after the contribution table, at the very end. Shapiro says to pause on vulnerabilities right after the model.
   *Fix:* **"The design measures incidence, not causal effects"** puts "What I estimate" (stacked event studies, matched controls, ITT incumbents, exit design) next to "What the design can't do" (coral header). It comes right after the estimand. The wording of every caveat is unchanged.
6. **The contribution table is too detailed for 10 minutes.** Five papers × three columns is a referee's view, not a listener's. It also overflowed the frame (6.7 pt vbox, with the table running into the page number).
   *Fix:* the table moved to the appendix, word for word, set at `\footnotesize` so it fits. It is linked from the closing slide. The contribution is said aloud on the three-views slide ("timing … has not been measured directly").
7. **Compile and visual problems in the original.** It compiles with no errors, but the log shows **6 warnings plus 1 hyperref warning**:
   - Overfull \vbox on the research-question, three-views, Approach I, Approach II and Contribution slides (2.0, 8.4, 1.5, 12.0 and 6.7 pt)
   - Overfull \hbox on Approach II (3.7 pt)
   - hyperref "Token not allowed in a PDF string (`\translate`)" from `\appendix`

   Visually, the Contribution table collides with the "8 / 9" page number, and the cards use 9 pt body text, which is small for projection.

   *Fixes:* main-deck cards use `\small`, with the appendix and the dense three-views cards kept at `\footnotesize`. Overloaded slides are split. A `\pdfstringdefDisableCommands` line silences the `\translate` warning. **The final log has 0 errors, 0 Overfull/Underfull, and 0 warnings.**

   `\blacksquare` was **not** an error: beamer already loads `amssymb`. It is now loaded explicitly anyway.
8. **TikZ hygiene (Cunningham rules).**
   - Every node now has explicit `minimum width` / `minimum height`.
   - Each `tikzpicture` has a coordinate-map comment.
   - No `scale` is used, and all styles live in the preamble's `\tikzset`, with none inside frames.
   - Life-cycle notes are anchored 0.2 cm below each stage and set at `\footnotesize` for readability.
   - Plot end labels were placed from computed curve values at h = 5 (2.95 / 2.16 / 1.22 cm), giving gaps of at least 0.79 cm.
9. **Speaker notes.** Every main slide has a `\note{}` with a timing target and a sentence or two on what to say. Notes are not printed by default; use `\setbeameroption{show notes on second screen}` to see them.

## 4. Slide-by-slide mapping and timing plan

| New # | New assertion title | Came from | Time | Cumulative |
|---|---|---|---|---|
| 1 | Who Pays When Firms Keep Losing? (title) | 1 | 0:15 | 0:15 |
| 2 | Insurance against losses has to be paid for | 2 (unchanged) | 1:00 | 1:15 |
| 3 | I ask who absorbs a firm's persistent losses, and when | 3 (box) + 4 ("benefit of knowing") | 1:00 | 2:15 |
| 4 | Theory disagrees: owners, workers, or lenders pay | 5 (conjecture shortened; full version on slide 8) | 1:00 | 3:15 |
| 5 | Losses travel through a distress life cycle to exit | 6 (diagram only) | 0:45 | 4:00 |
| 6 | CEEDD links each firm to its workers, books, and owners | 6 (Data column) | 0:45 | 4:45 |
| 7 | Every lost dollar must show up on someone's ledger | 7 (identities, words first) | 1:15 | 6:00 |
| 8 | Conjecture: owners and debt pay first, workers later | 7 (estimand) + 5 (conjecture) + **new picture** | 1:30 | 7:30 |
| 9 | The design measures incidence, not causal effects | 6 (Design column) + 9 (left card) | 1:15 | 8:45 |
| 10 | Bottom line: the answer is about timing | 4 (benefit line) + 9 (item 3) + **new** feedback ask | 1:15 | 10:00 |
| A | Appendix (divider) | 10 | | |
| A1 | Four sub-questions organize the analysis | 3 (enumerated list) | | |
| A2 | The answer matters to labor, finance, and policy | 4 (three cards) | | |
| A3 | Five testable predictions follow from the conjecture | 11 (Hypotheses) | | |
| A4 | This proposal adds financing and dynamics to exit | 8 (Contribution table) | | |
| A5 | Next: check identities, clean exits, test timing | 9 (right card) + export-shock line | | |
| A6 | Every claimant maps to observed CEEDD variables | 12 (Data map) | | |

Buttons:
- 3 → A1, A2
- 6 → A6
- 8 → A3
- 10 → A5, A4

Each appendix slide has a Back button to its parent.

## 5. Citations to verify before presenting

None of these could be checked here. Their claimed content was **not** changed.

- Wang & Young (2025): workers bear a larger share of losses via job loss; U.S. S-corps; worker vs owner incidence
- Azzalini (2026): negative pass-through rises in recessions
- Malgieri & Citino (2025): constrained firms pass through more
- Graham et al. (2023): worker losses at bankruptcy
- Acharya et al. (NY Fed): zombie credit prevents layoffs (aggregate). The year and outlet are missing, so add them.
- Bertheau et al. (job-loss view): no year given
- Card et al. (2018); Kline et al. (2019): workers capture a small share of firm gains
- Guiso, Pistaferri & Schivardi (2005); Balke & Lamadon (2022): firms partly insure workers
- Azariadis; Baily (insurance view): no years given
- Caballero, Hoshi & Kashyap (zombie view): no year given

## 6. Open questions for the author

1. **Export-shock validation.** The original calls it optional. It is in the appendix and the "feedback" card. If it is the only quasi-exogenous variation you have, it may deserve a line on the design slide, because it answers the obvious objection to slide 9.
2. **β_k gloss.** The slide 8 line "β_k: event-time-k change vs. matched firms" is my reading of the design. Please confirm this is what β^{(g)}_k means.
3. **Shares sum to one.** Should the plot show that the θ_g(h) shares sum to one (including government via CCA)? The illustrative curves deliberately do not imply this.
4. **Feedback asks on slide 10.** These are placeholders built from your own caveats. Replace them with what you actually want from the class.
5. **Who cares slide.** If the class is mostly labor economists, consider bringing it back as a single spoken line rather than a slide.
6. **Life-cycle stage definitions.** "Repeated losses" and "zombie stage" are not defined operationally in the main deck (coverage < 1 appears only as a note). Expect a question on this, and be ready to point to A6.
