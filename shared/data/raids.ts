// Active Destiny 2 Raids & Endgame Encounters
// Editable raid pool. Each entry must have { id, name, tagline }

export interface Raid {
  id: string;
  name: string;
  tagline: string;
  details?: string;
  location?: string;
  badge?: string;
  isF2p?: boolean;
  image?: string;
}

// Standard & Endgame Epic Raids (Active Deliberation Pool)
export const raids: Raid[] = [
  {
    id: "salvations-edge",
    name: "Salvation's Edge",
    tagline: "Challenge the Witness at the heart of the Traveler.",
    details:
      "Venture into the Pale Heart and overcome a series of intricate encounters built around coordination, combat, and puzzle-solving. Fight through the Witness's stronghold and confront the ancient enemy at the center of the Final Shape.",
    location: "The Pale Heart",
    image: "/raids/Salvations_Edge.png",
  },
  {
    id: "the-desert-perpetual",
    name: "The Desert Perpetual",
    tagline: "Confront the Vex in a world shaped by time and mystery.",
    details:
      "Enter the Vex-infested world of Kepler and fight through a raid featuring multiple boss encounters. Coordinate your fireteam, overcome encounter mechanics, and defeat Koregos to complete the raid.",
    location: "Kepler",
    badge: "FEATURED",
    image: "/raids/The_Desert_Perpetual_Normal.png",
  },
  {
    id: "epic-desert-perpetual",
    name: "Epic Desert Perpetual",
    tagline: "Face the Vex in a more demanding test of mastery.",
    details:
      "Take on the Epic version of The Desert Perpetual, with a higher-difficulty encounter experience and additional challenge through the feats system. Adapt your strategies, coordinate your fireteam, and defeat the raid's bosses.",
    location: "Kepler",
    image: "/raids/The_Desert_Perpetual.png",
  },
  {
    id: "crotas-end",
    name: "Crota's End",
    tagline: "Descend into the Moon and challenge the Hive prince.",
    details:
      "Venture into the depths beneath the Moon's surface and battle the Hive through a sequence of encounters. Navigate dangerous terrain, work together to overcome the raid's mechanics, and face Crota, Son of Oryx.",
    location: "The Moon",
    isF2p: true,
    image: "/raids/Crotas_End.png",
  },
  {
    id: "root-of-nightmares",
    name: "Root of Nightmares",
    tagline: "Confront an ancient threat brought to your doorstep.",
    details:
      "Board a mysterious Pyramid ship and explore a landscape transformed by an unknown power. Master the raid's interconnected mechanics, overcome its encounters, and face Nezarec, the Final God of Pain.",
    location: "The Witness's Pyramid ship, near Neptune",
    image: "/raids/Root_Of_Nightmares.png",
  },
  {
    id: "kings-fall",
    name: "King's Fall",
    tagline: "Return to the Dreadnaught and confront the Taken King.",
    details:
      "Invade Oryx's massive Dreadnaught and battle the forces of the Taken King. Navigate dangerous traversal sections, coordinate encounter-specific mechanics, and defeat Oryx to bring the raid to its conclusion.",
    location: "The Dreadnaught",
    isF2p: true,
    image: "/raids/Kings-Fall-Oryx-The-Taken-King.png",
  },
  {
    id: "vow-of-the-disciple",
    name: "Vow of the Disciple",
    tagline: "Uncover the secrets hidden within an ancient Pyramid.",
    details:
      "Enter a Pyramid buried within Savathûn's Throne World and uncover the secrets guarded by its forces. Decipher symbols, coordinate your fireteam through complex encounters, and confront Rhulk, Disciple of the Witness.",
    location: "Savathûn's Throne World",
    image: "/raids/Vow_Of_The_Disciple.png",
  },
  {
    id: "vault-of-glass",
    name: "Vault of Glass",
    tagline: "Enter the Vex's domain and challenge the flow of time.",
    details:
      "Explore the Vault of Glass, a Vex stronghold filled with temporal mysteries and lethal defenses. Work together to navigate its encounters, prevent the Vex from erasing you from time, and defeat Atheon, Time's Conflux.",
    location: "Venus",
    isF2p: true,
    image: "/raids/VOG.png",
  },
  {
    id: "deep-stone-crypt",
    name: "Deep Stone Crypt",
    tagline: "Uncover the mysteries buried beneath Europa's ice.",
    details:
      "Journey across Europa's frozen wilderness, infiltrate an abandoned Exo facility, and venture into space aboard an orbiting station. Survive dangerous environments, coordinate operator, scanner, and suppressor roles, and confront Taniks.",
    location: "Europa and an orbital space station",
    image: "/raids/Deep_Stone_Crypt.png",
  },
  {
    id: "garden-of-salvation",
    name: "Garden of Salvation",
    tagline: "Follow the signal into the mysterious Black Garden.",
    details:
      "Enter the Black Garden and pursue a mysterious signal through Vex territory. Coordinate your fireteam around shared mechanics, defend and activate key structures, and confront the Sanctified Mind.",
    location: "The Black Garden",
    image: "/raids/Garden_Of_Salvation.png",
  },
  {
    id: "last-wish",
    name: "Last Wish",
    tagline: "Defeat the evil at the heart of the Dreaming City.",
    details:
      "Enter the Keep of Voices and challenge the Taken corruption spreading through the Dreaming City. Solve intricate puzzles, coordinate your fireteam through a series of encounters, and confront Riven of a Thousand Voices.",
    location: "The Dreaming City",
    image: "/raids/Last_Wish.png",
  },
];

// The Pantheons (Raid Boss Gauntlets)
export const pantheons: Raid[] = [
  {
    id: "pantheon-calus-resplendent",
    name: "Pantheon: Calus Resplendent",
    tagline: "Face reprised raid encounters in a boss gauntlet.",
    details:
      "Take on a lineup of reprised raid encounters featuring Calus and other returning raid bosses. These encounters retain their original foundations while incorporating changes to mechanics, combat, and boss tuning.",
    location: "Pantheon activity — Raids and Dungeons",
    image: "/raids/placeholder.svg",
  },
  {
    id: "pantheon-morgeth-surpassing",
    name: "Pantheon: Morgeth Surpassing",
    tagline: "Master encore encounters that demand new strategies.",
    details:
      "Fight through a lineup of encore encounters that combine previously separate raid encounters, including boss and non-boss sections. Adapt to altered mechanics and coordinate your fireteam to overcome the combined challenges.",
    location: "Pantheon activity — Raids and Dungeons",
    image: "/raids/placeholder.svg",
  },
  {
    id: "pantheon-insurrection-prime-revolutionary",
    name: "Pantheon: Insurrection Prime Revolutionary",
    tagline: "Take on the full gauntlet of reprised and encore bosses.",
    details:
      "Challenge the complete Pantheon boss gauntlet, bringing together reprised encounters and encore encounters. Build a coordinated fireteam, overcome the successive boss challenges, and pursue the activity's triumphs by completing additional feats.",
    location: "Pantheon activity — Raids and Dungeons",
    image: "/raids/placeholder.svg",
  },
];

export default raids;
