# symbol-graph

A small SolidStart-shaped app for tuning Data flow's symbol view. One route
(`/notes/[id]`) reads a URL param, loads a note through a `"use server"`
function from a database client, reshapes it in plain TS, and renders it
through a `Switch`/`Match`, a component with a store, and a save handler that
writes back. Open it with `?repo=<abs path to this folder>&view=graph&flow=/notes/[id]`.
