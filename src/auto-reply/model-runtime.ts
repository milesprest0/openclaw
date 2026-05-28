import type { SessionEntry } from "../config/sessions.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalString,
} from "../shared/string-coerce.js";

export function formatProviderModelRef(providerRaw: string, modelRaw: string): string {
  const provider = normalizeOptionalString(providerRaw) ?? "";
  const model = normalizeOptionalString(modelRaw) ?? "";
  if (!provider) {
    return model;
  }
  if (!model) {
    return provider;
  }
  const prefix = `${provider}/`;
  if (normalizeLowercaseStringOrEmpty(model).startsWith(normalizeLowercaseStringOrEmpty(prefix))) {
    const normalizedModel = model.slice(prefix.length).trim();
    if (normalizedModel) {
      return `${provider}/${normalizedModel}`;
    }
  }
  return `${provider}/${model}`;
}

type ModelRef = {
  provider: string;
  model: string;
  label: string;
};

function normalizeModelWithinProvider(provider: string, modelRaw: string): string {
  const model = normalizeOptionalString(modelRaw) ?? "";
  if (!provider || !model) {
    return model;
  }
  const prefix = `${provider}/`;
  if (normalizeLowercaseStringOrEmpty(model).startsWith(normalizeLowercaseStringOrEmpty(prefix))) {
    const withoutPrefix = model.slice(prefix.length).trim();
    if (withoutPrefix) {
      return withoutPrefix;
    }
  }
  return model;
}

function normalizeModelRef(
  rawModel: string,
  fallbackProvider: string,
  parseEmbeddedProvider = false,
): ModelRef {
  const trimmed = normalizeOptionalString(rawModel) ?? "";
  const slashIndex = parseEmbeddedProvider ? trimmed.indexOf("/") : -1;
  if (slashIndex > 0) {
    const provider = normalizeOptionalString(trimmed.slice(0, slashIndex)) ?? "";
    const model = normalizeOptionalString(trimmed.slice(slashIndex + 1)) ?? "";
    if (provider && model) {
      return {
        provider,
        model,
        label: `${provider}/${model}`,
      };
    }
  }
  const provider = normalizeOptionalString(fallbackProvider) ?? "";
  const dedupedModel = normalizeModelWithinProvider(provider, trimmed);
  return {
    provider,
    model: dedupedModel || trimmed,
    label: provider ? formatProviderModelRef(provider, dedupedModel || trimmed) : trimmed,
  };
}

/**
 * An always-latest alias is a model selection whose intent is "track the
 * newest model in this family forward forever" — e.g. `~anthropic/claude-opus-latest`
 * or any ref ending in `-latest`. The leading `~` sigil and the `-latest`
 * suffix are the two canonical always-latest markers used across the runtime
 * (see anthropic-family-cache-semantics.ts, which strips the `~` before
 * family detection).
 *
 * This matters for runtime-model resume: the per-turn writer records the
 * RESOLVED CONCRETE model id (e.g. `anthropic/claude-opus-4-7`) into
 * `sessionEntry.model` for usage attribution. On the next turn that recorded
 * concrete id would normally become the "active" model and shadow the
 * configured selection. If the configured selection is an always-latest
 * alias, letting a stale concrete snapshot win defeats the entire point of
 * the alias — the session gets pinned to whatever "latest" happened to be on
 * the day it was created and never moves forward, even after the fleet bumps
 * to a newer model. (Observed 2026-05-28: pre-migration sessions kept
 * replaying claude-opus-4-7 for days after the alias migration, silently
 * billing the retired model.)
 */
function isAlwaysLatestAliasRef(providerRaw: string, modelRaw: string): boolean {
  const provider = normalizeLowercaseStringOrEmpty(providerRaw);
  const model = normalizeLowercaseStringOrEmpty(modelRaw);
  // The `~` sigil can appear on the provider segment (`~anthropic`) or be
  // embedded in a combined ref (`openrouter/~anthropic/...`).
  if (provider.startsWith("~") || model.startsWith("~") || model.includes("/~")) {
    return true;
  }
  // `-latest` suffix on the model id (after stripping any provider prefix).
  const lastSegment = model.includes("/") ? model.slice(model.lastIndexOf("/") + 1) : model;
  return lastSegment.endsWith("-latest") || lastSegment === "latest";
}

export function resolveSelectedAndActiveModel(params: {
  selectedProvider: string;
  selectedModel: string;
  sessionEntry?: Pick<SessionEntry, "modelProvider" | "model">;
}): {
  selected: ModelRef;
  active: ModelRef;
  activeDiffers: boolean;
} {
  const selected = normalizeModelRef(params.selectedModel, params.selectedProvider);
  const runtimeModel = normalizeOptionalString(params.sessionEntry?.model);
  const runtimeProvider = normalizeOptionalString(params.sessionEntry?.modelProvider);

  // Always-latest guard: when the configured selection is an always-latest
  // alias, a previously recorded CONCRETE runtime model must not shadow it.
  // Honor the alias so "latest" keeps tracking forward instead of pinning the
  // session to a stale snapshot. The recorded concrete id remains untouched on
  // disk for historical usage attribution; it just no longer overrides the
  // alias selection at resume time.
  const selectedIsAlwaysLatest = isAlwaysLatestAliasRef(
    params.selectedProvider,
    params.selectedModel,
  );

  const active =
    runtimeModel && !selectedIsAlwaysLatest
      ? normalizeModelRef(runtimeModel, runtimeProvider || selected.provider, !runtimeProvider)
      : selected;
  const activeDiffers = active.provider !== selected.provider || active.model !== selected.model;

  return {
    selected,
    active,
    activeDiffers,
  };
}
