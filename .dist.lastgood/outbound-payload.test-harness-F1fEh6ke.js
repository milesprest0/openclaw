import { a as primeChannelOutboundSendMock } from "./inbound-testkit-OSzBQV2K.js";
import { t as slackOutbound } from "./outbound-adapter-5ZYjUT7P.js";
import "./channel-contract-testing-BTHJYGEE.js";
import { n as vi } from "./test.DNmyFkvJ-DuAhK9jz.js";
//#region extensions/slack/src/outbound-payload.test-harness.ts
function createSlackOutboundPayloadHarness(params) {
  const sendSlack = vi.fn();
  primeChannelOutboundSendMock(
    sendSlack,
    {
      messageId: "sl-1",
      channelId: "C12345",
      ts: "1234.5678",
    },
    params.sendResults,
  );
  const ctx = {
    cfg: {},
    to: "C12345",
    text: "",
    payload: params.payload,
    deps: { sendSlack },
  };
  return {
    run: async () => await slackOutbound.sendPayload(ctx),
    sendMock: sendSlack,
    to: ctx.to,
  };
}
//#endregion
export { createSlackOutboundPayloadHarness as t };
