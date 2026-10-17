// VideoPlayer.js - A DEPRECATED component using old Expo APIs

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView, // DEPRECATED: Importing SafeAreaView from 'react-native' is deprecated
  Button,
  Alert,
} from 'react-native';
import Constants from 'expo-constants'; // DEPRECATED: Some properties like installationId are deprecated
import { Video } from 'expo-av'; // DEPRECATED: expo-av is deprecated in favor of expo-video and expo-audio
import * as BackgroundFetch from 'expo-background-fetch'; // DEPRECATED: Use expo-background-task instead
import * as FaceDetector from 'expo-face-detector'; // DEPRECATED: Not available from SDK 51

// DEPRECATED: Using the .expo.js extension is deprecated in SDK 40+
// This file would have been named VideoPlayer.expo.js in the past

const VideoPlayer = ({ videoUri }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [video, setVideo] = useState(null);

  // DEPRECATED: Constants.installationId is deprecated and will be removed
  // See: https://docs.expo.dev/versions/latest/sdk/constants/#constantsinstallationid
  const deviceId = Constants.installationId; // ⚠️ Deprecated

  // DEPRECATED: Constants.isDevice is deprecated, moved to expo-device
  const isDevice = Constants.isDevice; // ⚠️ Deprecated

  // DEPRECATED: Constants.nativeAppVersion is deprecated, moved to expo-application
  const appVersion = Constants.nativeAppVersion; // ⚠️ Deprecated

  // DEPRECATED: Constants.platform.platform is deprecated, moved to expo-device
  const platform = Constants.platform.platform; // ⚠️ Deprecated

  useEffect(() => {
    // DEPRECATED: BackgroundFetch.registerTaskAsync is deprecated
    // Use registerTaskAsync from expo-background-task instead
    const registerBackgroundTask = async () => {
      try {
        await BackgroundFetch.registerTaskAsync('fetch-task', {
          minimumInterval: 60,
        });
      } catch (error) {
        console.error('Background fetch registration failed:', error);
      }
    };

    // DEPRECATED: FaceDetector is deprecated and not available from SDK 51
    // Use react-native-vision-camera instead
    const detectFaces = async () => {
      try {
        const { faces } = await FaceDetector.detectFacesAsync(imageUri);
        console.log('Faces detected:', faces);
      } catch (error) {
        console.error('Face detection failed:', error);
      }
    };

    registerBackgroundTask();
  }, []);

  const togglePlayback = async () => {
    if (video) {
      if (isPlaying) {
        await video.pauseAsync();
      } else {
        await video.playAsync();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // DEPRECATED: Using Video component from expo-av is deprecated
  // Use VideoView from expo-video instead
  return (
    // DEPRECATED: SafeAreaView from 'react-native' is deprecated
    // Use SafeAreaView from 'react-native-safe-area-context' instead
    <SafeAreaView style={styles.container}>
      <View style={styles.videoContainer}>
        <Video
          ref={setVideo}
          source={{ uri: videoUri }}
          rate={1.0}
          volume={1.0}
          isMuted={false}
          resizeMode="cover"
          shouldPlay={false}
          style={styles.video}
        />
      </View>

      <View style={styles.controls}>
        <Button
          title={isPlaying ? 'Pause' : 'Play'}
          onPress={togglePlayback}
        />
        <Text style={styles.deviceInfo}>
          Device ID: {deviceId} {/* DEPRECATED */}
        </Text>
        <Text style={styles.deviceInfo}>
          App Version: {appVersion} {/* DEPRECATED */}
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: 300,
  },
  controls: {
    padding: 20,
    backgroundColor: '#222',
  },
  deviceInfo: {
    color: '#fff',
    fontSize: 12,
    marginTop: 5,
  },
});

export default VideoPlayer;