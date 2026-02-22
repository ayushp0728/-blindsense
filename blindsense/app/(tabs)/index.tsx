import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from "react-native";
import {
  requireNativeModule,
  requireNativeViewManager,
} from "expo-modules-core";

const AnchorModule = requireNativeModule("AnchorModule");
const ARView = requireNativeViewManager("AnchorModule");

// --- Helper Function ---
const getUIConfig = (v: any) => {
  if (!v) return { text: "NO ANCHOR", color: "#666", arrow: "•" };
  switch (v.instruction) {
    case "FORWARD": return { text: "WALK FORWARD", color: "#4CAF50", arrow: "↑" };
    case "BACKWARD": return { text: "WALK BACKWARD", color: "#F44336", arrow: "↓" };
    case "LOOK_RIGHT": return { text: "TURN RIGHT", color: "#FF9800", arrow: "→" };
    case "LOOK_LEFT": return { text: "TURN LEFT", color: "#FF9800", arrow: "←" };
    case "ARRIVED_AND_ALIGNED": return { text: "ALIGNED & ARRIVED", color: "#00E5FF", arrow: "🎯" };
    default: return { text: "STAY", color: "#FFF", arrow: "•" };
  }
};

export default function HomeScreen() {
  const [vector, setVector] = useState<any>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  // 🔹 LOGGING STATES
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  const [detectedObjects, setDetectedObjects] = useState<any[]>([]);

  // 🔹 YOUR HTTP API URL (Must match Swift's POST request)
  const PYTHON_API_URL = "https://marilu-eradicative-loreta.ngrok-free.dev/cv/detect";

  // --- 🔹 LOGGING HELPER ---
  const addLog = (msg: string) => {
    console.log(msg);
    setStatusLogs((prev) => [msg, ...prev].slice(0, 10)); // Keep last 10 logs
  };

  useEffect(() => {
  // 1. Initialize volume button observation
    AnchorModule.activateVolumeTracker();

    // 2. Add listener to log to terminal and UI
    const sub = AnchorModule.addListener("onVolumeButtonPress", (event: any) => {
      const { direction, volume } = event;
      console.log(`[PHYSICAL BUTTON] ${direction} pressed. Current volume: ${volume}`);
      
      // You can now trigger your accessibility logic here
      if (direction === "UP") {
        // Logic for Mode A
      } else {
        // Logic for Mode B
      }
  });

    return () => sub.remove();
  }, []);

  // --- 🔹 NATIVE EVENT LISTENERS ---
  useEffect(() => {
    // 1. Listen for Frame Upload Status from Swift
    const statusSub = AnchorModule.addListener("onStreamStatus", (event: any) => {
      addLog(`[STREAM]: ${event.status}`);
    });

    // 2. Listen for processed AI Results from Swift (after HTTP response)
    const objectSub = AnchorModule.addListener("onObjectsDetected", (event: any) => {
        addLog(`[AI]: Found ${event.objects.length} objects`);
        setDetectedObjects(event.objects);
        
        // Detailed log of distances
        event.objects.forEach((obj: any) => {
            addLog(`>> ${obj.label}: ${obj.distance.toFixed(2)}m`);
        });
    });

    return () => {
      statusSub.remove();
      objectSub.remove();
    };
  }, []);

  // ---------- Navigation Polling ----------
  useEffect(() => {
    let interval: any;
    if (sessionStarted) {
      interval = setInterval(async () => {
        try {
          const v = await AnchorModule.getVectorToAnchor();
          setVector(v);
        } catch (e) {
          addLog(`[ERR]: Vector fail: ${e}`);
        }
      }, 300);
    }
    return () => clearInterval(interval);
  }, [sessionStarted]);

  const handleStartSession = async () => {
    addLog("Starting AR Session...");
    await AnchorModule.startSession();
    setSessionStarted(true);
  };

  const handleStopSession = async () => {
    addLog("Stopping AR Session...");
    await AnchorModule.stopSession();
    setSessionStarted(false);
    setIsStreaming(false);
    setVector(null);
    setDetectedObjects([]);
  };

  const handleSaveAnchor = async () => {
    addLog("Anchor Saved.");
    await AnchorModule.saveAnchor();
  };

  const toggleStream = async () => {
    if (isStreaming) {
      await AnchorModule.stopStream();
      setIsStreaming(false);
    } else {
      // 0.2 FPS = 1 frame every 5 seconds
      await AnchorModule.startStream(PYTHON_API_URL, 1); 
      setIsStreaming(true);
    }
  };

  const ui = getUIConfig(vector);

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {sessionStarted ? (
        <ARView style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>SYSTEM OFFLINE</Text>
        </View>
      )}

      {/* 🔹 LOGGING CONSOLE (TOP LEFT) */}
      <SafeAreaView style={styles.logContainer} pointerEvents="none">
        {statusLogs.map((log, i) => (
          <Text key={i} style={[styles.logText, { opacity: 1 - i * 0.1 }]}>
            {log}
          </Text>
        ))}
      </SafeAreaView>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.sidePanelLeft}>
          {!sessionStarted ? (
            <TouchableOpacity style={styles.sideButton} onPress={handleStartSession}>
              <Text style={styles.sideButtonText}>POWER</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={[styles.sideButton, { backgroundColor: "#4CAF50" }]} onPress={handleSaveAnchor}>
                <Text style={styles.sideButtonText}>ANCHOR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideButton, { backgroundColor: isStreaming ? "#F44336" : "#2196F3", marginTop: 15 }]}
                onPress={toggleStream}
              >
                <Text style={styles.sideButtonText}>{isStreaming ? "SENDING" : "STREAM"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exitButton} onPress={handleStopSession}>
                <Text style={styles.exitText}>RESET</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.centerHud} pointerEvents="none">
          {vector && (
            <View style={[styles.guidanceOverlay, { borderColor: ui.color }]}>
              <Text style={[styles.arrow, { color: ui.color }]}>{ui.arrow}</Text>
              <Text style={styles.instructionText}>{ui.text}</Text>
              <Text style={styles.distanceText}>{vector.distance?.toFixed(2)}m</Text>
            </View>
          )}
          
          {/* 🔹 DETECTED OBJECTS OVERLAY (BOTTOM) */}
          <View style={styles.objectList}>
            {detectedObjects.map((obj, i) => (
                <Text key={i} style={styles.objectItem}>
                    • {obj.label.toUpperCase()}: {obj.distance.toFixed(1)}m
                </Text>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  placeholder: { ...StyleSheet.absoluteFillObject, backgroundColor: "#050505", justifyContent: "center", alignItems: "center" },
  placeholderText: { color: "#333", letterSpacing: 4, fontSize: 14, fontWeight: 'bold' },
  overlay: { flex: 1, flexDirection: "row" },
  
  // LOG CONSOLE
  logContainer: { position: 'absolute', top: 50, left: 20, width: '60%', zIndex: 10 },
  logText: { color: '#00E5FF', fontSize: 10, fontFamily: 'Courier', backgroundColor: 'rgba(0,0,0,0.3)', marginBottom: 2 },

  sidePanelLeft: { width: 100, justifyContent: 'center', alignItems: 'center', paddingLeft: 20 },
  centerHud: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  guidanceOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 100,
    width: 200,
    height: 200,
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 40
  },
  arrow: { fontSize: 50, fontWeight: 'bold' },
  instructionText: { color: 'white', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  distanceText: { color: 'white', fontSize: 24, fontWeight: '300' },

  objectList: { position: 'absolute', bottom: 40, alignItems: 'center' },
  objectItem: { color: '#00E5FF', fontSize: 12, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.8)', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 4, marginVertical: 2 },

  sideButton: { width: 75, height: 75, borderRadius: 40, backgroundColor: "#222", justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  sideButtonText: { color: "white", fontSize: 10, fontWeight: 'bold' },
  exitButton: { marginTop: 40 },
  exitText: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 'bold' },
});