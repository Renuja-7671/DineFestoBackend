const {
  getSystemPromptForRole,
  isGeminiConfigured,
} = require('./gemini.service');

describe('gemini.service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('detects when Gemini API key is configured', () => {
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = 'test-key';
    expect(isGeminiConfigured()).toBe(true);
  });

  it('returns role-specific system prompts', () => {
    expect(getSystemPromptForRole('CUSTOMER')).toContain('customers');
    expect(getSystemPromptForRole('WAITER')).toContain('waiters');
    expect(getSystemPromptForRole('CHEF')).toContain('chefs');
    expect(getSystemPromptForRole('ADMIN')).toContain('administrators');
    expect(getSystemPromptForRole('ADMIN', '{"data":{}}')).toContain('LIVE RESTAURANT DATA');
  });
});
