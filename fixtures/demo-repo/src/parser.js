/**
 * parser.js — Demo fixture for DepMigrate
 *
 * Contains four deprecated Buffer() call sites (Node DEP0005):
 *   1. Numeric literal  → should resolve to Buffer.alloc()
 *   2. String literal   → should resolve to Buffer.from()
 *   3. Array (inferred) → should resolve to Buffer.from()
 *   4. Unresolvable     → requires LLM / manual review
 */

// Case 1: Numeric literal — allocate a fixed-size buffer
function createFixedBuffer() {
  const buf = new Buffer(16);
  buf.fill(0);
  return buf;
}

// Case 2: String literal — encode a known string
function encodeMessage() {
  const greeting = new Buffer("hello world");
  return greeting.toString("base64");
}

// Case 3: Array (locally inferred) — wrap known byte values
function wrapBytes() {
  const bytes = [0x48, 0x65, 0x6c, 0x6c, 0x6f];
  const buf = new Buffer(bytes);
  return buf;
}

// Case 4: Unresolvable — external parameter, type unknown at analysis time
function wrapDynamic(userInput) {
  return new Buffer(userInput);
}

module.exports = { createFixedBuffer, encodeMessage, wrapBytes, wrapDynamic };
