// Public API for the BYOK AI engine.
//
//   import { createAnthropicProvider, generateDiagram } from '@/lib/ai'
//
// The provider is the only network-touching piece; everything else is pure
// orchestration over an injected AiProvider, so features stay testable.

export type {
  AiProvider, AiProviderConfig, AiTextRequest, AiJsonRequest, AiChatTurn,
  EditOp, EditPlan, DescribeResult, DescribePatch, AiErrorKind, AiFeatureId,
} from './types'
export { AiError, aiErrorMessage } from './types'

export type { AiProviderId, AiProviderMeta, AiModelOption } from './providerMeta'
export { AI_PROVIDER_META, AI_PROVIDER_IDS, getProviderMeta, isAiProviderId } from './providerMeta'

export { createProvider } from './providers'

export {
  generateDiagram, reviewArchitecture, applyReview, autoDescribe, planEdit, draftAdr,
  interviewAsk, interviewKickoffMessage, interviewBuildPlan,
} from './features'

export {
  serializeContext, serializeViewContext, viewLabel,
  flattenElements, elementIdSet, elementNameMap,
  elementsMissingDescription, relationshipsMissingDescription,
} from './context'

export { extractDsl, stripCodeFence } from './dsl'

export {
  applyEditPlan, describeOps, type EditActions, type ApplyResult,
} from './operations'

export {
  countMissingDescriptions, buildDescribePreview, applyDescribePreview,
  type DescribeActions, type DescribePreview, type DescribePreviewItem,
} from './describe'
