import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { NewSessionScreen } from '../screens/NewSessionScreen';
import { PickominoSessionScreen } from '../screens/PickominoSessionScreen';
import { SessionHistoryScreen } from '../screens/SessionHistoryScreen';
import { Take5SessionScreen } from '../screens/Take5SessionScreen';
import { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#14213D' },
          headerTintColor: '#F7FAFC',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#F6F4ED' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Scoresheets' }} />
        <Stack.Screen name="NewSession" component={NewSessionScreen} options={{ title: 'New Session' }} />
        <Stack.Screen name="Take5Session" component={Take5SessionScreen} options={{ title: 'Take 5!' }} />
        <Stack.Screen
          name="PickominoSession"
          component={PickominoSessionScreen}
          options={{ title: 'Pick-omino' }}
        />
        <Stack.Screen
          name="SessionHistory"
          component={SessionHistoryScreen}
          options={{ title: 'Session History' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
