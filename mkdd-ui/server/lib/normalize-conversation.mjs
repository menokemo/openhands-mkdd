/**
 * Reduces a raw OpenHands conversation object down to the safe fields the
 * MKDD UI actually needs (see README section 16, "Safe Event Normalization").
 * Never pass raw OpenHands conversation objects to the browser unfiltered.
 */
export function normalizeConversation(conversation) {
  if (!conversation || typeof conversation !== "object") return null;

  const metrics = conversation.stats?.usage_to_metrics?.default;
  const tokens = metrics?.accumulated_token_usage;

  return {
    id: conversation.id,
    execution_status: conversation.execution_status ?? null,
    tags: {
      ...(typeof conversation.tags?.mkddproject === "string"
        ? { mkddproject: conversation.tags.mkddproject }
        : {}),
      ...(typeof conversation.tags?.mkddemployee === "string"
        ? { mkddemployee: conversation.tags.mkddemployee }
        : {}),
    },
    cost:
      metrics && typeof metrics === "object"
        ? {
            modelName: typeof metrics.model_name === "string" ? metrics.model_name : null,
            accumulatedCost:
              typeof metrics.accumulated_cost === "number" ? metrics.accumulated_cost : 0,
            tokens:
              tokens && typeof tokens === "object"
                ? {
                    prompt:
                      typeof tokens.prompt_tokens === "number" ? tokens.prompt_tokens : 0,
                    completion:
                      typeof tokens.completion_tokens === "number"
                        ? tokens.completion_tokens
                        : 0,
                    cacheRead:
                      typeof tokens.cache_read_tokens === "number"
                        ? tokens.cache_read_tokens
                        : 0,
                    cacheWrite:
                      typeof tokens.cache_write_tokens === "number"
                        ? tokens.cache_write_tokens
                        : 0,
                    reasoning:
                      typeof tokens.reasoning_tokens === "number"
                        ? tokens.reasoning_tokens
                        : 0,
                  }
                : null,
          }
        : null,
  };
}
