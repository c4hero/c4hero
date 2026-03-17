export type AIProvider = 'anthropic' | 'openai'

interface AIConfig {
  provider: AIProvider
  apiKey: string
}

/** Get stored AI config from localStorage */
export function getAIConfig(): AIConfig | null {
  try {
    const data = localStorage.getItem('c4hero_ai_config')
    if (!data) return null
    return JSON.parse(data)
  } catch {
    return null
  }
}

/** Save AI config to localStorage */
export function saveAIConfig(config: AIConfig) {
  localStorage.setItem('c4hero_ai_config', JSON.stringify(config))
}

/** Clear AI config */
export function clearAIConfig() {
  localStorage.removeItem('c4hero_ai_config')
}

/** Generate a description for an element using AI */
export async function generateDescription(
  elementName: string,
  elementType: string,
  technology?: string,
  context?: string,
): Promise<string> {
  const config = getAIConfig()
  if (!config) throw new Error('AI not configured. Please set your API key in settings.')

  const prompt = `You are a software architect. Generate a concise 1-2 sentence description for a C4 architecture model element.

Element type: ${elementType}
Element name: ${elementName}
${technology ? `Technology: ${technology}` : ''}
${context ? `Context: ${context}` : ''}

Respond with ONLY the description text, no quotes or explanation.`

  if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
    const data = await response.json()
    return data.content[0]?.text?.trim() ?? ''
  }

  if (config.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)
    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() ?? ''
  }

  throw new Error(`Unknown AI provider: ${config.provider}`)
}

/** Generate a workspace from a natural language description */
export async function generateWorkspaceFromDescription(description: string): Promise<string> {
  const config = getAIConfig()
  if (!config) throw new Error('AI not configured. Please set your API key in settings.')

  const prompt = `You are a software architect. Convert the following natural language description into a valid Structurizr DSL workspace.

Description: ${description}

Requirements:
- Use proper Structurizr DSL syntax
- Include people, software systems, containers where appropriate
- Define relationships between elements
- Include at least a systemLandscape view with "include *" and "autoLayout"
- Include basic styles for Person and Software System elements
- Use meaningful variable names

Respond with ONLY the Structurizr DSL code, no explanation or markdown.`

  if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
    const data = await response.json()
    return data.content[0]?.text?.trim() ?? ''
  }

  if (config.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`)
    const data = await response.json()
    return data.choices[0]?.message?.content?.trim() ?? ''
  }

  throw new Error(`Unknown AI provider: ${config.provider}`)
}
