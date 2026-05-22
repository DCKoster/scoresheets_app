import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { RoundScores, StoredSession } from '../types/session';
import { calculateTake5Totals } from '../utils/scoring';

const STORAGE_KEY = 'scoresheets-sessions-v1';

interface SessionContextValue {
  sessions: StoredSession[];
  isLoading: boolean;
  saveTake5Session: (players: string[], rounds: RoundScores[]) => Promise<void>;
  savePickominoSession: (players: string[], totals: Record<string, number>) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function createSessionId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          setSessions([]);
          return;
        }
        const parsed = JSON.parse(raw) as StoredSession[];
        setSessions(parsed);
      } finally {
        setIsLoading(false);
      }
    }

    void loadSessions();
  }, []);

  const saveTake5Session = async (players: string[], rounds: RoundScores[]) => {
    const totals = calculateTake5Totals(players, rounds);
    const newSession: StoredSession = {
      id: createSessionId(),
      gameId: 'take-5',
      gameName: 'Take 5!',
      createdAt: new Date().toISOString(),
      players,
      rounds,
      totals,
    };

    setSessions((previous) => {
      const next = [newSession, ...previous];
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const savePickominoSession = async (players: string[], totals: Record<string, number>) => {
    const newSession: StoredSession = {
      id: createSessionId(),
      gameId: 'pick-omino',
      gameName: 'Pick-omino',
      createdAt: new Date().toISOString(),
      players,
      totals,
    };

    setSessions((previous) => {
      const next = [newSession, ...previous];
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const deleteSession = async (sessionId: string) => {
    setSessions((previous) => {
      const next = previous.filter((session) => session.id !== sessionId);
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo<SessionContextValue>(
    () => ({ sessions, isLoading, saveTake5Session, savePickominoSession, deleteSession }),
    [sessions, isLoading]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessions must be used within SessionProvider');
  }
  return context;
}
