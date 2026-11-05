// The one place the model and prompt versions are defined. Every function that
// calls Claude imports from here.

export const MODEL = 'claude-haiku-5-5'

export const BRIEF_PROMPT_VERSION = 'brief_v1'
export const DRAFT_PROMPT_VERSION = 'draft_v1'

// requests.prompt_version: "brief_v1+draft_v1", or "brief_v1" when the draft is off.
export function requestPromptVersion(includeDraft: boolean) {
  return includeDraft ? `${BRIEF_PROMPT_VERSION}+${DRAFT_PROMPT_VERSION}` : BRIEF_PROMPT_VERSION
}

// The browser asks mark-failed to fail a request this long after run_started_at.
export const RUN_TIMEOUT_MS = 5 * 60 * 1000

export const TIMEOUT_MESSAGE = 'This took too long. Try again.'
export const NO_FACTS_MESSAGE = 'No facts could be checked against their sources. Try a different angle.'
export const RESEARCH_ERROR_MESSAGE = 'distro could not research this topic. Try again.'
export const DRAFT_FAILED_MESSAGE = 'The draft could not be written.'
