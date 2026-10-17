/**
 * test.js — Comprehensive DepMigrate fixture
 *
 * This file deliberately contains a mix of:
 *
 *  ✓ DETERMINISTIC  — scanner detects pattern + rules cache has exact match
 *                     → auto-rewritten without LLM
 *
 *  📋 MANUAL        — scanner detects deprecated import/property
 *                     → flagged in report, no code change, requires human action
 *
 *  ⚡ LLM-ASSISTED  — scanner detects deprecated usage, no deterministic rule
 *                     → code passed to Claude for context-aware rewrite suggestion
 *
 * Run:  node dist/cli.js scan ./fixtures/demo-repo/src/test.js --dry-run
 * Run:  node dist/cli.js scan ./fixtures/demo-repo/src/test.js
 */

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS  (several are deprecated — scanner detects at the import line)
// ─────────────────────────────────────────────────────────────────────────────

// 📋 MANUAL: expo-av deprecated in SDK 54+ — replace entire package with
//            expo-video (for Video) or expo-audio (for Audio)
import { Video, Audio } from 'expo-av';

// 📋 MANUAL: expo-face-detector not available from SDK 51+
//            → migrate to react-native-vision-camera
import * as FaceDetector from 'expo-face-detector';

// 📋 MANUAL: expo-background-fetch deprecated in SDK 53+
//            → replace with expo-background-task
import * as BackgroundFetch from 'expo-background-fetch';

// 📋 MANUAL: expo-video-thumbnails removed in SDK 56+
//            → migrate to expo-video (generateThumbnailsAsync)
import { VideoThumbnails } from 'expo-video-thumbnails';

// 📋 MANUAL: react-native-iap deprecated; Expo-managed alternative is expo-iap
import * as IAP from 'react-native-iap';

// Packages used for deterministic property access detections below
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { StyleSheet, View, Text } from 'react-native';
import * as Localization from 'expo-localization';
import * as Cellular from 'expo-cellular';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — DETERMINISTIC migrations
// These map directly to rules with transformType: "deterministic" in seedRules.json
// The scanner detects them and the applier rewrites them automatically.
// ─────────────────────────────────────────────────────────────────────────────

// ✓ DETERMINISTIC (Node DEP0005): new Buffer(n) → Buffer.alloc(n)
function allocFixedBuffer() {
  const buf = new Buffer(64);
  buf.fill(0);
  return buf;
}

// ✓ DETERMINISTIC (Node DEP0005): new Buffer("str") → Buffer.from("str")
function encodeString() {
  const encoded = new Buffer("DepMigrate rocks");
  return encoded.toString('base64');
}

// ✓ DETERMINISTIC (Node DEP0005): new Buffer([array]) → Buffer.from([array])
function wrapByteArray() {
  const bytes = [0xDE, 0xAD, 0xBE, 0xEF];
  return new Buffer(bytes);
}

// ✓ DETERMINISTIC (Expo SDK 50+): Constants.manifest → Constants.expoConfig
function getAppConfig() {
  const name = Constants.manifest.name;
  const version = Constants.manifest.version;
  const slug = Constants.manifest.slug;
  return { name, version, slug };
}

// ✓ DETERMINISTIC (EAS Update): Updates.releaseChannel → Updates.channel
function getUpdateChannel() {
  return Updates.releaseChannel;
}

// ✓ DETERMINISTIC (RN 0.85+): StyleSheet.absoluteFill → StyleSheet.absoluteFillObject
const overlayStyle = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});

// ✓ DETERMINISTIC (Expo SDK 51+): Localization.locale → Localization.getLocales()
function getLocaleSync() {
  return Localization.locale;
}

// ✓ DETERMINISTIC (Expo SDK 51+): Localization.isRTL → Localization.getLocales()
function checkRTL() {
  return Localization.isRTL;
}

// ✓ DETERMINISTIC (Expo SDK 51+): Localization.timezone → Localization.getLocales()
function getTimezone() {
  return Localization.timezone;
}

// ✓ DETERMINISTIC (Expo SDK 51+): Cellular.allowsVoip → allowsVoipAsync()
function checkVoip() {
  return Cellular.allowsVoip;
}

// ✓ DETERMINISTIC (Expo SDK 51+): Cellular.carrier → getCarrierNameAsync()
function getCarrier() {
  return Cellular.carrier;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B — MANUAL migrations
// These are flagged in the report as "📋 Manual migration required".
// No code changes are applied automatically — developer must act on the report.
// ─────────────────────────────────────────────────────────────────────────────

// 📋 MANUAL (Expo SDK 51+): Constants.installationId deprecated
//   → use crypto.randomUUID() or a persistent UUID stored in SecureStore
const deviceId = Constants.installationId;

// 📋 MANUAL (Expo SDK 51+): Constants.isDevice deprecated
//   → use Device.isDevice from expo-device
const isRealDevice = Constants.isDevice;

// 📋 MANUAL (Expo SDK 51+): Constants.nativeAppVersion deprecated
//   → use Application.nativeApplicationVersion from expo-application
const appVersion = Constants.nativeAppVersion;

// 📋 MANUAL (Expo SDK 51+): Constants.platform.platform deprecated
//   → use Device.modelId from expo-device
const modelId = Constants.platform.platform;

// 📋 MANUAL (Expo SDK 51+): Constants.deviceYearClass deprecated
//   → use Device.deviceYearClass from expo-device
const yearClass = Constants.deviceYearClass;

// 📋 MANUAL (Expo SDK 51+): Constants.nativeBuildVersion deprecated
//   → use Application.nativeBuildVersion from expo-application
const buildVersion = Constants.nativeBuildVersion;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C — LLM-ASSISTED migrations
// No deterministic rule exists, but the pattern is deprecated.
// Scanner detects the call site and routes it to Claude for a rewrite suggestion.
// ─────────────────────────────────────────────────────────────────────────────

// ⚡ LLM-ASSISTED (Node DEP0005): new Buffer(dynamicVar) — arg type is unresolvable
//   The scanner cannot determine the replacement without context, so it asks the LLM.
function processDynamicInput(userInput) {
  // userInput could be a string, number, or array — LLM must infer from context
  return new Buffer(userInput);
}

// ⚡ LLM-ASSISTED (Node DEP0005): new Buffer(computedSize) — computed expression
//   The computed result of an expression is unresolvable at static analysis time.
function allocateComputed(baseSize, multiplier) {
  const size = baseSize * multiplier;
  return new Buffer(size);
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE / EXPORT
// ─────────────────────────────────────────────────────────────────────────────

async function runDemo() {
  // Demonstrate all deprecated usages in one flow
  const config = getAppConfig();
  const channel = getUpdateChannel();
  const locale = getLocaleSync();
  const timezone = getTimezone();
  const rtl = checkRTL();
  const voip = checkVoip();
  const carrier = getCarrier();

  // Show face detection (deprecated, manual migration needed)
  const faces = await FaceDetector.detectFacesAsync('file://demo.jpg');

  // Show background fetch (deprecated, manual migration needed)
  await BackgroundFetch.registerTaskAsync('DEMO_TASK', { minimumInterval: 300 });

  // Show IAP (deprecated, manual migration needed)
  const products = await IAP.getProducts({ skus: ['premium_monthly'] });

  // Show video thumbnail (deprecated, manual migration needed)
  const thumb = await VideoThumbnails.getThumbnailAsync('file://video.mp4', { time: 1000 });

  // Show fixed + dynamic Buffer usage
  const fixed = allocFixedBuffer();
  const encoded = encodeString();
  const dynamic = processDynamicInput('hello');
  const computed = allocateComputed(128, 4);

  return {
    config, channel, locale, timezone, rtl, voip, carrier,
    faces, products, thumb, fixed, encoded, dynamic, computed,
    deviceId, isRealDevice, appVersion, modelId, yearClass, buildVersion,
  };
}

module.exports = { runDemo, allocFixedBuffer, encodeString, wrapByteArray,
                   getAppConfig, getUpdateChannel, processDynamicInput };
