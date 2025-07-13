#!/usr/bin/env node
/**
 * Zet elke import ".../availability-logic.js" om naar ".../utils/availability-logic.js"
 * Verwijdert de oude wrapper in de root                          (availability-logic.js)
 * Past de guard-test aan zodat hij precies 1 bestand verwacht   (utils/availability-logic.js)
 *
 * Gebruik:
 *   node tools/fix-logic-imports.js
 */

import { promises as fs } from 'fs';
import path from 'path';
import glob from 'glob';

/** alle JS–bestanden behalve node_modules en de canonical utils-file */
const files = glob.sync('**/*.js', {
  ignore: ['node_modules/**', 'utils/availability-logic.js']
});

for (const file of files) {
  let code = await fs.readFile(file, 'utf8');
  /** 
   * vervang:
   *   './availability-logic.js'
   *   '../availability-logic.js'
   *   '../../availability-logic.js'
   * enz. (zolang er nog geen /utils/ in zit)
   */
  const updated = code.replace(
    /(['"])(\.{1,2}\/(?:[^'"]*?)?)?availability-logic\.js\1/g,
    (_, quote, prefix = '') => {
      if (prefix.includes('utils/')) return `${quote}${prefix}availability-logic.js${quote}`; // al goed
      return `${quote}${prefix}utils/availability-logic.js${quote}`;
    }
  );

  if (updated !== code) {
    await fs.writeFile(file, updated);
    console.log('→ import path gefixt in', file);
  }
}

/* Guard-test aanpassen: verwacht exact utils/… */
const guardPath = 'test/no-duplicate-logic.test.js';
try {
  let g = await fs.readFile(guardPath, 'utf8');
  const newG = g.replace(
    /expect\(hits\)\.toEqual\([^)]*\);/,
    "expect(hits).toEqual(['utils/availability-logic.js']);"
  );
  if (newG !== g) {
    await fs.writeFile(guardPath, newG);
    console.log('→ guard-test geüpdatet');
  }
} catch {
  /* geen guard-test – geen probleem */
}

/* Verwijder wrapper-bestand als het er nog is */
try {
  await fs.unlink('availability-logic.js');
  console.log('→ oude wrapper availability-logic.js verwijderd');
} catch { /* bestond al niet */ }

console.log('\n✅  Imports opgeschoond.  Voer nu git-commit & npm test.');
