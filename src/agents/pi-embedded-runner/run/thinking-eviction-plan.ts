export type ThinkingEvictionMode = "off" | "shadow" | "on";

export type ThinkingEvictionPlan = {
  apply: boolean;
  measure: boolean;
};

export function resolveThinkingEvictionPlan(params: {
  mode: ThinkingEvictionMode;
  evictionSafe: boolean;
}): ThinkingEvictionPlan {
  if (!params.evictionSafe || params.mode === "off") {
    return { apply: false, measure: false };
  }

  if (params.mode === "shadow") {
    return { apply: false, measure: true };
  }

  return { apply: true, measure: true };
}
