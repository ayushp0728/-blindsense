import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from "react-native";
import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";

const AnchorModule = requireNativeModule("AnchorModule");
const ARView = requireNativeViewManager("AnchorModule");

export default function HomeScreen() {
  const [vector, setVector] = useState<any>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const PYTHON_WS_URL = "ws://192.168.1.50:8765"; 

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

  const getTurnInstruction = (delta: number) => {
    if (Math.abs(delta) < 12) return { text: "GO STRAIGHT", color: "#4CAF50", arrow: "↑" };
    return delta > 0 
      ? { text: `TURN RIGHT ${delta.toFixed(0)}°`, color: "#FF9800", arrow: "→" }
      : { text: `TURN LEFT ${Math.abs(delta).toFixed(0)}°`, color: "#FF9800", arrow: "←" };
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* BACKGROUND: NATIVE AR CAMERA */}
      {sessionStarted ? (
        <ARView style={StyleSheet.absoluteFill} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>INITIALIZING AR SYSTEM...</Text>
        </View>
      )}

      {/* FOREGROUND: LANDSCAPE HUD OVERLAY */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        
        {/* LEFT PANEL: SYSTEM CONTROLS */}
        <View style={styles.sidePanelLeft}>
          {!sessionStarted ? (
            <TouchableOpacity style={styles.sideButton} onPress={handleStartSession}>
              <Text style={styles.sideButtonText}>START</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={[styles.sideButton, { backgroundColor: '#4CAF50' }]} onPress={handleSaveAnchor}>
                <Text style={styles.sideButtonText}>SAVE</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sideButton, { backgroundColor: isStreaming ? '#F44336' : '#2196F3', marginTop: 15 }]} 
                onPress={toggleStream}
              >
                <Text style={styles.sideButtonText}>{isStreaming ? "LIVE" : "STREAM"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exitButton} onPress={handleStopSession}>
                <Text style={styles.exitText}>QUIT</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* CENTER SECTION: GUIDANCE (MINIMAL) */}
        <View style={styles.centerHud} pointerEvents="none">
          {vector && (
            <View style={styles.guidanceOverlay}>
              <Text style={[styles.arrow, { color: getTurnInstruction(vector.headingDelta).color }]}>
                {getTurnInstruction(vector.headingDelta).arrow}
              </Text>
              <Text style={styles.instructionText}>
                {getTurnInstruction(vector.headingDelta).text}
              </Text>
              <Text style={styles.distanceText}>{vector.distance?.toFixed(1)}m</Text>
            </View>
          )}
        </View>

        {/* RIGHT PANEL: TELEMETRY */}
        <View style={styles.sidePanelRight}>
          <View style={styles.telemetryBox}>
            <Text style={styles.telemetryTitle}>TELEMETRY</Text>
            <View style={styles.separator} />
            {vector ? (
              <>
                <Text style={styles.telemetryText}>DX: {vector.dx?.toFixed(2)}</Text>
                <Text style={styles.telemetryText}>DZ: {vector.dz?.toFixed(2)}</Text>
                <Text style={styles.telemetryText}>HEAD: {vector.currentHeading?.toFixed(0)}°</Text>
              </>
            ) : (
              <Text style={styles.telemetryText}>NO DATA</Text>
            )}
          </View>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#007AFF',
    fontWeight: 'bold',
    letterSpacing: 4,
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    flexDirection: 'row', // Horizontal layout for landscape
    justifyContent: 'space-between',
  },
  sidePanelLeft: {
    width: 100,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 20,
  },
  sidePanelRight: {
    width: 140,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  centerHud: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guidanceOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 20,
    borderRadius: 100, // Circular HUD
    width: 180,
    height: 180,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  arrow: {
    fontSize: 50,
    fontWeight: 'bold',
    lineHeight: 50,
  },
  instructionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 4,
  },
  distanceText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '200',
  },
  sideButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  sideButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  exitButton: {
    marginTop: 40,
  },
  exitText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  telemetryBox: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  telemetryTitle: {
    color: '#007AFF',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
  },
  telemetryText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Courier', // Monospace looks more "technical"
    marginBottom: 2,
  },
});