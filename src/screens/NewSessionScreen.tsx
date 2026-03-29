import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { games } from '../data/games';
import { GameDefinition } from '../types/game';
import { NewSessionScreenProps } from '../types/navigation';

export function NewSessionScreen({ navigation }: NewSessionScreenProps) {
  const [selectedGameId, setSelectedGameId] = useState(games[0].id);
  const [playersText, setPlayersText] = useState('Alice\nBob');

  const selectedGame = useMemo<GameDefinition>(() => {
    return games.find((game) => game.id === selectedGameId) ?? games[0];
  }, [selectedGameId]);

  const parsedPlayers = playersText
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

  const isValidPlayerCount =
    parsedPlayers.length >= selectedGame.minPlayers && parsedPlayers.length <= selectedGame.maxPlayers;

  const handleStart = () => {
    if (!isValidPlayerCount) {
      return;
    }

    if (selectedGame.id === 'take-5') {
      navigation.navigate('Take5Session', { players: parsedPlayers });
      return;
    }

    navigation.navigate('PickominoSession', { players: parsedPlayers });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>New Session</Text>
      <Text style={styles.subtitle}>Choose a game and add one player per line.</Text>

      <Text style={styles.sectionLabel}>Game</Text>
      <View style={styles.cardGroup}>
        {games.map((game) => {
          const selected = game.id === selectedGame.id;
          return (
            <Pressable
              key={game.id}
              style={[styles.gameCard, selected ? styles.gameCardSelected : null]}
              onPress={() => setSelectedGameId(game.id)}
            >
              <Text style={styles.gameName}>{game.name}</Text>
              <Text style={styles.gameMeta}>
                {game.scoreMode === 'per-round' ? 'Per-round scoring' : 'Total score only'}
              </Text>
              <Text style={styles.gameMeta}>
                {game.minPlayers} to {game.maxPlayers} players
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Players (one per line)</Text>
      <TextInput
        style={styles.playersInput}
        multiline
        autoCapitalize="words"
        value={playersText}
        onChangeText={setPlayersText}
      />

      <Text style={styles.validationText}>
        {isValidPlayerCount
          ? `Ready: ${parsedPlayers.length} players`
          : `Needs ${selectedGame.minPlayers}-${selectedGame.maxPlayers} players`}
      </Text>

      <Pressable
        style={[styles.startButton, !isValidPlayerCount ? styles.startButtonDisabled : null]}
        onPress={handleStart}
        disabled={!isValidPlayerCount}
      >
        <Text style={styles.startButtonText}>Start Session</Text>
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
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#14213D',
  },
  subtitle: {
    marginTop: 8,
    color: '#24324F',
    fontSize: 15,
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 10,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    color: '#8E4D0E',
  },
  cardGroup: {
    gap: 10,
  },
  gameCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  gameCardSelected: {
    borderColor: '#1F6FEB',
    borderWidth: 2,
  },
  gameName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#14213D',
  },
  gameMeta: {
    marginTop: 3,
    color: '#3A4A6A',
    fontSize: 14,
  },
  playersInput: {
    minHeight: 120,
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  validationText: {
    marginTop: 8,
    color: '#3A4A6A',
  },
  startButton: {
    marginTop: 18,
    backgroundColor: '#1F6FEB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
