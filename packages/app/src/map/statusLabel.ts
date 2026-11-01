/** Player-facing name of a catalogue status. */
export function statusLabel(status: string): string {
  switch (status) {
    case "independent":
      return "Independent state";
    case "personal-union":
      return "Personal union";
    case "autonomous-vassal":
      return "Autonomous vassal";
    case "dominion":
      return "Self-governing dominion";
    case "self-governing-colony":
      return "Self-governing colony";
    case "protectorate":
      return "Protectorate";
    case "colony":
      return "Colony";
    case "occupation":
      return "Under occupation";
    case "autonomous-province":
      return "Autonomous province";
    case "dependency":
      return "Dependency";
    default:
      return status;
  }
}
