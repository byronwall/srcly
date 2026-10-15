"""
Compare two git refs: snapshot each side, scan it, and diff the results.

- ``git_refs``  resolves refs and lists changed files (git CLI only).
- ``snapshots`` turns a ref into a scanned side, caching commits by SHA.
- ``diff``      is pure: two trees + two graphs + a change list → payload.
- ``service``   wires the three together for the CLI and the API.
"""
