export type AiKind = 'gemini' | 'openai' | 'grok' | 'anthropic' | 'openrouter' | 'custom';

export const AI_CATALOG: Array<{
  kind: AiKind;
  name: string;
  hint: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  keyUrl: string;
}> = [
  {
    kind: 'gemini',
    name: 'Google Gemini',
    hint: 'Google AI Studio key (starts with AIza). Uses gemini-3.5-flash-lite.',
    defaultModel: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    kind: 'openai',
    name: 'ChatGPT / OpenAI',
    hint: 'OpenAI platform key. Uses Chat Completions.',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    kind: 'grok',
    name: 'Grok / xAI',
    hint: 'xAI console key (starts with xai-). Uses grok-4.3. The key must have inference access and credits.',
    defaultModel: 'grok-4.3',
    defaultBaseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai/',
  },
  {
    kind: 'anthropic',
    name: 'Claude / Anthropic',
    hint: 'Anthropic console key.',
    defaultModel: 'claude-3-5-haiku-latest',
    defaultBaseUrl: 'https://api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    kind: 'openrouter',
    name: 'OpenRouter',
    hint: 'Route to many models with one key.',
    defaultModel: 'openai/gpt-4o-mini',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    kind: 'custom',
    name: 'Custom (OpenAI compatible)',
    hint: 'Ollama, Groq, Azure, LiteLLM, or any /chat/completions endpoint.',
    defaultModel: '',
    defaultBaseUrl: '',
    keyUrl: '',
  },
];

export function catalogEntry(kind: string) {
  return AI_CATALOG.find((c) => c.kind === kind);
}
