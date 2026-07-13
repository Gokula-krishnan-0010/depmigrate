/**
 * test.js — Basic test suite for the demo fixture
 */

const { createFixedBuffer, encodeMessage, wrapBytes, wrapDynamic } = require('./src/parser');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

console.log('Running parser tests...\n');

// Test 1: createFixedBuffer
const fixedBuf = createFixedBuffer();
assert(Buffer.isBuffer(fixedBuf), 'createFixedBuffer returns a Buffer');
assert(fixedBuf.length === 16, 'createFixedBuffer returns buffer of length 16');
assert(fixedBuf.every(b => b === 0), 'createFixedBuffer returns zero-filled buffer');

// Test 2: encodeMessage
const encoded = encodeMessage();
assert(typeof encoded === 'string', 'encodeMessage returns a string');
assert(encoded === Buffer.from('hello world').toString('base64'), 'encodeMessage encodes correctly');

// Test 3: wrapBytes
const wrapped = wrapBytes();
assert(Buffer.isBuffer(wrapped), 'wrapBytes returns a Buffer');
assert(wrapped.toString() === 'Hello', 'wrapBytes contains expected bytes');

// Test 4: wrapDynamic
const dynamic = wrapDynamic('test input');
assert(Buffer.isBuffer(dynamic), 'wrapDynamic returns a Buffer');
assert(dynamic.toString() === 'test input', 'wrapDynamic preserves input');

console.log(`\nResults: ${passed} passing, ${failed} failing`);

if (failed > 0) {
  process.exit(1);
}
