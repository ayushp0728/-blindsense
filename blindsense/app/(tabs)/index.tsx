import { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import { requireNativeViewManager } from "expo-modules-core";


const AnchorModule = requireNativeModule("AnchorModule");
const AnchorView = requireNativeViewManager("AnchorModule");

export default function HomeScreen() {

  const [vector, setVector] = useState<any>(null);
  const [sessionStarted, setSessionStarted] = useState(false);

  useEffect(() => {
    let interval: any;

    if (sessionStarted) {
      interval = setInterval(async () => {
        const v = await AnchorModule.getVectorToAnchor();
        setVector(v);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [sessionStarted]);

  const startSession = async () => {
    await AnchorModule.startSession();
    setSessionStarted(true);
    console.log("SESSION STARTED");
  };

  const stopSession = async () => {
    await AnchorModule.stopSession();
    setSessionStarted(false);
    setVector(null);
    console.log("SESSION STOPPED");
  };

  const saveAnchor = async () => {
    await AnchorModule.saveAnchor();
    console.log("ANCHOR SAVED");
  };

  // Convert heading delta to simple instruction
  const getTurnInstruction = (delta: number) => {
    if (Math.abs(delta) < 10) return "Facing correct direction";
    if (delta > 0) return `Turn RIGHT ${delta.toFixed(0)}°`;
    return `Turn LEFT ${Math.abs(delta).toFixed(0)}°`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Anchor Navigation Test</Text>

      <Button title="Start Session" onPress={startSession} />
      <Button title="Save Anchor Here" onPress={saveAnchor} />
      <Button title="Stop Session" onPress={stopSession} />

      {vector && (
        <View style={styles.vectorBox}>
          <AnchorView style={{ flex: 1 }} />

          <View style={styles.overlay}>
            {/* Your buttons & vector UI */}
          </View>
          <Text>Distance: {vector.distance?.toFixed(2)} m</Text>

          <Text>dx: {vector.dx?.toFixed(2)}</Text>
          <Text>dy: {vector.dy?.toFixed(2)}</Text>
          <Text>dz: {vector.dz?.toFixed(2)}</Text>

          <Text>Current Heading: {vector.currentHeading?.toFixed(0)}°</Text>
          <Text>Anchor Heading: {vector.anchorHeading?.toFixed(0)}°</Text>
          <Text>Heading Delta: {vector.headingDelta?.toFixed(0)}°</Text>

          <Text style={{ marginTop: 10, fontWeight: "bold" }}>
            {getTurnInstruction(vector.headingDelta)}
          </Text>

          
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 22,
    marginBottom: 20,
  },
  vectorBox: {
    marginTop: 20,
    padding: 15,
    backgroundColor: "#eee",
  },
  overlay: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 16,
    borderRadius: 12
  }
});