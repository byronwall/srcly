"""Shared discovery contract for the visual editor, HTTP agents and CLI agents."""


def catalog() -> dict:
    operations = [
        ("move-file", 'move-file <path|$handle> -> "destination.ts"', "Updates file location, imports, re-exports and every handle to that file."),
        ("move-symbol", 'move-symbol $symbol -> "destination.ts" [reexport]', "Moves a top-level function, component, type or literal constant. Local dependencies produce suggested DSL steps."),
        ("rename", 'rename $symbol -> newName', "Compiler-resolved symbol or interface-member rename, including typed JSX consumers."),
        ("extract-function", 'extract-function $selection -> functionName', "Extracts a unique exact snippet through the TypeScript language service; the handle becomes the new function."),
        ("extract-component", 'extract-component $selection -> ComponentName', "Extracts display-only intrinsic JSX into a nested component that retains lexical reads. Effectful markup is refused."),
        ("add-member", 'add-member $type "title: string"', "Adds a property to an interface or object type. Expected downstream type errors remain executable and are listed for repair."),
        ("update-member", 'update-member $type "title?: string"', "Replaces one existing property declaration. Syntax errors block; downstream type errors are explicit repair work."),
        ("remove-member", 'remove-member $type "title"', "Removes one existing property declaration and reports affected consumers."),
        ("add-type", 'add-type "src/types.ts" "export interface Props { title: string }"', "Adds exactly one interface or type alias, including to a new file."),
        ("update-type", 'update-type $type "export type Props = { title: string }"', "Replaces one type declaration while retaining its name."),
        ("remove-type", 'remove-type $type', "Removes a type declaration and reports downstream errors."),
        ("solid-context", 'solid-context "src/state.ts" -> "src/StateContext.tsx" provider StateProvider hook useState within $app', "Migrates a whole Solid state module into a provider-owned factory and rewrites named consumers to a hook. Requires a named function root covering all known component/hook consumers."),
        ("state-machine", 'state-machine $reducer -> transitions', "Converts a pure if/else reducer over finite string state/event unions into a total typed table; every pair is evaluated without executing project code. Effects and unknown guards block."),
    ]
    return {"dslVersion": 1, "workflow": ["catalog", "project", "parse", "preview", "codemod", "execute"],
            "handles": ['let f = file "src/state.ts"', 'let s = symbol "src/Card.tsx" "Props.title"', 'let x = selection "src/math.ts" "a + b"'],
            "operations": [{"name": name, "syntax": syntax, "description": description} for name, syntax, description in operations],
            "validation": "Clean source commit; one leaf tsconfig. Syntax errors always block. Type edits explicitly permit compiler diagnostics; other operations cannot introduce new errors.",
            "example": 'refactor 1\nproject "tsconfig.json"\nlet state = file "src/state.ts"\nmove-file $state -> "src/model/state.ts"\n',
            "execution": "Preview first; apply the registered codemod in its isolated worktree. Source changes require a fresh preview."}
