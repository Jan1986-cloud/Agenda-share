import { readdirSync } from 'fs';
test('precies één availability-logic.js', () => {
  const hits = readdirSync('.', { recursive: true })
              .filter(p => p.endsWith('availability-logic.js') && !p.includes('node_modules'));
  expect(hits).toEqual(['utils/availability-logic.js']);
});
