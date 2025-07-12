import { readdirSync } from 'fs';
import path from 'path';

test('exact twee bestanden en wrapper is root', () => {
  const hits = readdirSync('.', { recursive: true })
      .filter(p => p.endsWith('availability-logic.js') && !p.includes('node_modules'))
      .map(p => p.split(path.sep).join('/'))
      .sort();              // ➜ consequent pad-scheiding

  expect(hits).toEqual([
    'availability-logic.js',       // de wrapper
    'utils/availability-logic.js'  // de echte implementatie
  ]);
});
