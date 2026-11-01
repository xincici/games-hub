const EMOJIS = [...new Set([
  '🍎', '🍌', '🍇', '🍉', '🥝', '🥭', '🫐', '🍒', '🍊', '🍓', '🍍', '🍑', '🍐', '🍋',
  '🍆', '🥕', '🥑', '🍅', '🍏', '🥒', '🥦', '🍈', '🥔', '🌶️', '🍄', '🫛',
  '🌺', '🌼', '🌸', '🌹', '🌷', '💐', '💮', '🥀', '🌱', '🌿', '🍃', '🌳', '🌻',
  '🍂', '🍀', '🌾', '🌵', '🪴', '🎴', '🌴', '🌲', '☘️', '🪷', '🍁', '🥠',
  '🚗', '🚙', '🚘', '🚓', '🚕', '🚌', '🏎️', '🚚', '🚛', '🛻', '🚑', '🚒', '🚔',
  '🏍️', '🚨', '🚖', '🚋', '🚃', '🛺', '🏁', '🚜', '🚐',
  '⚽', '🏀', '🏈', '⚾', '🎾', '🏐',
  '🛍️', '💰', '🤑', '🛒', '📦', '🛏️',
  '🎉', '🔥', '🎁', '🐉', '🏮', '🎊', '🧧', '🐲', '🧨',
  '🍜', '🥟', '🍚', '🍱', '🍵', '🥮', '🥗', '🍭', '🧁', '🍽️', '🍻',
  '🍕', '🍔', '🍣', '🌮', '🍪', '🍩', '🍝', '🍦', '🍗', '🥙',
  '🐶', '🐭', '🐹', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐔',
  '🦤', '🦘', '🐒', '🦧', '🦔', '🦒', '🦌', '🐁',
  '🦆', '🐘', '🦄', '🐢', '🦮', '🦦', '🦓', '🐇', '🐬',
  '🪵', '🦜', '🐿️', '🎶', '🧸',
])];

const MAHJONG_FACES = [
  ...['m', 's', 'p'].flatMap(suit => Array.from({ length: 9 }, (_, i) => `${suit}${i + 1}`)),
  ...Array.from({ length: 7 }, (_, i) => `z${i + 1}`),
];

const CARD_TYPES = ['spade', 'club', 'heart', 'diamond'];
const POKER_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const POKER_SUITS = { spade: '♠', club: '♣', heart: '♥', diamond: '♦' };

function faceOf(key) {
  return { suit: String(key)[0], value: +String(key).slice(1) };
}

function keyOf(item) {
  return typeof item === 'string' ? item : `${item.num}-${item.type}`;
}

module.exports = {
  EMOJIS, MAHJONG_FACES, CARD_TYPES, POKER_RANKS, POKER_SUITS,
  faceOf, keyOf,
};
