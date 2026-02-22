import React, { useRef } from "react";
import { View, Text, Button } from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

/* ============================================================
   SHARED CONTROLLER
============================================================ */

let sharedStartFn: (() => Promise<void>) | null = null;

export async function startListeningFor5Seconds() {
  if (!sharedStartFn) {
    console.warn("Audio recorder not initialized yet");
    return;
  }
  await sharedStartFn();
}

/* ============================================================
   COMPONENT
============================================================ */

export function AudioControls() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingState = useAudioRecorderState(recorder);
  const stopTimerRef = useRef<number | null>(null);

  // Register internal implementation once
  if (!sharedStartFn) {
    sharedStartFn = async () => {
      const permissions = await requestRecordingPermissionsAsync();
      if (permissions.status !== "granted") {
        console.warn("Microphone permission not granted");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      if (!recorder || recordingState.isRecording) {
        return;
      }

      try {
        await recorder.prepareToRecordAsync();
        await recorder.record();
        console.log("Started listening");

        stopTimerRef.current = setTimeout(async () => {
          try {
            await recorder.stop();
            console.log("Stopped listening (auto)");
          } catch (e) {
            console.warn("Failed to stop recorder", e);
          }
        }, 5000);
      } catch (e) {
        console.warn("Failed to start recorder", e);
      }
    };
  }

  return (
    <View>
      <Button
        title={recordingState.isRecording ? "Listening..." : "Start Listening (5s)"}
        disabled={recordingState.isRecording}
        onPress={startListeningFor5Seconds}
      />

      <Text>Listening: {recordingState.isRecording ? "Yes" : "No"}</Text>

      <Text>
        Duration:{" "}
        {Math.round(((recordingState.durationMillis ?? 0) as number) / 1000)}s
      </Text>
    </View>
  );
}