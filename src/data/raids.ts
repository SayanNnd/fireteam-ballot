// Active Destiny 2 Raids
// Editable raid pool. Each entry must have { id, name, tagline }

export interface Raid {
  id: string;
  name: string;
  tagline: string;
}

export const raids: Raid[] = [
  {
    id: "salvations-edge",
    name: "Salvation's Edge",
    tagline: "Confront the Witness within the monolithic heart of the Pale Heart."
  },
  {
    id: "crotas-end",
    name: "Crota's End",
    tagline: "Descend into the Hellmouth to silence the Son of Oryx."
  },
  {
    id: "root-of-nightmares",
    name: "Root of Nightmares",
    tagline: "A sinister entity awakens inside the terraformed Pyramid ship."
  },
  {
    id: "kings-fall",
    name: "King's Fall",
    tagline: "Board the Dreadnaught and breach the Ascendant Court of Oryx."
  },
  {
    id: "vow-of-the-disciple",
    name: "Vow of the Disciple",
    tagline: "Enter the sunken Pyramid in Savathûn's Throne World to challenge Rhulk."
  },
  {
    id: "vault-of-glass",
    name: "Vault of Glass",
    tagline: "Venture deep beneath Venus where the Vex manipulate time itself."
  },
  {
    id: "deep-stone-crypt",
    name: "Deep Stone Crypt",
    tagline: "Infiltrate Clovis Bray's frozen laboratory beneath Europa's surface."
  },
  {
    id: "garden-of-salvation",
    name: "Garden of Salvation",
    tagline: "Follow the mysterious signal deep within the Black Garden."
  },
  {
    id: "last-wish",
    name: "Last Wish",
    tagline: "Slay the legendary Ahamkara dragon Riven inside the Dreaming City."
  }
];

export default raids;
