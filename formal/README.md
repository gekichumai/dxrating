# Formal models

Each folder holds a TLA+ model of code where events can happen in a bad order: concurrent writers, retries, tabs and network messages. The model checker (TLC) tries every order within the model's bounds.

- `formal/check-all.sh` checks every model. The `Formal models` workflow runs it on every PR.
- `formal/tlc.sh formal/<model>/<Model>.tla` checks one. It downloads a pinned TLC on first use and needs Java 11 or later.
- Each model has a project skill in `.claude/skills/` that says which code it covers, the commit it was last synced at, and how to read a failure.
- Each past bug a model reproduces is a guard replay (`scripts/guard-replays/replays/`, `needs: ["tlc"]`). The replay switches the model back to the old behavior and TLC must report the broken invariant.
