import React from "react";
import { View, Text, Button } from "react-native";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

export function AudioControls() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingState = useAudioRecorderState(recorder);

  const startListening = async () => {
    const permissions = await requestRecordingPermissionsAsync();
    if (permissions.status !== "granted") {
      console.warn("Microphone permission not granted");
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    if (!recorder) {
      console.warn("Recorder not ready");
      return;
    }

    await recorder.prepareToRecordAsync();
    await recorder.record();
    console.log("Started listening");
  };

  const stopListening = async () => {
    if (!recorder) {
      console.warn("Recorder not ready");
      return;
    }

    try {
      await recorder.stop();
      console.log("Stopped listening");
    } catch (error) {
      console.warn("Failed to stop recorder", error);
    }
  };

  return (
    <View>
      <Button
        title={recordingState.isRecording ? "Stop Listening" : "Start Listening"}
        onPress={recordingState.isRecording ? stopListening : startListening}
      />
      <Text>Listening: {recordingState.isRecording ? "Yes" : "No"}</Text>
      <Text>
        Duration: {Math.round(((recordingState.durationMillis ?? 0) as number) / 1000)}s
      </Text>
    </View>
  );
}
