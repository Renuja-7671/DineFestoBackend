const { detectTopics, resolveTopicsForRole } = require('./chatbotContext.service');

describe('chatbotContext.service', () => {
  it('detects menu and order topics from a message', () => {
    expect(detectTopics('What menu items are available and any pending orders?')).toEqual(
      expect.arrayContaining(['menu', 'orders'])
    );
  });

  it('falls back to overview when no topic is detected', () => {
    expect(detectTopics('hello there')).toEqual(['overview']);
  });

  it('limits topics to what the role is allowed to access', () => {
    const topics = resolveTopicsForRole('CHEF', 'show inventory, reservations, and leave balance');
    expect(topics).toContain('leave');
    expect(topics).toContain('overview');
    expect(topics).not.toContain('inventory');
    expect(topics).not.toContain('reservations');
  });
});
