export type ThinkingEvictionMode = "off" | "shadow" | "on";
export type ThinkingEvictionPlan = {
  apply: boolean;
  measure: boolean;
};
export declare function resolveThinkingEvictionPlan(params: {
  mode: ThinkingEvictionMode;
  evictionSafe: boolean;
}): ThinkingEvictionPlan;
