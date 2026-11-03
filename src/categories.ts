/** Mirrors kossplit_android/kossplit/labels.py so the preview guesses the same category. */
export const categories = [
  "Makan & Minum",
  "Kebutuhan Kos",
  "Transportasi",
  "Akademik",
  "Hiburan",
  "Lainnya",
]

const keywords: Record<string, string[]> = {
  "Makan & Minum": [
    "resto",
    "restoran",
    "rumah makan",
    "cafe",
    "kafe",
    "kopi",
    "coffee",
    "warung",
    "warteg",
    "bakso",
    "mie",
    "mi ayam",
    "nasi",
    "ayam",
    "geprek",
    "padang",
    "sate",
    "martabak",
    "burger",
    "pizza",
    "kfc",
    "mcd",
    "mcdonald",
    "starbucks",
    "janji jiwa",
    "kopi kenangan",
    "chatime",
    "mixue",
    "teh",
    "es",
    "jus",
    "roti",
    "bakery",
    "food",
    "makan",
    "minum",
    "gofood",
    "grabfood",
    "shopeefood",
    "sushi",
    "seblak",
    "soto",
    "gorengan",
    "snack",
  ],
  "Kebutuhan Kos": [
    "indomaret",
    "alfamart",
    "alfamidi",
    "superindo",
    "hypermart",
    "giant",
    "lotte mart",
    "minimarket",
    "toserba",
    "laundry",
    "gas",
    "elpiji",
    "lpg",
    "galon",
    "token",
    "listrik",
    "pln",
    "sabun",
    "deterjen",
    "rinso",
    "sampo",
    "shampoo",
    "pasta gigi",
    "odol",
    "tisu",
    "tissue",
    "pembersih",
    "sapu",
    "pel",
    "beras",
    "minyak goreng",
    "telur",
    "wifi",
    "indihome",
  ],
  Transportasi: [
    "spbu",
    "pertamina",
    "shell",
    "bensin",
    "pertalite",
    "pertamax",
    "solar",
    "parkir",
    "gojek",
    "goride",
    "gocar",
    "grab",
    "grabbike",
    "grabcar",
    "ojek",
    "maxim",
    "krl",
    "commuter",
    "kai",
    "kereta",
    "tol",
    "bus",
    "transjakarta",
    "damri",
    "angkot",
  ],
  Akademik: [
    "fotokopi",
    "fotocopy",
    "print",
    "printing",
    "gramedia",
    "buku",
    "atk",
    "alat tulis",
    "kertas",
    "pulpen",
    "pena",
    "pensil",
    "jilid",
    "kampus",
    "kuliah",
    "seminar",
  ],
  Hiburan: [
    "bioskop",
    "cinema",
    "xxi",
    "cgv",
    "cinepolis",
    "netflix",
    "spotify",
    "youtube",
    "game",
    "karaoke",
    "inul vizta",
    "steam",
    "playstation",
    "timezone",
    "tiket konser",
  ],
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const patterns = Object.entries(keywords).map(
  ([category, words]) =>
    [category, new RegExp(`\\b(${words.map(escape).join("|")})\\b`)] as const,
)

/** The store name weighs three items, because "Indomaret" says more than one snack on the list. */
export function guessCategory(
  merchant: string,
  itemNames: string[] = [],
): string {
  const scores = new Map<string, number>(
    patterns.map(([category]) => [category, 0]),
  )
  const weighted: [string, number][] = [
    [merchant, 3],
    ...itemNames.map((name) => [name, 1] as [string, number]),
  ]
  for (const [text, weight] of weighted) {
    const lowered = text.toLowerCase()
    for (const [category, pattern] of patterns) {
      if (pattern.test(lowered))
        scores.set(category, scores.get(category)! + weight)
    }
  }
  let best = "Lainnya"
  let top = 0
  for (const [category, score] of scores) {
    if (score > top) {
      best = category
      top = score
    }
  }
  return best
}
