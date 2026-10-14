import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHTML,safeURL} from '../src/core.js';
test('HTML escaping and URL checks guard everything staff can type',()=>{
 assert.equal(escapeHTML('<img src=x onerror="a">&\''),'&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
 assert.equal(escapeHTML(null),'');
 assert.equal(safeURL('javascript:alert(1)'),'');assert.equal(safeURL('data:text/html,x'),'');assert.equal(safeURL('not a url'),'');
 assert.equal(safeURL('https://example.com/a b'),'https://example.com/a%20b');
});
