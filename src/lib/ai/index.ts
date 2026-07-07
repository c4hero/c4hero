// Public API for the BYOK AI engine.
//
//   import { createProvider, generateDiagramStream } from '@/lib/ai'
//
// The provider is the only network-touching piece; everything else is pure
// orchestration over an injected AiProvider, so features stay testable.

export type {
  AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest, AiStreamRequest, AiChatTurn,
  EditOp, EditPlan, DescribeResult, DescribePatch, AiErrorKind, AiFeatureId,
  ReviewResult, ReviewFinding, ReviewFixOption, ReviewSeverity,
} from './types'
export { AiError, aiErrorMessage } from './types'

export { isActionable, findingOptions } from './review'
export { classifyPlanScopes, type PlanScope } from './planScope'
export {
  missingInfoGaps, healthFieldCounts, gapToOp,
  type MissingGap, type GapKind,
} from './sweep'
export type { AiProviderId, AiProviderMeta, AiModelOption } from './providerMeta'
export { AI_PROVIDER_META, AI_PROVIDER_IDS, getProviderMeta, isAiProviderId } from './providerMeta'

export { createProvider } from './providers'

export {
  getAiUsage, subscribeAiUsage, resetAiUsage, type AiUsage,
} from './usage'

export {
  generateDiagramStream, reviewArchitecture, reviewArchitectureStream,
  autoDescribe, planEdit, draftAdr, answerQuestionStream,
  interviewAskStream, interviewKickoffMessage, interviewBuildPlan, suggestTags,
  suggestFieldValue,
} from './features'

export {
  serializeContext, serializeViewContext, viewLabel,
  flattenElements, elementIdSet, elementNameMap,
  elementsMissingDescription, relationshipsMissingDescription,
  viewScopeInternalIds, humanizeIds, makeHumanizer, escapeRegExp,
} from './context'

export { extractDsl, stripCodeFence } from './dsl'

export { detectComposeMode, isQuestion } from './composeMode'

export {
  applyEditPlan, describeOps, summarizeSkips, type EditActions, type ApplyResult,
} from './operations'
