# Testing rules

- Business logic (domain code) requires unit tests; don't merge new logic without them.
- Prefer real behavior over mocks for internal collaborators; mock only true external boundaries (network, AWS, LLM providers).
- A failing test blocks the PR — do not weaken assertions to make CI pass.

(This file is a stub — expand it once a test runner and test suite exist, from Iteration 1 onward.)
