import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeScreenProps } from '../types/navigation';

export function HomeScreen({ navigation }: HomeScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>Scoresheets</Text>
      <Text style={styles.title}>Offline Score Tracker</Text>
      <Text style={styles.subtitle}>Track Take 5! and Pick-omino scores on your Android phone.</Text>

      <View style={styles.buttonStack}>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('NewSession')}>
          <Text style={styles.primaryButtonText}>Start New Session</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('SessionHistory')}>
          <Text style={styles.secondaryButtonText}>Session History</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F4ED',
    paddingHorizontal: 20,
    paddingTop: 52,
  },
  kicker: {
    color: '#8E4D0E',
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  title: {
    marginTop: 8,
    color: '#14213D',
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 12,
    color: '#1E2A44',
    fontSize: 16,
    lineHeight: 24,
  },
  buttonStack: {
    marginTop: 36,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#1F6FEB',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    borderColor: '#14213D',
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#14213D',
    fontWeight: '700',
    fontSize: 16,
  },
});
