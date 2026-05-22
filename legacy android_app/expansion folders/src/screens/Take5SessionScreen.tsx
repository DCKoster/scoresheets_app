import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSessions } from '../context/SessionContext';
import { calculateTake5Totals, rankByLowestScore } from '../utils/scoring';
import { RoundScores } from '../types/session';
import { Take5SessionScreenProps } from '../types/navigation';

export function Take5SessionScreen({ route, navigation }: Take5SessionScreenProps) {
  const { players } = route.params;
  const { saveTake5Session } = useSessions();

  const [roundDraft, setRoundDraft] = useState<Record<string, string>>(
    Object.fromEntries(players.map((player) => [player, '']))
  );
  const [rounds, setRounds] = useState<RoundScores[]>([]);

  const totals = useMemo(() => calculateTake5Totals(players, rounds), [players, rounds]);
  const ranking = useMemo(() => rankByLowestScore(totals), [totals]);

  const addRound = () => {
    const parsedScores: Record<string, number> = {};

    for (const player of players) {
      const rawValue = roundDraft[player]?.trim() ?? '';
      if (rawValue.length === 0) {
        return;
      }
      const value = Number(rawValue);
      if (Number.isNaN(value)) {
        return;
      }
      parsedScores[player] = value;
    }

    setRounds((prev) => [
      ...prev,
      {
        roundNumber: prev.length + 1,
        scores: parsedScores,
      },
    ]);

    setRoundDraft(Object.fromEntries(players.map((player) => [player, ''])));
  };

  const saveSession = async () => {
    if (rounds.length === 0) {
      return;
    }
    await saveTake5Session(players, rounds);
    navigation.navigate('SessionHistory');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Take 5!</Text>
      <Text style={styles.subtitle}>Enter points per round. Lower total wins.</Text>

      <View style={styles.inputCard}>
        <Text style={styles.sectionTitle}>Round {rounds.length + 1}</Text>
        {players.map((player) => (
          <View key={player} style={styles.inputRow}>
            <Text style={styles.playerName}>{player}</Text>
            <TextInput
              style={styles.numberInput}
              keyboardType="numeric"
              value={roundDraft[player]}
              onChangeText={(value) => setRoundDraft((prev) => ({ ...prev, [player]: value }))}
              placeholder="0"
            />
          </View>
        ))}

        <Pressable style={styles.addButton} onPress={addRound}>
          <Text style={styles.addButtonText}>Add Round</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Totals</Text>
        {ranking.map((item, index) => (
          <View key={item.player} style={styles.totalRow}>
            <Text style={styles.totalRank}>{index + 1}.</Text>
            <Text style={styles.totalPlayer}>{item.player}</Text>
            <Text style={styles.totalScore}>{item.score}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Rounds</Text>
        {rounds.length === 0 ? <Text style={styles.emptyText}>No rounds yet</Text> : null}
        {rounds.map((round) => (
          <View key={round.roundNumber} style={styles.roundRow}>
            <Text style={styles.roundLabel}>R{round.roundNumber}</Text>
            <Text style={styles.roundScores}>
              {players.map((player) => `${player}: ${round.scores[player] ?? 0}`).join(' | ')}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.saveSessionButton, rounds.length === 0 ? styles.saveSessionDisabled : null]}
        onPress={saveSession}
        disabled={rounds.length === 0}
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
  addButton: {
    marginTop: 6,
    backgroundColor: '#1F6FEB',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
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
  emptyText: {
    color: '#6B7280',
  },
  roundRow: {
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  roundLabel: {
    color: '#8E4D0E',
    fontWeight: '700',
  },
  roundScores: {
    marginTop: 2,
    color: '#24324F',
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
