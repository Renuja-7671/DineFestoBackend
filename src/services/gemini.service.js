const DEFAULT_MODEL = 'gemini-2.0-flash';

const BASE_RULES = `IMPORTANT RULES:
- You are connected to the live DineFesto restaurant database.
- Answer using ONLY the live restaurant data provided below.
- Do NOT search the internet, guess, or invent menu items, prices, orders, reservations, stock levels, or staff details.
- If the live data does not contain the answer, clearly say the information is not available in the system yet.
- Currency is LKR unless stated otherwise.
- Be concise, friendly, and practical.`;

const ROLE_SYSTEM_PROMPTS = {
  ADMIN: `You are DineFesto Assistant for restaurant administrators. Help with employees, orders, inventory, menu, reservations, reports, leave approvals, and system settings using live database data.`,
  MANAGER: `You are DineFesto Assistant for restaurant managers. Help with daily operations using live database data: orders, staff, reservations, inventory, and reports.`,
  WAITER: `You are DineFesto Assistant for waiters. Help with orders, attendance, schedules, and leave using live database data.`,
  CHEF: `You are DineFesto Assistant for kitchen chefs. Help with kitchen order queue, leave requests, and shift-related questions using live database data.`,
  CUSTOMER: `You are DineFesto Assistant for restaurant customers. Help with menu items, the customer's own orders, reservations, and reviews using live database data.`,
};

const getGeminiConfig = () => ({
  apiKey: process.env.GEMINI_API_KEY?.trim() || '',
  model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
});

const isGeminiConfigured = () => Boolean(getGeminiConfig().apiKey);

const getSystemPromptForRole = (role, restaurantContext = '') => {
  const rolePrompt =
    ROLE_SYSTEM_PROMPTS[role] ||
    'You are DineFesto Assistant for a restaurant management system. Answer helpfully and concisely using live database data.';

  if (!restaurantContext) {
    return `${rolePrompt}\n\n${BASE_RULES}`;
  }

  return `${rolePrompt}

${BASE_RULES}

LIVE RESTAURANT DATA:
${restaurantContext}`;
};

const mapHistoryToGeminiContents = (history = []) =>
  history
    .filter((entry) => entry?.content?.trim())
    .slice(-20)
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: entry.content.trim() }],
    }));

const extractGeminiText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part) => part.text || '')
    .join('')
    .trim();
};

const generateChatReply = async ({ role, message, history = [], restaurantContext = '' }) => {
  const { apiKey, model } = getGeminiConfig();

  if (!apiKey) {
    throw new Error('Chat assistant is not configured yet. Please add GEMINI_API_KEY to the server environment.');
  }

  const trimmedMessage = message?.trim();
  if (!trimmedMessage) {
    throw new Error('Message is required');
  }

  const contents = [
    ...mapHistoryToGeminiContents(history),
    { role: 'user', parts: [{ text: trimmedMessage }] },
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: getSystemPromptForRole(role, restaurantContext) }],
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  const payload = await response.json();

  if (!response.ok) {
    const apiMessage =
      payload?.error?.message || `Gemini API request failed with status ${response.status}`;
    throw new Error(apiMessage);
  }

  const reply = extractGeminiText(payload);
  if (!reply) {
    throw new Error('Gemini returned an empty response');
  }

  return reply;
};

module.exports = {
  generateChatReply,
  getSystemPromptForRole,
  isGeminiConfigured,
  getGeminiConfig,
};
