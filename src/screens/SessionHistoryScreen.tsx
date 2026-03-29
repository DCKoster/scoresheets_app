import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSessions } from '../context/SessionContext';
import { rankByHighestScore, rankByLowestScore } from '../utils/scoring';

export function SessionHistoryScreen() {
  const { sessions, isLoading, deleteSession } = useSessions();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Session History</Text>
        <Text style={styles.body}>Loading saved sessions...</Text>
      </View>
    );
  }

  const handleDelete = (sessionId: string) => {
    Alert.alert('Delete session', 'Are you sure you want to remove this session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteSession(sessionId);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Session History</Text>
      {sessions.length === 0 ? <Text style={styles.body}>No saved sessions yet.</Text> : null}

      {sessions.map((session) => {
        const ranked =
          session.gameId === 'take-5'
            ? rankByLowestScore(session.totals)
            : rankByHighestScore(session.totals);
        const winner = ranked[0];

        return (
          <View key={session.id} style={styles.sessionCard}>
            <Text style={styles.gameName}>{session.gameName}</Text>
            <Text style={styles.metaText}>{new Date(session.createdAt).toLocaleString()}</Text>
            <Text style={styles.metaText}>Players: {session.players.join(', ')}</Text>
            {winner ? (
              <Text style={styles.winnerText}>
                Winner: {winner.player} ({winner.score})
              </Text>
            ) : null}

            <Pressable style={styles.deleteButton} onPress={() => handleDelete(session.id)}>
              <Text style={styles.deleteButtonText}>Delete</Text>
            </Pressable>
          </View>
        );
      })}
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
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#14213D',
  },
  body: {
    marginTop: 12,
    fontSize: 16,
    color: '#24324F',
    lineHeight: 24,
  },
  sessionCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 6,
  },
  gameName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14213D',
  },
  metaText: {
    color: '#3A4A6A',
    fontSize: 14,
  },
  winnerText: {
    marginTop: 4,
    color: '#127A4A',
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BE123C',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: '#BE123C',
    fontWeight: '700',
  },
});
