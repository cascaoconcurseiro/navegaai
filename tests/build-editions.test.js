import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

// Prevent a regression where Standard and Advanced inherited the same manifest.
test('packager must add debugger explicitly only for Advanced-CDP', () => {
  const script = readFileSync(new URL('../scripts/build_editions.py', import.meta.url), 'utf8');
  assert.match(script, /if name == 'Advanced-CDP':/);
  assert.match(script, /m\['permissions'\]\.append\('debugger'\)/);
  assert.match(script, /if p!='debugger'/);
});
