export interface BingoPromptSeed {
  text: string;
  emoji: string;
}

export const normalizeBingoPrompt = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const FALLBACK_PROMPTS: BingoPromptSeed[] = [
  { text: "A cursed snack", emoji: "🍿" },
  { text: "Tiny main character", emoji: "🐜" },
  { text: "Something oddly blue", emoji: "🌀" },
  { text: "Your villain face", emoji: "😈" },
  { text: "A chaotic drawer", emoji: "🗄️" },
  { text: "Best cloud today", emoji: "☁️" },
  { text: "An accidental heart", emoji: "💘" },
  { text: "Something too shiny", emoji: "✨" },
  { text: "Your fake album cover", emoji: "💿" },
  { text: "A suspicious shadow", emoji: "🕵️" },
  { text: "Most dramatic object", emoji: "🎭" },
  { text: "A snack with aura", emoji: "🧃" },
  { text: "Something pocket sized", emoji: "🤏" },
  { text: "The softest thing", emoji: "🧸" },
  { text: "Your 2007 selfie", emoji: "📱" },
  { text: "Unhinged mirror face", emoji: "🪞" },
  { text: "A colour collision", emoji: "🎨" },
  { text: "Something giving grandma", emoji: "🧶" },
  { text: "An elite texture", emoji: "🫧" },
  { text: "Today's weirdest sign", emoji: "🪧" },
  { text: "A lonely object", emoji: "🥺" },
  { text: "Something aggressively green", emoji: "🟢" },
  { text: "Your detective pose", emoji: "🔎" },
  { text: "A tiny disaster", emoji: "🌪️" },
  { text: "Something unexpectedly cute", emoji: "🎀" },
  { text: "A low budget throne", emoji: "👑" },
  { text: "The main character seat", emoji: "🪑" },
  { text: "A questionable outfit", emoji: "🧢" },
  { text: "Something from 2012", emoji: "🕰️" },
  { text: "An object with lore", emoji: "📖" },
  { text: "Your loading face", emoji: "🫠" },
  { text: "The loudest colour", emoji: "📣" },
  { text: "A forbidden combo", emoji: "🚫" },
  { text: "Something shaped wrong", emoji: "🫨" },
  { text: "Your tiny luxury", emoji: "💎" },
  { text: "A dramatic reflection", emoji: "🪩" },
  { text: "Proof of adulthood", emoji: "🧾" },
  { text: "Something very Monday", emoji: "😵" },
  { text: "An emotional support item", emoji: "🫶" },
  { text: "A face mid thought", emoji: "🤔" },
  { text: "Your best side eye", emoji: "👀" },
  { text: "A strangely perfect circle", emoji: "⭕" },
  { text: "Something older than you", emoji: "🏺" },
  { text: "The worst lighting", emoji: "💡" },
  { text: "A snack crime scene", emoji: "🕵️" },
  { text: "Your secret headquarters", emoji: "🏠" },
  { text: "Something with tiny eyes", emoji: "👁️" },
  { text: "A texture you can hear", emoji: "🎧" },
  { text: "An underrated corner", emoji: "📐" },
  { text: "A beautiful mess", emoji: "💥" },
  { text: "Your CEO pose", emoji: "💼" },
  { text: "Something deeply orange", emoji: "🍊" },
  { text: "A face for bad news", emoji: "😬" },
  { text: "The nearest pattern", emoji: "🧩" },
  { text: "A suspiciously good snack", emoji: "🤨" },
  { text: "Something that sparkles", emoji: "🌟" },
  { text: "Your weather report", emoji: "🌦️" },
  { text: "A miniature world", emoji: "🔬" },
  { text: "The weirdest packaging", emoji: "📦" },
  { text: "Your most useful object", emoji: "🛠️" },
  { text: "Something perfectly pink", emoji: "🌸" },
  { text: "An awkward angle", emoji: "📐" },
  { text: "A face with no thoughts", emoji: "😶" },
  { text: "Something barely surviving", emoji: "🪫" },
  { text: "A free serotonin source", emoji: "🌼" },
  { text: "Your current obsession", emoji: "🌀" },
  { text: "An unnecessarily tiny thing", emoji: "🔍" },
  { text: "A very serious selfie", emoji: "🫡" },
  { text: "Something with personality", emoji: "💅" },
  { text: "The closest red thing", emoji: "🔴" },
  { text: "A scene from 2004", emoji: "📼" },
  { text: "Your pop star pose", emoji: "🎤" },
  { text: "Something mildly cursed", emoji: "🧿" },
  { text: "A tiny bit fancy", emoji: "🥂" },
  { text: "Your best fake cry", emoji: "😭" },
  { text: "An object out of place", emoji: "🛸" },
  { text: "The cosiest corner", emoji: "🛋️" },
  { text: "A beautiful reflection", emoji: "🌈" },
  { text: "Something you forgot existed", emoji: "🫢" },
  { text: "Your paparazzi moment", emoji: "📸" },
  { text: "A meal with personality", emoji: "🍜" },
];

function seededRandom(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }

  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getFreshFallbackPrompts(
  excluded: Set<string>,
  seed: string,
  count: number,
) {
  const random = seededRandom(seed);
  const available = FALLBACK_PROMPTS
    .filter((prompt) => !excluded.has(normalizeBingoPrompt(prompt.text)))
    .map((prompt) => ({ ...prompt }))
    .sort(() => random() - 0.5);

  return available.slice(0, count);
}
