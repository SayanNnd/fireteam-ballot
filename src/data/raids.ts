// Active Destiny 2 Raids & Endgame Encounters
// Editable raid pool. Each entry must have { id, name, tagline }

export interface Raid {
  id: string;
  name: string;
  tagline: string;
  exotic?: string;
  release?: string;
  isF2p?: boolean;
}

// Standard & Endgame Epic Raids (Active Deliberation Pool)
export const raids: Raid[] = [
  {
    id: "salvations-edge",
    name: "Salvation's Edge",
    tagline: "Confront the Witness within the monolithic heart of the Pale Heart.",
    exotic: "Euphony",
    release: "The Final Shape",
  },
  {
    id: "the-desert-perpetual",
    name: "The Desert Perpetual",
    tagline: "Journey across the shifting sands and temporal anomalies of the Edge of Fate.",
    exotic: "Whirling Ovation",
    release: "The Edge of Fate",
  },
  {
    id: "epic-desert-perpetual",
    name: "Epic Desert Perpetual",
    tagline: "Hardcore endgame encounter with tighter mechanics, Power cap 100, and Tier 5 loot.",
    exotic: "Whirling Ovation (Adept / Tier 5)",
    release: "The Edge of Fate",
  },
  {
    id: "crotas-end",
    name: "Crota's End",
    tagline: "Descend into the Hellmouth to silence the Son of Oryx.",
    exotic: "Necrochasm",
    release: "Reprised",
    isF2p: true,
  },
  {
    id: "root-of-nightmares",
    name: "Root of Nightmares",
    tagline: "A sinister entity awakens inside the terraformed Pyramid ship.",
    exotic: "Conditional Finality",
    release: "Lightfall",
  },
  {
    id: "kings-fall",
    name: "King's Fall",
    tagline: "Board the Dreadnaught and breach the Ascendant Court of Oryx.",
    exotic: "Touch of Malice",
    release: "Reprised",
    isF2p: true,
  },
  {
    id: "vow-of-the-disciple",
    name: "Vow of the Disciple",
    tagline: "Enter the sunken Pyramid in Savathûn's Throne World to challenge Rhulk.",
    exotic: "Collective Obligation",
    release: "The Witch Queen",
  },
  {
    id: "vault-of-glass",
    name: "Vault of Glass",
    tagline: "Venture deep beneath Venus where the Vex manipulate time itself.",
    exotic: "Vex Mythoclast",
    release: "Reprised",
    isF2p: true,
  },
  {
    id: "deep-stone-crypt",
    name: "Deep Stone Crypt",
    tagline: "Infiltrate Clovis Bray's frozen laboratory beneath Europa's surface.",
    exotic: "Eyes of Tomorrow",
    release: "Beyond Light",
  },
  {
    id: "garden-of-salvation",
    name: "Garden of Salvation",
    tagline: "Follow the mysterious signal deep within the Black Garden.",
    exotic: "Divinity",
    release: "Shadowkeep",
  },
  {
    id: "last-wish",
    name: "Last Wish",
    tagline: "Slay the legendary Ahamkara dragon Riven inside the Dreaming City.",
    exotic: "One Thousand Voices",
    release: "Forsaken",
  },
];

// The Pantheons (Raid Boss Gauntlets - Kept in separate list as requested)
export const pantheons: Raid[] = [
  {
    id: "pantheon-calus-resplendent",
    name: "Pantheon: Calus Resplendent",
    tagline: "A 3-encounter gauntlet featuring Argos, Gahlran, and Emperor Calus.",
    release: "The Pantheons",
  },
  {
    id: "pantheon-morgeth-surpassing",
    name: "Pantheon: Morgeth Surpassing",
    tagline: "A 3-encounter hybrid mashup featuring Warpriest, Consecrated Mind, and Morgeth.",
    release: "The Pantheons",
  },
  {
    id: "pantheon-insurrection-prime-revolutionary",
    name: "Pantheon: Insurrection Prime Revolutionary",
    tagline: "The ultimate 7-boss gauntlet culminating in the reprised Insurrection Prime encounter.",
    release: "The Pantheons",
  },
];

export default raids;
