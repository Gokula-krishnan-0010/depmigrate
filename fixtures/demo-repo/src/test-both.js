// DeprecatedApp.js
// This file contains a mix of deterministic and manual deprecations.
// - Deterministic: can be automatically transformed by depmigrate.
// - Manual: require developer judgment or additional context.

import React, { useEffect } from 'react';
import {
  View,
  Text,
  SafeAreaView, // DEPRECATED (manual): import from 'react-native-safe-area-context' instead
  AppState,      // Used below for deterministic removeEventListener
} from 'react-native';
import Constants from 'expo-constants'; // DEPRECATED (manual): many properties moved to expo-device, expo-application
import { Video } from 'expo-av'; // DEPRECATED (manual): use expo-video instead
import * as BackgroundFetch from 'expo-background-fetch'; // DEPRECATED (manual): use expo-background-task
import * as Localization from 'expo-localization'; // DEPRECATED (deterministic): properties like isRTL, locale, currency are replaced by getLocales()

// DEPRECATED (deterministic): Buffer with number literal -> Buffer.alloc
const buf1 = new Buffer(1024);

// DEPRECATED (deterministic): Buffer with string literal -> Buffer.from
const buf2 = new Buffer('hello');

// DEPRECATED (deterministic): Constants.manifest -> Constants.expoConfig (SDK 50+)
const manifest = Constants.manifest;

// DEPRECATED (manual): Constants.installationId -> generate your own UUID
const deviceId = Constants.installationId;

// DEPRECATED (manual): Constants.isDevice -> use expo-device.isDevice
const isDevice = Constants.isDevice;

// DEPRECATED (manual): Constants.nativeAppVersion -> expo-application.Application.nativeApplicationVersion
const appVersion = Constants.nativeAppVersion;

// DEPRECATED (deterministic): expo-localization properties -> use getLocales()
const isRTL = Localization.isRTL;
const locale = Localization.locale;
const currency = Localization.currency;
const region = Localization.region;
const timezone = Localization.timezone;

// DEPRECATED (deterministic): Updates.releaseChannel -> Updates.channel (EAS Update)
import * as Updates from 'expo-updates';
const channel = Updates.releaseChannel; // deterministic -> Updates.channel

// DEPRECATED (deterministic): ViewPropTypes -> deprecated-react-native-prop-types
// (import not shown here, but usage would be flagged)

// DEPRECATED (manual): expo-av.Video component -> expo-video
const VideoPlayer = () => <Video source={{ uri: '...' }} />;

// DEPRECATED (manual): expo-background-fetch -> expo-background-task
useEffect(() => {
  BackgroundFetch.registerTaskAsync('task', { minimumInterval: 60 });
}, []);

// DEPRECATED (deterministic): AppState.removeEventListener (React Native 0.70+)
// The method signature changed: removeEventListener is removed; use the returned subscription directly.
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => { });
  return () => {
    // DEPRECATED: AppState.removeEventListener(subscription) - instead use subscription.remove()
    AppState.removeEventListener('change', subscription); // deterministic -> use subscription.remove()
  };
}, []);

// DEPRECATED (manual): expo-status-bar backgroundColor, translucent, etc.
import { StatusBar } from 'expo-status-bar';
// Later in render: <StatusBar backgroundColor="blue" translucent /> // manual: use edge-to-edge layout

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Text>Hello, world!</Text>
      <VideoPlayer />
      <StatusBar backgroundColor="blue" translucent />
    </SafeAreaView>
  );
}