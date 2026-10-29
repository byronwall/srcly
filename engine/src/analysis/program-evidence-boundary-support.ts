import * as TypeScript from "typescript";
import { boundaryRole, type LibraryModelRow } from "./library-models";
import {
  browserCall,
  browserMember,
  calleeName,
  externalServiceCallKind,
  importedCallee,
  isHttpResponse,
  proof,
  staticMethod,
  staticTarget,
} from "./program-evidence-support";
import type {
  EvidenceConfidence,
  ProgramElementKind,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProof,
  ProgramProofKind,
  ProgramRelationKind,
} from "./program-evidence";
import type { HttpBridgeFetch, HttpBridgeResponse } from "./http-bridge-evidence";

type Attributes = Record<string, string | number | boolean | null>;

export type ProgramEvidenceBoundaryContext = {
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  node: TypeScript.CallExpression;
  callId: string;
  ownerId: string | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  moduleFor: (node: TypeScript.Node) => string | null;
  /** The library model row the callee resolves to, if any. */
  model: LibraryModelRow | null;
  isExternalCall: (node: TypeScript.CallExpression) => boolean;
  specialInput: (
    node: TypeScript.Node,
    kind: ProgramElementKind,
    ownerId: string | null,
    attributes: Attributes,
    proofKind: ProgramProofKind,
    detail: string,
    operationKind?: ProgramOperationKind | null,
  ) => string;
  effect: (
    node: TypeScript.CallExpression,
    callId: string,
    ownerId: string | null,
    effectKind: string,
    detail: string,
    /** `host-api` for an effect a host API is known to have; `external-call` (assumed) when only the call's module is known. */
    proofKind?: ProgramProofKind,
  ) => void;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proof: ProgramProof,
    confidence: EvidenceConfidence,
  ) => void;
  expression: (node: TypeScript.Expression, ownerId: string | null) => string;
  gap: (
    from: string,
    direction: "forward" | "backward",
    reason: "external-code",
    detail: string,
    node: TypeScript.Node,
  ) => void;
  addHttpFetch: (fetch: HttpBridgeFetch) => void;
  addHttpResponse: (response: HttpBridgeResponse) => void;
};

/** Router hooks that read the page's URL: route parameters, the query string, the location. */
const URL_READS: Record<string, readonly string[]> = {
  "@solidjs/router": ["useParams", "useSearchParams", "useLocation"],
  "react-router": ["useParams", "useSearchParams", "useLocation"],
  "react-router-dom": ["useParams", "useSearchParams", "useLocation"],
  "next/navigation": ["useParams", "useSearchParams", "usePathname"],
  "@tanstack/react-router": ["useParams", "useSearch", "useLocation"],
};

/** Collect host, external, resource, and HTTP boundary facts for one call. */
export function processProgramCallBoundary(
  context: ProgramEvidenceBoundaryContext,
): void {
  const { ts, node, callId, ownerId } = context;
  const name = calleeName(ts, node.expression);
  // A library export is its module and its own name, however the import names it (`fs.readFile`, `readFile as read`).
  const imported = importedCallee(ts, context.checker, node.expression);
  const module = context.moduleFor(node.expression) ?? imported?.module ?? null;
  const exported = imported?.name ?? name;
  // A library model row says which boundary the call is; the role is the element kind it marks.
  const role = boundaryRole(context.model);
  const urlRead = imported && URL_READS[imported.module]?.includes(imported.name);
  const browser = browserCall(browserMember(ts, context.checker, node.expression));
  if (browser) {
    // Browser storage, history and navigation: outside the program, named by what they are.
    const text = `${node.expression.getText(node.getSourceFile())}(…)`;
    const id = context.specialInput(
      node,
      browser === "read" ? "external-read" : "external-effect",
      ownerId,
      { operation: exported, name: browser === "read" ? `browser read: ${text}` : `browser write: ${text}` },
      "host-api",
      browser === "read" ? "The browser hands the program this stored value." : "The browser keeps this value outside the program.",
    );
    if (browser === "read") context.addRelation(id, callId, "carrier", [context.location(node)], proof("carrier-boundary", "The browser call yields what it reads.", [context.location(node)]), "proven");
    else context.addRelation(callId, id, "effect-input", [context.location(node)], proof("host-api", "The browser call keeps what it is given.", [context.location(node)]), "proven");
  } else if (urlRead) {
    // What a router reads from the URL is where a page's input starts.
    const inputId = context.specialInput(
      node,
      "external-read",
      ownerId,
      { operation: exported, name: `URL: ${node.getText(node.getSourceFile()).slice(0, 80)}` },
      "host-api",
      "The router reads this value from the page's URL.",
    );
    context.addRelation(
      inputId,
      callId,
      "carrier",
      [context.location(node)],
      proof("carrier-boundary", "The router call yields what it reads from the URL.", [context.location(node)]),
      "proven",
    );
  } else if (role === "fetch-input") {
    const inputId = context.specialInput(
      node,
      "fetch-input",
      ownerId,
      { method: staticMethod(node), target: staticTarget(node) },
      "host-api",
      "The call is a source-backed network input occurrence.",
    );
    context.addRelation(
      callId,
      inputId,
      "input-call",
      [context.location(node)],
      proof(
        "host-api",
        "The fetch or HTTP client call is the exact input boundary.",
        [context.location(node)],
      ),
      "proven",
    );
    context.addRelation(
      inputId,
      callId,
      "carrier",
      [context.location(node)],
      proof(
        "carrier-boundary",
        "The compiler-resolved network call has one exact forward carrier endpoint.",
        [context.location(node)],
      ),
      "proven",
    );
    // The HTTP bridge pairs a global fetch with the route it requests.
    if (context.model?.module === "global") context.addHttpFetch({ node, elementId: inputId, ownerId });
    context.gap(
      inputId,
      "forward",
      "external-code",
      "Static proof stops at the external response body; any response-to-resource handoff is runtime-only and remains unproven.",
      node,
    );
    context.effect(node, callId, ownerId, "network-request", "The network request leaves the analyzed source tree.");
  } else if (role === "file-input") {
    const inputId = context.specialInput(
      node,
      "file-input",
      ownerId,
      { operation: name, module },
      "host-api",
      "The compiler-resolved filesystem call is a file input.",
    );
    context.addRelation(
      callId,
      inputId,
      "input-call",
      [context.location(node)],
      proof(
        "host-api",
        "The filesystem call is the exact file input boundary.",
        [context.location(node)],
      ),
      "proven",
    );
    context.addRelation(
      inputId,
      callId,
      "carrier",
      [context.location(node)],
      proof(
        "carrier-boundary",
        "The compiler-resolved filesystem call has one exact forward carrier endpoint.",
        [context.location(node)],
      ),
      "proven",
    );
  } else if (role === "file-write") {
    const writeId = context.specialInput(
      node,
      "file-write",
      ownerId,
      { operation: name, module },
      "host-api",
      "The compiler-resolved filesystem call is a file write terminal.",
    );
    context.effect(node, callId, ownerId, "filesystem-write", "The filesystem write is an external side effect.");
    context.addRelation(
      callId,
      writeId,
      "effect-input",
      [context.location(node)],
      proof(
        "host-api",
        "The filesystem call identifies the write terminal.",
        [context.location(node)],
      ),
      "proven",
    );
  } else if (role === "stdout" || role === "stderr") {
    const terminalId = context.specialInput(
      node,
      role,
      ownerId,
      { operation: name },
      "host-api",
      "The host console or process stream is an output terminal.",
    );
    context.effect(node, callId, ownerId, role, "The host output call is an external side effect.");
    context.addRelation(
      callId,
      terminalId,
      "effect-input",
      [context.location(node)],
      proof("host-api", "The output API identifies the terminal.", [context.location(node)]),
      "proven",
    );
  } else if (role === "exit-status") {
    const terminalId = context.specialInput(
      node,
      "exit-status",
      ownerId,
      { operation: name },
      "host-api",
      "The process exit API is an exit-status terminal.",
    );
    context.effect(node, callId, ownerId, "exit-status", "The process exit call is an external side effect.");
    context.addRelation(
      callId,
      terminalId,
      "effect-input",
      [context.location(node)],
      proof(
        "host-api",
        "The process exit API identifies the terminal.",
        [context.location(node)],
      ),
      "proven",
    );
  } else if (role === "http-response" || isHttpResponse(ts, node)) {
    const terminalId = context.specialInput(
      node,
      "http-response",
      ownerId,
      { operation: name },
      "host-api",
      "The response API identifies an HTTP response terminal.",
    );
    context.addHttpResponse({ node, elementId: terminalId, ownerId });
    const body = node.arguments[0];
    if (body) {
      context.addRelation(
        context.expression(body, ownerId),
        terminalId,
        "carrier",
        [context.location(body), context.location(node)],
        proof(
          "carrier-boundary",
          "The exact Response.json body is connected to its HTTP response endpoint.",
          [context.location(body), context.location(node)],
        ),
        "proven",
      );
    }
    context.addRelation(
      callId,
      terminalId,
      "effect-input",
      [context.location(node)],
      proof(
        "host-api",
        "The response parameter and method provide HTTP response evidence.",
        [context.location(node)],
      ),
      "proven",
    );
  } else {
    const serviceCallKind = externalServiceCallKind(ts, context.checker, node);
    if (serviceCallKind === "external-read") {
      const readId = context.specialInput(
        node,
        "external-read",
        ownerId,
        { operation: name, name: `database read: ${node.expression.getText()}(…)` },
        "compiler-symbol",
        "The compiler-resolved service method has a source-backed contract without an in-project implementation.",
      );
      context.addRelation(
        callId,
        readId,
        "input-call",
        [context.location(node)],
        proof(
          "compiler-symbol",
          "The service contract identifies this call as an external read boundary.",
          [context.location(node)],
        ),
        "proven",
      );
      // What the read returns is what the call yields: backward, the call's value starts at the read.
      context.addRelation(
        readId,
        callId,
        "carrier",
        [context.location(node)],
        proof(
          "carrier-boundary",
          "The compiler-resolved service read has one exact forward carrier endpoint.",
          [context.location(node)],
        ),
        "proven",
      );
    } else if (serviceCallKind === "external-write") {
      const writeId = context.specialInput(
        node,
        "external-effect",
        ownerId,
        { operation: name, name: `database write: ${node.expression.getText()}(…)` },
        "compiler-symbol",
        "The compiler-resolved service method has a source-backed write contract without an in-project implementation.",
      );
      context.addRelation(
        callId,
        writeId,
        "effect-input",
        [context.location(node)],
        proof(
          "compiler-symbol",
          "The service contract identifies this call as a write terminal.",
          [context.location(node)],
        ),
        "proven",
      );
    } else if (serviceCallKind === "message") {
      const messageId = context.specialInput(
        node,
        "message",
        ownerId,
        { operation: name },
        "compiler-symbol",
        "The compiler-resolved service method has a source-backed message contract without an in-project implementation.",
      );
      context.addRelation(
        callId,
        messageId,
        "effect-input",
        [context.location(node)],
        proof(
          "compiler-symbol",
          "The service contract identifies this call as a message terminal.",
          [context.location(node)],
        ),
        "proven",
      );
    } else if (context.isExternalCall(node)) {
      // That the call resolves outside the source is read; that it is an effect, and what it does with its arguments, is not: no model says so.
      context.effect(node, callId, ownerId, "external-effect", "Assumed: the call resolves outside the analyzed source tree, so it is taken to be an external effect.", "external-call");
    }
  }
}
