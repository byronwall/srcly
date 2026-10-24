import type { CandidateConsumer } from "./route-totality-field-proof-consumers";

export function genericConsumerLabel(consumer: CandidateConsumer, fieldName: string): string {
  const attributes = consumer.binding?.attributes ?? {};
  if (consumer.kind === "handler" && typeof attributes.actionName === "string") {
    return `${attributes.actionName}.${attributes.argumentName ?? fieldName}`;
  }
  const collection = typeof attributes.consumerCollection === "string" ? attributes.consumerCollection : null;
  if (consumer.boundary) {
    if (consumer.kind === "condition") {
      if (collection === "schedules") return "Completed schedule gameId condition";
      if (collection === "availability") return consumer.boundary.componentName === "ScheduledGamePlanningDetails"
        ? "Scheduled availability gameId condition" : "Completed availability gameId condition";
      if (collection === "liveGames") return "Completed live gameId condition";
    }
    if (consumer.kind === "render" && consumer.boundary.componentName === "CompletedGameSummary"
      && consumer.componentName === "A") return "Completed A.href live";
    if (consumer.kind === "render" && consumer.boundary.componentName === "ScheduledGamePlanningDetails") {
      return fieldName === "venueName" ? "ScheduledGamePlanningDetails venue" : "ScheduledGamePlanningDetails address";
    }
    if (consumer.kind === "render" && consumer.boundary.componentName === "ProjectDetails" && fieldName === "ownerName") {
      return "ProjectDetails owner";
    }
    if (consumer.kind === "render" && consumer.boundary.componentName === "PageHeader" && consumer.boundary.propName === "title") {
      return "PageHeader.title";
    }
  }
  if (consumer.componentName === "PageHeader" && consumer.propName === "description") {
    if (fieldName === "startsAt") return "PageHeader.description date";
    if (fieldName === "venueName") return "PageHeader.description venue";
  }
  if (consumer.componentName === "PageHeader" && consumer.propName === "eyebrow" && consumer.kind === "condition") {
    return "PageHeader.eyebrow condition";
  }
  if (consumer.componentName === "A" && consumer.propName === "href") return "A.href schedule";
  if (consumer.componentName === "Show" && consumer.kind === "condition") {
    if (attributes.nestedShow === true) return "Show.when build actions";
    if (attributes.conditionOperator === "===") return "Show.when completed branch";
    return "Show.when edit action";
  }
  return consumer.evidenceLabel ?? `${consumer.componentName ?? "component"}.${consumer.propName ?? fieldName}`;
}
