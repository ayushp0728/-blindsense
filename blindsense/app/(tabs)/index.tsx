import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from "react-native";
import {
  requireNativeModule,
  requireNativeViewManager,
} from "expo-modules-core";

import { startListeningFor5Seconds } from "./AudioControls";
import { AudioControls } from "./AudioControls";

// Native Modules
const AnchorModule = requireNativeModule("AnchorModule");
const VolumeButtonModule = requireNativeModule("VolumeButtonModule");

// Native View
const ARView = requireNativeViewManager("ARCameraView");

export default function HomeScreen() {
  const [vector, setVector] = useState<any>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const PYTHON_WS_URL = "ws://192.168.1.50:8765";

  /* ----------------------------------------
     Poll Anchor Vectors
  ---------------------------------------- */

  useEffect(() => {
    let interval: any;

    if (sessionStarted) {
      interval = setInterval(async () => {
        try {
          const v = await AnchorModule.getVectorToAnchor();
          setVector(v);
        } catch (e) {
          console.error("Error fetching vector:", e);
        }
      }, 300);
    }

    return () => clearInterval(interval);
  }, [sessionStarted]);

  /* ----------------------------------------
     HARDWARE VOLUME → MIC
  ---------------------------------------- */

  useEffect(() => {
    VolumeButtonModule.startListeningVolume();

    const sub = VolumeButtonModule.addListener(
      "volumePressed",
      () => {
        console.log("HARDWARE VOLUME BUTTON PRESSED");
        startListeningFor5Seconds();
      }
    );

    return () => {
      sub.remove();
    };
  }, []);

  /* ----------------------------------------
     AR SESSION
  ---------------------------------------- */

  const handleStartSession = async () => {
    await AnchorModule.startSession();
    setSessionStarted(true);
  };

  const handleStopSession = async () => {
    await AnchorModule.stopSession();
    setSessionStarted(false);
    setIsStreaming(false);
    setVector(null);
  };

  const handleSaveAnchor = async () => {
    await AnchorModule.saveAnchor();
  };

  const toggleStream = async () => {
    if (isStreaming) {
      await AnchorModule.stopStream();
      setIsStreaming(false);
    } else {
      await AnchorModule.startStream(PYTHON_WS_URL, 15);
      setIsStreaming(true);
    }
  };

  /* ----------------------------------------
     UI MAPPING
  ---------------------------------------- */

  const getUIConfig = (v: any) => {
    if (!v) return { text: "NO ANCHOR", color: "#666", arrow: "•" };

    switch (v.instruction) {
      case "FORWARD":
        return { text: "WALK FORWARD", color: "#4CAF50", arrow: "↑" };
      case "BACKWARD":
        return { text: "WALK BACKWARD", color: "#F44336", arrow: "↓" };
      case "LOOK_RIGHT":
        return { text: "TURN RIGHT", color: "#FF9800", arrow: "→" };
      case "LOOK_LEFT":
        return { text: "TURN LEFT", color: "#FF9800", arrow: "←" };
      case "ARRIVED_AND_ALIGNED":
        return { text: "ALIGNED & ARRIVED", color: "#00E5FF", arrow: "🎯" };
      default:
        return { text: "STAY", color: "#FFF", arrow: "•" };
    }
  };

  const ui = getUIConfig(vector);

  /* ----------------------------------------
     RENDER
  ---------------------------------------- */

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* Hidden Audio Initializer */}
      <View style={{ display: "none" }}>
        <AudioControls />
      </View>

      {sessionStarted ? (
        <ARView style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            INITIALIZING AR SYSTEM...
          </Text>
        </View>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* LEFT PANEL */}
        <View style={styles.sidePanelLeft}>
          {!sessionStarted ? (
            <TouchableOpacity
              style={styles.sideButton}
              onPress={handleStartSession}
            >
              <Text style={styles.sideButtonText}>START</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.sideButton,
                  { backgroundColor: "#4CAF50" },
                ]}
                onPress={handleSaveAnchor}
              >
                <Text style={styles.sideButtonText}>SAVE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sideButton,
                  {
                    backgroundColor: isStreaming
                      ? "#F44336"
                      : "#2196F3",
                    marginTop: 15,
                  },
                ]}
                onPress={toggleStream}
              >
                <Text style={styles.sideButtonText}>
                  {isStreaming ? "LIVE" : "STREAM"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.exitButton}
                onPress={handleStopSession}
              >
                <Text style={styles.exitText}>QUIT</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* CENTER HUD */}
        <View style={styles.centerHud} pointerEvents="none">
          {vector && (
            <View
              style={[
                styles.guidanceOverlay,
                { borderColor: ui.color },
              ]}
            >
              <Text style={[styles.arrow, { color: ui.color }]}>
                {ui.arrow}
              </Text>
              <Text style={styles.instructionText}>{ui.text}</Text>
              <Text style={styles.distanceText}>
                {vector.distance?.toFixed(1)}m
              </Text>
            </View>
          )}
        </View>

        {/* RIGHT PANEL */}
        <View style={styles.sidePanelRight}>
          <View style={styles.telemetryBox}>
            <Text style={styles.telemetryTitle}>LOCAL COORDS</Text>
            <View style={styles.separator} />
            {vector ? (
              <>
                <Text style={styles.telemetryText}>
                  REL X: {vector.localX?.toFixed(2)}
                </Text>
                <Text style={styles.telemetryText}>
                  REL Z: {vector.localZ?.toFixed(2)}
                </Text>
                <Text style={styles.telemetryText}>
                  H_ERR: {vector.headingDelta?.toFixed(0)}°
                </Text>
              </>
            ) : (
              <Text style={styles.telemetryText}>NO ANCHOR</Text>
            )}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

/* ----------------------------------------
   STYLES
---------------------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#050505",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#007AFF",
    fontWeight: "bold",
    letterSpacing: 4,
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sidePanelLeft: {
    width: 100,
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 20,
  },
  sidePanelRight: {
    width: 140,
    justifyContent: "center",
    alignItems: "flex-end",
    paddingRight: 20,
  },
  centerHud: { flex: 1, justifyContent: "center", alignItems: "center" },
  guidanceOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
    borderRadius: 100,
    width: 200,
    height: 200,
    justifyContent: "center",
    borderWidth: 2,
  },
  arrow: { fontSize: 60, fontWeight: "bold", lineHeight: 65 },
  instructionText: {
    color: "white",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    marginVertical: 4,
  },
  distanceText: { color: "white", fontSize: 24, fontWeight: "200" },
  sideButton: {
    width: 75,
    height: 75,
    borderRadius: 40,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  sideButtonText: { color: "white", fontSize: 10, fontWeight: "bold" },
  exitButton: { marginTop: 40 },
  exitText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "bold",
    letterSpacing: 1,
  },
  telemetryBox: {
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 12,
    borderRadius: 8,
    width: "100%",
  },
  telemetryTitle: {
    color: "#007AFF",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 6,
  },
  telemetryText: {
    color: "white",
    fontSize: 10,
    fontFamily: "Courier",
    marginBottom: 2,
  },
});