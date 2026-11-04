// Browser entry points into the AI pipeline. All three are empty until Prompt 5
// wires them to the generate-brief and generate-draft edge functions.

// Called right after a new request row is inserted and request_created is logged.
export async function startBrief(requestId: string): Promise<void> {
  void requestId
}

// "Try again" on a failed request.
export async function retryBrief(requestId: string): Promise<void> {
  void requestId
}

// "Write draft again" when the draft failed on a ready request.
export async function retryDraft(requestId: string): Promise<void> {
  void requestId
}
