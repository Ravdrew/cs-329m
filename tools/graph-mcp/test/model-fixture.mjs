// Pi's real session and tool pipeline with a scripted model in place of the provider (as tools/llm-only's tests do).
// Shared by these tests and tools/agent-runner's.
import { createAssistantMessageEventStream, getCurrentTools, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

export { getCurrentTools };

/**
 * steps[i] is the content of the model's i-th response: an array of blocks, or a function of the request context
 * that returns one. Missing steps answer "Done." `options.cost` is the cost reported per response.
 */
export async function modelFixture(steps, { cost = 0 } = {}) {
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  await runtime.setRuntimeApiKey('openai', 'test-credential-never-send');
  const requests = [];
  runtime.streamSimple = (model, context) => {
    const index = requests.length;
    requests.push(structuredClone(context));
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      const step = typeof steps === 'function' ? steps(index, context) : steps[index];
      const content = (typeof step === 'function' ? step(context) : step) ?? [{ type: 'text', text: 'Done.' }];
      const message = {
        role: 'assistant', content, api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost } },
        stopReason: content.some(item => item.type === 'toolCall') ? 'toolUse' : 'stop',
      };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason, message });
      stream.end();
    });
    return stream;
  };
  return { runtime, requests };
}

export const toolCall = (name, args = {}) => ({ type: 'toolCall', id: `${name}-${Math.random().toString(36).slice(2)}`, name, arguments: args });
