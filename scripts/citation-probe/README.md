# Citation probe

Asks a search-grounded LLM a fixed set of questions and saves each answer verbatim, so a
run today can be compared against a run six months from now.

This exists because the project's content strategy rests on a measurement rather than a
belief: a small framework earns its place in an LLM's answer from pages it wrote and
hosts itself, and whether that is working is checkable. Without a stored baseline the
check is not a check — it is a memory of what an answer used to say.

## Running it

```bash
node scripts/citation-probe/probe.mjs                    # every question
node scripts/citation-probe/probe.mjs --only drift-definition
node scripts/citation-probe/probe.mjs --out /tmp/run-2   # somewhere other than results/
```

macOS and Google Chrome. It launches a second Chrome on a debugging port with a throwaway
profile — your own browser, sessions and cookies are untouched, and no account
personalises the answer. Output lands in `results/<date>/<question-id>.txt`.

Perplexity answers signed-out visitors, which is why it is the surface here. ChatGPT and
Gemini also answer signed out but need interaction rather than a URL, so they are run by
hand when a round calls for more than one surface.

## What to read in the output

**Who is cited, not what is said.** The prose varies between runs and tells you little.
The source markers under each claim are the measurement. An answer that attributes every
line to one domain is an answer that domain owns.

**Whether anything is cited at all.** The most important reading so far came from an
answer with *no* inline citation anywhere: the definitional question about architecture
drift. No citation means no page owns the answer, which is what makes the slot winnable.
If our own domain starts appearing there, the content work landed.

**Whether a framework appears at all.** On problem-shaped questions the answer is usually
a list of services to assemble, with no slot for a framework. That is a property of the
question, not of the ranking — worth re-checking rather than assuming it holds forever.

## Comparing runs

Diff the same file across two result directories:

```bash
diff results/2026-08-05/drift-definition.txt results/2027-02-01/drift-definition.txt
```

The question set is the instrument. Editing an existing question silently breaks
comparability with every earlier run, so add new questions rather than rewriting old
ones, and mark a question retired instead of deleting it.

## Caveats worth keeping in mind

- **One run per question is a sample, not a measurement.** These answers vary. A change
  seen once is a hint; a change seen across two runs is a finding.
- **Grounding varies by question, not by surface.** The same signed-out surface answered
  one question purely from weights with no citations, then searched and cited on the
  next. "Does this surface search" is the wrong question to ask — check each answer.
- **Google search demand is a proxy for LLM retrieval, not a measurement of it.** The
  keyword volumes this project's content decisions rest on are Google's, and the
  relationship between the two is an assumption.

## Related records

Baselines and their readings are recorded in `results/`. The reasoning behind the
question set — which slots are held, by whom, and which are open — lives in the project's
work records rather than here.
