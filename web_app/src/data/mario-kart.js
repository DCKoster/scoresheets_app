export const MARIO_KART_POINTS = Object.freeze([15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);

export const MARIO_KART_CC_OPTIONS = Object.freeze(['50cc', '100cc', '150cc', '150cc-mirror', '200cc']);

export const MARIO_KART_TRACKS = Object.freeze([
  'Mario Kart Stadium', 'Water Park', 'Sweet Sweet Canyon', 'Thwomp Ruins',
  'Mario Circuit', 'Toad Harbor', 'Twisted Mansion', 'Shy Guy Falls',
  'Sunshine Airport', 'Dolphin Shoals', 'Electrodrome', 'Mount Wario',
  'Cloudtop Cruise', 'Bone-Dry Dunes', "Bowser's Castle", 'Rainbow Road',
  'Moo Moo Meadows (Wii)', 'Mario Circuit (GBA)', 'Cheep Cheep Beach (DS)', "Toad's Turnpike (N64)",
  'Dry Dry Desert (GCN)', 'Donut Plains 3 (SNES)', 'Royal Raceway (N64)', 'DK Jungle (3DS)',
  'Wario Stadium (DS)', 'Sherbet Land (GCN)', 'Music Park (3DS)', 'Yoshi Valley (N64)',
  'Tick-Tock Clock (DS)', 'Piranha Plant Slide (3DS)', 'Grumble Volcano (Wii)', 'Rainbow Road (N64)',
  'Yoshi Circuit', 'Excitebike Arena', 'Dragon Driftway', 'Mute City',
  "Wario's Gold Mine", 'Rainbow Road (SNES)', 'Ice Ice Outpost', 'Hyrule Circuit',
  'Baby Park (GCN)', 'Ribbon Road (GBA)', 'Super Bell Subway', 'Big Blue',
  'Neo Bowser City (3DS)', 'Cheese Land (GBA)', 'Wild Woods', 'Animal Crossing',
  // Deluxe tracks
  'Paris Promenade (Tour)', 'Tokyo Blur (Tour)', 'New York Minute (Tour)', 'Sydney Sprint (Tour)',
  '3DS Toad Circuit (3DS)', 'Shroom Ridge (DS)', 'Mario Circuit 3 (SNES)', 'Snow Land (GBA)',
  'Choco Mountain (N64)', 'Sky Garden (GBA)', 'Kalimari Desert (N64)', 'Mushroom Gorge (Wii)',
  'Coconut Mall (Wii)', 'Ninja Hideaway', 'Waluigi Pinball (DS)', 'Sky-High Sundae',
  'London Loop (Tour)', 'Berlin Byways (Tour)', 'Amsterdam Drift (Tour)', 'Bangkok Rush (Tour)',
  'Boo Lake (GBA)', 'Peach Gardens (DS)', 'Riverside Park (GBA)', 'Mario Circuit (DS)',
  'Rock Rock Mountain (3DS)', 'Merry Mountain (3DS)', 'DK Summit (Wii)', 'Waluigi Stadium (GCN)',
  'Maple Treeway (Wii)', 'Rainbow Road (3DS)', "Yoshi's Island", 'Singapore Speedway (Tour)',
  'Athens Dash (Tour)', 'Los Angeles Laps (Tour)', 'Rome Avanti (Tour)', 'Madrid Drive (Tour)',
  'Daisy Cruiser (GCN)', 'Sunset Wilds (GBA)', 'DK Mountain (GCN)', "Rosalina's Ice World (3DS)",
  'Moonview Highway (Wii)', 'Koopa Cape (Wii)', 'Daisy Circuit (Wii)', 'Bowser Castle 3 (SNES)',
  'Squeaky Clean Sprint', 'Vancouver Velocity (Tour)', 'Piranha Plant Cove', 'Rainbow Road (Wii)'
]);

export const MARIO_KART_ITEMS = Object.freeze([
  'Banana', 'Triple Bananas', 'Green Shell', 'Triple Green Shells', 'Red Shell', 'Triple Red Shells',
  'Blue Shell', 'Bob-omb', 'Mushroom', 'Triple Mushrooms', 'Golden Mushroom', 'Bullet Bill',
  'Blooper', 'Lightning', 'Star', 'Fire Flower', 'Boomerang Flower', 'Piranha Plant',
  'Horn', 'Crazy Eight', 'Coin', 'Boo',
]);

export const MARIO_KART_ITEM_PRESETS = Object.freeze({
  normal: Object.freeze({ name: 'Normal', items: Object.freeze([...MARIO_KART_ITEMS]) }),
  frantic: Object.freeze({ name: 'Frantic', items: Object.freeze([...MARIO_KART_ITEMS]) }),
  'shrooms-only': Object.freeze({ name: 'Shrooms-only', items: Object.freeze(['Mushroom', 'Triple Mushrooms', 'Golden Mushroom']) }),
  custom: Object.freeze({ name: 'Custom', items: Object.freeze([]) }),
});

export function itemPresetName(id) { return MARIO_KART_ITEM_PRESETS[id]?.name ?? id; }
