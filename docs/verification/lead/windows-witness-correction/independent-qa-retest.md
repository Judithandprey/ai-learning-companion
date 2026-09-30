# Independent malformed-witness retest integration

QA7e6710edda7ebf6dfe8de713a242054f52b82bb1 arrived as handoff_4da0597940154679c974ce7aac2eae42 and is integrated as39cf5c5. Exact tested source b19930b retains the Backend correction f7ef3ac. Lead reviewed the134-line added test and saved sensitivity/future-clock results, keeping the original crash spy and malformed-row assertions intact.

On integrated main39cf5c5, the two affected QA files execute **82 passed,1 strict xfailed in15.21s**; [actual output](independent-qa-integrated-main.txt). The sole expected failure is explicitly documented arbitrary serialized-key semantic corruption. It is not counted as a pass. Deliberate erasure and never-Windows controls remain allowed. These are synthetic retained-damage MemoryStore/ASGI tests with no listener, DB, provider or native display.

The tested malformed-row failure is independently closed; there is no general corruption-proof claim. No mutation campaign or unrelated suite was repeated. The earlier native Windows QA report is separately scoped to55478f0 and cannot cover later feature code.
