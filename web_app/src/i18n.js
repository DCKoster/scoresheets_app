export const SUPPORTED_LOCALES = Object.freeze(['en', 'nl']);
export const LOCALE_STORAGE_KEY = 'scoresheets-locale';

const messages = {
  en: {
    'app.title': 'Scoresheets Web',
    'app.subtitle': 'Simple Scoresheets',
    'language.label': 'Language',
    'language.switchTo': 'Switch to Dutch',
    'nav.label': 'Main views',
    'nav.home': 'Home',
    'nav.newSession': 'New Session',
    'nav.history': 'Session History',
    'nav.statistics': 'Statistics',
    'nav.games': 'Manage Games',
    'home.title': 'Home',
    'home.intro': 'Track scores for point-based games.',
    'home.empty': 'No sessions yet. Start one from New Session.',
    'home.summary.one': '{count} saved session. Most recent: {game} on {date}.',
    'home.summary.other': '{count} saved sessions. Most recent: {game} on {date}.',
    'statistics.title': 'Statistics',
    'statistics.empty': 'No completed sessions yet.',
    'statistics.sessions': 'Sessions',
    'statistics.games': 'Games',
    'statistics.players': 'Players',
    'statistics.leaderboard': 'Player leaderboard',
    'statistics.tabsLabel': 'Statistics sections',
    'statistics.tabOverview': 'Overview',
    'statistics.tabPlayers': 'Players',
    'statistics.tabGames': 'Games',
    'statistics.chooseGame': 'Choose a game',
    'statistics.gameSessions.one': '{count} saved session',
    'statistics.gameSessions.other': '{count} saved sessions',
    'statistics.rank': 'Rank',
    'statistics.player': 'Player',
    'statistics.gamesPlayed': 'Games played',
    'statistics.wins': 'Wins',
    'statistics.winRate': 'Win rate',
    'statistics.averageScore': 'Average score',
    'statistics.byGame': 'Breakdown by game',
    'statistics.gameResult': '{game}: {played} played, {wins} wins ({winRate})',
    'session.new': 'New Session',
    'session.game': 'Game',
    'session.players': 'Players (comma separated)',
    'session.start': 'Start session',
    'session.save': 'Save session',
    'session.title': '{game} session',
    'session.savedTitle': 'Saved Sessions',
    'session.noneSaved': 'No sessions saved yet.',
    'session.groupByGame': 'Group by game',
    'session.gameGroup.one': '{game} ({count} session)',
    'session.gameGroup.other': '{game} ({count} sessions)',
    'session.roundDetails': 'Round details',
    'session.round': 'Round {number}: {scores}',
    'session.rounds': 'Rounds',
    'session.noRounds': 'No rounds yet.',
    'session.totals': 'Totals',
    'session.addRound': 'Add round',
    'session.roundHelp': 'Add one round at a time.',
    'session.finalHelp': 'Enter one final total for every player.',
    'session.winnerHelp': 'Choose the winner, or record that nobody won.',
    'session.winner': 'Winner',
    'session.noWinner': 'Nobody wins',
    'session.winnerResult': 'Winner: {player}',
    'games.title': 'Manage Games',
    'games.name': 'Game name',
    'games.entryMode': 'Entry mode',
    'games.ranking': 'Ranking objective',
    'games.create': 'Create game',
    'games.saveChanges': 'Save changes',
    'games.cancel': 'Cancel',
    'games.duplicate': 'Duplicate',
    'games.edit': 'Edit',
    'games.delete': 'Delete',
    'games.deleteConfirm': 'Delete “{game}”? Saved sessions will remain available.',
    'games.engine.round-sum': 'Scores by round',
    'games.engine.final-total': 'One final total',
    'games.engine.winner-only': 'Winner only',
    'games.ranking.highest': 'Highest wins',
    'games.ranking.lowest': 'Lowest wins',
    'games.summary': '{engine}, {ranking}',
    'games.copy': '{name} copy',
    'games.copyNumber': '{name} copy {number}',
    'common.unknown': 'Unknown',
    'errors.scoreRequired': 'Every score is required.',
    'errors.scoreFinite': 'Scores must be finite numbers.',
    'errors.scoreFormula': 'Enter a valid arithmetic formula.',
    'errors.roundRequired': 'Add at least one round before saving.',
    'errors.playerScoresRequired': 'Enter a score for every player.',
    'errors.winnerRequired': 'Choose a winner or “Nobody wins”.',
    'errors.winnerInvalid': 'The selected winner must be a participant.',
    'errors.engineUnknown': 'Scoring engine “{id}” is not registered.',
    'errors.playersUnique': 'Player names must be unique.',
    'errors.playersMinimum': 'Enter at least 2 players.',
    'errors.gameInvalid': 'Invalid game selected.',
    'errors.gameNameRequired': 'Game name is required.',
    'errors.gameNameDuplicate': 'A game with that name already exists.',
    'errors.scoringEngineUnknown': 'Unknown scoring engine.',
    'errors.rankingUnknown': 'Unknown ranking objective.',
    'errors.gameNotFound': 'Game not found.',
    'errors.builtinReadOnly': 'Built-in games are read-only.',
    'errors.builtinCannotDelete': 'Built-in games cannot be deleted.',
    'errors.storedDataInvalid': 'Stored data is not a list.',
    'errors.legacyScoreInvalid': 'Legacy session contains an invalid score.',
    'errors.legacyDataInvalid': 'Legacy session data is not a list.',
    'errors.legacyPlayersInvalid': 'Legacy session has invalid players.',
    'errors.migrationVerify': 'Could not verify migrated data.',
    'errors.migration': 'Existing sessions could not be migrated: {message}',
  },
  nl: {
    'app.title': 'Scorebladen',
    'app.subtitle': 'Eenvoudige scorebladen',
    'language.label': 'Taal',
    'language.switchTo': 'Overschakelen naar Engels',
    'nav.label': 'Hoofdschermen',
    'nav.home': 'Start',
    'nav.newSession': 'Nieuwe sessie',
    'nav.history': 'Sessiegeschiedenis',
    'nav.statistics': 'Statistieken',
    'nav.games': 'Spellen beheren',
    'home.title': 'Start',
    'home.intro': 'Houd scores bij voor spellen met punten.',
    'home.empty': 'Nog geen sessies. Start er een via Nieuwe sessie.',
    'home.summary.one': '{count} opgeslagen sessie. Meest recent: {game} op {date}.',
    'home.summary.other': '{count} opgeslagen sessies. Meest recent: {game} op {date}.',
    'statistics.title': 'Statistieken',
    'statistics.empty': 'Nog geen voltooide sessies.',
    'statistics.sessions': 'Sessies',
    'statistics.games': 'Spellen',
    'statistics.players': 'Spelers',
    'statistics.leaderboard': 'Spelersranglijst',
    'statistics.tabsLabel': 'Statistiekonderdelen',
    'statistics.tabOverview': 'Overzicht',
    'statistics.tabPlayers': 'Spelers',
    'statistics.tabGames': 'Spellen',
    'statistics.chooseGame': 'Kies een spel',
    'statistics.gameSessions.one': '{count} opgeslagen sessie',
    'statistics.gameSessions.other': '{count} opgeslagen sessies',
    'statistics.rank': 'Rang',
    'statistics.player': 'Speler',
    'statistics.gamesPlayed': 'Partijen gespeeld',
    'statistics.wins': 'Overwinningen',
    'statistics.winRate': 'Winstpercentage',
    'statistics.averageScore': 'Gemiddelde score',
    'statistics.byGame': 'Uitsplitsing per spel',
    'statistics.gameResult': '{game}: {played} gespeeld, {wins} overwinningen ({winRate})',
    'session.new': 'Nieuwe sessie',
    'session.game': 'Spel',
    'session.players': "Spelers (gescheiden door komma's)",
    'session.start': 'Sessie starten',
    'session.save': 'Sessie opslaan',
    'session.title': 'Sessie {game}',
    'session.savedTitle': 'Opgeslagen sessies',
    'session.noneSaved': 'Nog geen sessies opgeslagen.',
    'session.groupByGame': 'Groeperen per spel',
    'session.gameGroup.one': '{game} ({count} sessie)',
    'session.gameGroup.other': '{game} ({count} sessies)',
    'session.roundDetails': 'Rondedetails',
    'session.round': 'Ronde {number}: {scores}',
    'session.rounds': 'Rondes',
    'session.noRounds': 'Nog geen rondes.',
    'session.totals': 'Totalen',
    'session.addRound': 'Ronde toevoegen',
    'session.roundHelp': 'Voeg één ronde tegelijk toe.',
    'session.finalHelp': 'Voer voor elke speler één eindtotaal in.',
    'session.winnerHelp': 'Kies de winnaar of geef aan dat niemand wint.',
    'session.winner': 'Winnaar',
    'session.noWinner': 'Niemand wint',
    'session.winnerResult': 'Winnaar: {player}',
    'games.title': 'Spellen beheren',
    'games.name': 'Spelnaam',
    'games.entryMode': 'Invoermethode',
    'games.ranking': 'Winvoorwaarde',
    'games.create': 'Spel maken',
    'games.saveChanges': 'Wijzigingen opslaan',
    'games.cancel': 'Annuleren',
    'games.duplicate': 'Dupliceren',
    'games.edit': 'Bewerken',
    'games.delete': 'Verwijderen',
    'games.deleteConfirm': '“{game}” verwijderen? Opgeslagen sessies blijven beschikbaar.',
    'games.engine.round-sum': 'Scores per ronde',
    'games.engine.final-total': 'Eén eindtotaal',
    'games.engine.winner-only': 'Alleen winnaar',
    'games.ranking.highest': 'Hoogste score wint',
    'games.ranking.lowest': 'Laagste score wint',
    'games.summary': '{engine}, {ranking}',
    'games.copy': 'Kopie van {name}',
    'games.copyNumber': 'Kopie {number} van {name}',
    'common.unknown': 'Onbekend',
    'errors.scoreRequired': 'Elke score is verplicht.',
    'errors.scoreFinite': 'Scores moeten eindige getallen zijn.',
    'errors.scoreFormula': 'Voer een geldige rekenformule in.',
    'errors.roundRequired': 'Voeg minstens één ronde toe voordat je opslaat.',
    'errors.playerScoresRequired': 'Voer voor elke speler een score in.',
    'errors.winnerRequired': 'Kies een winnaar of “Niemand wint”.',
    'errors.winnerInvalid': 'De gekozen winnaar moet een deelnemer zijn.',
    'errors.engineUnknown': 'Scoremethode “{id}” is niet geregistreerd.',
    'errors.playersUnique': 'Spelersnamen moeten uniek zijn.',
    'errors.playersMinimum': 'Voer minstens 2 spelers in.',
    'errors.gameInvalid': 'Ongeldig spel geselecteerd.',
    'errors.gameNameRequired': 'Een spelnaam is verplicht.',
    'errors.gameNameDuplicate': 'Er bestaat al een spel met die naam.',
    'errors.scoringEngineUnknown': 'Onbekende scoremethode.',
    'errors.rankingUnknown': 'Onbekende winvoorwaarde.',
    'errors.gameNotFound': 'Spel niet gevonden.',
    'errors.builtinReadOnly': 'Ingebouwde spellen kunnen niet worden gewijzigd.',
    'errors.builtinCannotDelete': 'Ingebouwde spellen kunnen niet worden verwijderd.',
    'errors.storedDataInvalid': 'Opgeslagen gegevens zijn geen lijst.',
    'errors.legacyScoreInvalid': 'Een oude sessie bevat een ongeldige score.',
    'errors.legacyDataInvalid': 'Oude sessiegegevens zijn geen lijst.',
    'errors.legacyPlayersInvalid': 'Een oude sessie bevat ongeldige spelers.',
    'errors.migrationVerify': 'Gemigreerde gegevens konden niet worden gecontroleerd.',
    'errors.migration': 'Bestaande sessies konden niet worden gemigreerd: {message}',
  },
};

export function normalizeLocale(locale) {
  const language = String(locale ?? '').toLowerCase().split('-')[0];
  return SUPPORTED_LOCALES.includes(language) ? language : null;
}

export function resolveLocale(storage, browserLanguages = []) {
  let stored = null;
  try { stored = normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY)); } catch { /* Use browser preference. */ }
  if (stored) return stored;
  for (const language of browserLanguages) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return 'en';
}

export function saveLocale(storage, locale) {
  const normalized = normalizeLocale(locale) ?? 'en';
  try { storage?.setItem(LOCALE_STORAGE_KEY, normalized); } catch { /* The selection still applies for this page. */ }
  return normalized;
}

export function createTranslator(locale) {
  const normalized = normalizeLocale(locale) ?? 'en';
  const interpolate = (template, parameters) => template.replace(/\{(\w+)\}/g, (_, key) => String(parameters[key] ?? `{${key}}`));
  const t = (key, parameters = {}) => {
    let resolvedKey = key;
    if (Object.hasOwn(parameters, 'count')) {
      const plural = new Intl.PluralRules(normalized).select(parameters.count);
      if (messages[normalized][`${key}.${plural}`] ?? messages.en[`${key}.${plural}`]) resolvedKey = `${key}.${plural}`;
    }
    return interpolate(messages[normalized][resolvedKey] ?? messages.en[resolvedKey] ?? key, parameters);
  };
  return {
    locale: normalized,
    t,
    formatDate: (value) => new Intl.DateTimeFormat(normalized).format(new Date(value)),
    formatDateTime: (value) => new Intl.DateTimeFormat(normalized, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)),
  };
}

export function applyStaticTranslations(root, i18n) {
  root.documentElement.lang = i18n.locale;
  root.title = i18n.t('app.title');
  root.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = i18n.t(node.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((node) => { node.setAttribute('aria-label', i18n.t(node.dataset.i18nAriaLabel)); });
}

export function translationKeys(locale) { return Object.keys(messages[locale] ?? {}).sort(); }
