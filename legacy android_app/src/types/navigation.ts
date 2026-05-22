import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Home: undefined;
  NewSession: undefined;
  Take5Session: { players: string[] };
  PickominoSession: { players: string[] };
  SessionHistory: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type NewSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'NewSession'>;
export type Take5SessionScreenProps = NativeStackScreenProps<RootStackParamList, 'Take5Session'>;
export type PickominoSessionScreenProps = NativeStackScreenProps<RootStackParamList, 'PickominoSession'>;
export type SessionHistoryScreenProps = NativeStackScreenProps<RootStackParamList, 'SessionHistory'>;
