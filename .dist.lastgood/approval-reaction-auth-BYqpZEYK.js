import { i as resolveMatrixAccount } from "./accounts-Fm6UOeFA.js";
import { t as resolveApprovalApprovers } from "./approval-approvers-Ck1blaMS.js";
import { t as normalizeMatrixApproverId } from "./approval-ids-D474cv7x.js";
//#region extensions/matrix/src/approval-reaction-auth.ts
function normalizeMatrixExecApproverId(value) {
  const normalized = normalizeMatrixApproverId(value);
  return normalized === "*" ? void 0 : normalized;
}
function getMatrixApprovalReactionApprovers(params) {
  const account = resolveMatrixAccount(params).config;
  if (params.approvalKind === "plugin")
    return resolveApprovalApprovers({
      allowFrom: account.dm?.allowFrom,
      normalizeApprover: normalizeMatrixApproverId,
    });
  return resolveApprovalApprovers({
    explicit: account.execApprovals?.approvers,
    allowFrom: account.dm?.allowFrom,
    normalizeApprover: normalizeMatrixExecApproverId,
  });
}
function isMatrixApprovalReactionAuthorizedSender(params) {
  const normalizedSenderId = params.senderId ? normalizeMatrixApproverId(params.senderId) : void 0;
  if (!normalizedSenderId) return false;
  return getMatrixApprovalReactionApprovers(params).includes(normalizedSenderId);
}
//#endregion
export { isMatrixApprovalReactionAuthorizedSender };
