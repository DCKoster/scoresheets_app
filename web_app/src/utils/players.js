export function parsePlayers(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
