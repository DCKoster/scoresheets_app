import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSessions } from '../context/SessionContext';
import { PickominoSessionScreenProps } from '../types/navigation';
import { rankByHighestScore } from '../utils/scoring';

export function PickominoSessionScreen({ route, navigation }: PickominoSessionScreenProps) {
  const { players } = route.params;
  const { savePickominoSession } = useSessions();
  const [totalsDraft, setTotalsDraft] = useState<Record<string, string>>(
    Object.fromEntries(players.map((player) => [player, '']))
  );
  const [savedTotals, setSavedTotals] = useState<Record<string, number>>({});

  const ranking = useMemo(() => rankByHighestScore(savedTotals), [savedTotals]);

  const saveTotals = () => {
    const parsed: Record<string, number> = {};

    for (const player of players) {
      const value = Number(totalsDraft[player] ?? '');
      if (Number.isNaN(value)) {
        return;
      }
      parsed[player] = value;
    }

    setSavedTotals(parsed);
  };

  const saveSession = async () => {
    if (Object.keys(savedTotals).length === 0) {
      return;
    }
    await savePickominoSession(players, savedTotals);
    navigation.navigate('SessionHistory');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Pick-omino</Text>
      <Text style={styles.subtitle}>Enter final total score per player. Highest total wins.</Text>

      <View style={styles.inputCard}>
        <Text style={styles.sectionTitle}>Totals</Text>
        {players.map((player) => (
          <View key={player} style={styles.inputRow}>
            <Text style={styles.playerName}>{player}</Text>
            <TextInput
              style={styles.numberInput}
              keyboardType="numeric"
              value={totalsDraft[player]}
              onChangeText={(value) => setTotalsDraft((prev) => ({ ...prev, [player]: value }))}
              placeholder="0"
            />
          </View>
        ))}

        <Pressable style={styles.saveButton} onPress={saveTotals}>
          <Text style={styles.saveButtonText}>Save Totals</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Ranking</Text>
        {ranking.length === 0 ? <Text style={styles.emptyText}>No saved totals yet</Text> : null}
        {ranking.map((item, index) => (
          <View key={item.player} style={styles.totalRow}>
            <Text style={styles.totalRank}>{index + 1}.</Text>
            <Text style={styles.totalPlayer}>{item.player}</Text>
            <Text style={styles.totalScore}>{item.score}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.saveSessionButton, ranking.length === 0 ? styles.saveSessionDisabled : null]}
        onPress={saveSession}
        disabled={ranking.length === 0}
      >
        <Text style={styles.saveSessionButtonText}>Save Session</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F4ED',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
    gap: 14,
  },
  title: {
    fontSize: 30,
    color: '#14213D',
    fontWeight: '800',
  },
  subtitle: {
    color: '#3A4A6A',
    marginTop: -4,
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14213D',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  playerName: {
    flex: 1,
    fontSize: 16,
    color: '#14213D',
    fontWeight: '600',
  },
  numberInput: {
    width: 90,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FDFDFD',
    textAlign: 'right',
    fontSize: 16,
  },
  saveButton: {
    marginTop: 6,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 14,
    gap: 10,
  },
  emptyText: {
    color: '#6B7280',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalRank: {
    width: 26,
    color: '#8E4D0E',
    fontWeight: '700',
  },
  totalPlayer: {
    flex: 1,
    color: '#14213D',
    fontSize: 15,
  },
  totalScore: {
    color: '#14213D',
    fontWeight: '700',
    fontSize: 16,
  },
  saveSessionButton: {
    backgroundColor: '#127A4A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveSessionDisabled: {
    opacity: 0.45,
  },
  saveSessionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
