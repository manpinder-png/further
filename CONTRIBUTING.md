# Contributing to Further

1. Read the product brief and architecture.
2. Choose an issue from the project board. Agree one accountable owner; pair as needed.
3. Create a branch, for example feature/live-presence or fix/match-validation.
4. Keep API contracts stable or document the agreed change.
5. Run the tests and manually exercise the changed flow.
6. Open a focused pull request with a screenshot for UI changes, validation, and remaining limitations.
7. Ask a teammate to review, then merge after checks pass.

Local commands:

    python3 -m further
    python3 -m unittest discover -s tests -v

The project currently uses only standard-library Python and browser JavaScript. Discuss framework or infrastructure changes before making several teammates install a new stack.

Keep keys and private onboarding material outside the public repository. The parent ChatGPT workspace may contain private notes; publish only this repository's intended source files.

Workstream ownership has not been assigned. Avoid claiming someone has accepted a task or completed a feature without verification.
