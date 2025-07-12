import { readdirSync } from 'fs';
import path from 'path';

test('precies één availability-logic.js', () => {
  const hits = readdirSync('.', { recursive: true })
    .filter(p =>
      p.endsWith('availability-logic.js') &&
      !p.includes('node_modules')
    )
    // normaliseer back-/forward-slash
    .map(p => p.split(path.sep).join('/'));

  expect(hits).toEqual(['utils/availability-logic.js']);
});
