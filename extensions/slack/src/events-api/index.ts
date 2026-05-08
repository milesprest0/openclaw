/**
 * Track Beta — Slack Resilience Platform Migration.
 *
 * Barrel export for the Events API dark-launch endpoint (PRE-172 Phase 1).
 * See `endpoint.ts` for handler, `signature.ts` for request verification.
 */
export {
  EVENTS_API_DEFAULT_PATH,
  handleSlackEventsApiRequest,
} from "./endpoint.js";
export type {
  SlackEventsApiConfig,
  SlackEventsApiLogger,
  SlackEventsApiRequest,
  SlackEventsApiResponse,
} from "./endpoint.js";
export {
  SLACK_SIGNATURE_MAX_AGE_MS,
  computeSlackSignatureForTest,
  verifySlackSignature,
} from "./signature.js";
export type {
  SlackSignatureHeaders,
  VerifySlackSignatureInput,
  VerifySlackSignatureResult,
} from "./signature.js";
