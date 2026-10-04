export type BookingActionDecision =
  | { kind: "IDEMPOTENT_PROCESSING" }
  | { kind: "IDEMPOTENT_CONFIRMED" }
  | { kind: "ALREADY_ASSIGNED" }
  | { kind: "ALREADY_CONFIRMED" }
  | { kind: "DECLINED_BY_EMPLOYEE" }
  | { kind: "EXPIRED" }
  | { kind: "COMPLETED" }
  | { kind: "CANCELLED" }
  | { kind: "FAILED" }
  | { kind: "ELIGIBLE" }
  | { kind: "NO_LONGER_AVAILABLE" };

type BookingActionInput = {
  status: string;
  assignedEmployeeId?: unknown;
  declinedBy?: unknown[];
  expiresAt: Date;
  userId: string;
  now?: Date;
};

function assignedToCurrent(input: BookingActionInput) {
  return String(input.assignedEmployeeId ?? "") === input.userId;
}

function isExpired(input: BookingActionInput) {
  return input.expiresAt.getTime() <= (input.now?.getTime() ?? Date.now());
}

export function classifyAccept(input: BookingActionInput): BookingActionDecision {
  if (isExpired(input) && [
    "REQUESTED",
    "RETRYING",
    "ASSIGNED",
    "CREATING_MEETING"
  ].includes(input.status)) {
    return { kind: "EXPIRED" };
  }

  if (input.declinedBy?.some((id) => String(id) === input.userId)) {
    return { kind: "DECLINED_BY_EMPLOYEE" };
  }

  if (input.status === "CONFIRMED" || input.status === "IN_PROGRESS") {
    return assignedToCurrent(input)
      ? { kind: "IDEMPOTENT_CONFIRMED" }
      : { kind: "ALREADY_CONFIRMED" };
  }

  if (input.status === "ASSIGNED" || input.status === "CREATING_MEETING") {
    return assignedToCurrent(input)
      ? { kind: "IDEMPOTENT_PROCESSING" }
      : { kind: "ALREADY_ASSIGNED" };
  }

  switch (input.status) {
    case "EXPIRED":
      return { kind: "EXPIRED" };
    case "COMPLETED":
      return { kind: "COMPLETED" };
    case "CANCELLED":
      return { kind: "CANCELLED" };
    case "FAILED":
      return { kind: "FAILED" };
    case "REQUESTED":
    case "RETRYING":
      return { kind: "ELIGIBLE" };
    default:
      return { kind: "NO_LONGER_AVAILABLE" };
  }
}

export function classifyDecline(input: BookingActionInput): BookingActionDecision {
  if (isExpired(input) && [
    "REQUESTED",
    "RETRYING",
    "ASSIGNED",
    "CREATING_MEETING"
  ].includes(input.status)) {
    return { kind: "EXPIRED" };
  }

  if (input.declinedBy?.some((id) => String(id) === input.userId)) {
    if (input.status === "REQUESTED" || input.status === "RETRYING") {
      return { kind: "IDEMPOTENT_PROCESSING" };
    }
    if (input.status === "ASSIGNED" || input.status === "CREATING_MEETING") {
      return assignedToCurrent(input)
        ? { kind: "ALREADY_CONFIRMED" }
        : { kind: "ALREADY_ASSIGNED" };
    }
  }

  if (input.status === "ASSIGNED" || input.status === "CREATING_MEETING") {
    return assignedToCurrent(input)
      ? { kind: "ALREADY_CONFIRMED" }
      : { kind: "ALREADY_ASSIGNED" };
  }

  if (input.status === "CONFIRMED" || input.status === "IN_PROGRESS") {
    return { kind: "ALREADY_CONFIRMED" };
  }

  switch (input.status) {
    case "EXPIRED":
      return { kind: "EXPIRED" };
    case "COMPLETED":
      return { kind: "COMPLETED" };
    case "CANCELLED":
      return { kind: "CANCELLED" };
    case "FAILED":
      return { kind: "FAILED" };
    case "REQUESTED":
    case "RETRYING":
      return { kind: "ELIGIBLE" };
    default:
      return { kind: "NO_LONGER_AVAILABLE" };
  }
}
