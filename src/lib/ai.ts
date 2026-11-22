/**
 * OPTIONAL AI subtask suggestions (off by default).
 *
 * Privacy: nothing is sent unless the user has (1) enabled the assistant in Settings,
 * (2) entered their own Anthropic API key, and (3) pressed "Suggest subtasks", after
 * being shown exactly which text will be sent (see `buildAIPayloadPreview`).
 * The request goes directly from the device to api.anthropic.com — DAYMARK has no server.
 * Suggestions are only proposals: the user edits and approves each one.
 *
 * The SDK is loaded lazily so it never weighs down the core app.
 */

export interface AIRequestInput {
  taskTitle: string;
  taskDescription: string;
  progress: number;
  remaining: string;
  reason: string;
}

export const AI_MODEL = 'claude-opus-5-5';

export function buildAIPayloadPreview(i: AIRequestInput): string {
  return [
    `Task: ${i.taskTitle}`,
    i.taskDescription ? `Description: ${i.taskDescription}` : '',
    `Progress: ${i.progress}%`,
    `What remains (your words): ${i.remaining || '(not provided)'}`,
    i.reason ? `Why it wasn't finished: ${i.reason}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function suggestSubtasks(apiKey: string, input: AIRequestInput): Promise<string[]> {
  if (!apiKey.trim()) throw new Error('Add your Anthropic API key in Settings to use AI suggestions.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. AI suggestions need an internet connection.');

  const [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('zod'),
    import('@anthropic-ai/sdk/helpers/zod'),
  ]);

  const Schema = z.object({
    subtasks: z.array(z.string()).describe('3 to 7 short, concrete, actionable subtasks, each starting with a verb.'),
  });

  // The key belongs to the user and lives only on their device.
  const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 60_000 });

  try {
    const response = await client.messages.parse({
      model: AI_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Schema) },
      system:
        'You help a person break their unfinished work into small, concrete next steps. ' +
        'Base every subtask on what they wrote about the remaining work; do not invent scope they did not mention. ' +
        'Each subtask is one short imperative line (max ~10 words). Return 3–7 subtasks.',
      messages: [{ role: 'user', content: buildAIPayloadPreview(input) }],
    });
    if (response.stop_reason === 'refusal') throw new Error('The AI declined this request. You can still add subtasks yourself.');
    const parsed = response.parsed_output;
    if (!parsed) throw new Error('The AI response could not be read. Try again or add subtasks yourself.');
    return parsed.subtasks.map((s) => s.trim()).filter(Boolean).slice(0, 10);
  } catch (err: unknown) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Your API key was rejected. Check it in Settings.');
    if (err instanceof Anthropic.RateLimitError) throw new Error('Rate limited by the AI service. Try again in a minute.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach the AI service. Check your connection.');
    if (err instanceof Anthropic.APIError) throw new Error(`AI service error (${err.status ?? 'unknown'}).`);
    throw err instanceof Error ? err : new Error('AI suggestion failed.');
  }
}
