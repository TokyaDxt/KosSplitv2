export type Member = {
  id: number
  name: string
  phone: string
  paymentInfo: string
  budget: number
  isOwner: boolean
}

export type Bill = {
  id: number
  title: string
  date: string
  payerId: number
  method: "equal" | "custom_amount" | "percentage" | "itemized"
  total: number
  shares: Record<number, number>
}

export type Transaction = {
  id: number
  memberId: number
  kind: "expense" | "income"
  category: string
  description: string
  amount: number
  date: string
}

export const rupiah = (value: number) => {
  const rounded = Math.round(value)
  return `${
    rounded < 0 ? "-" : ""
  }Rp${Math.abs(rounded).toLocaleString("id-ID")}`
}

export const parseAmount = (text: string) => {
  let cleaned = text
    .toLowerCase()
    .replace(/\b(?:rp|idr)\.?\s*/g, "")
    .replace(/\s/g, "")
  if (!cleaned) return 0
  if (!/^\d[\d.,]*$/.test(cleaned))
    throw new Error("Nominal harus berupa angka")

  const decimal = cleaned.match(/[,.](\d{2})$/)
  if (decimal) {
    cleaned = cleaned.slice(0, -3)
    const whole = cleaned.replace(/[.,]/g, "")
    if (!whole || !/^\d+$/.test(whole))
      throw new Error("Format nominal tidak dikenali")
    return Math.round(Number(`${whole}.${decimal[1]}`))
  }

  const digits = cleaned.replace(/[.,]/g, "")
  if (!/^\d+$/.test(digits)) throw new Error("Nominal harus berupa angka")
  return Number(digits)
}

/** Formats an editable integer Rupiah value with Indonesian separators. */
export function formatAmountInput(text: string, showCents = false) {
  if (!text.trim()) return ""
  const amount = parseAmount(text)
  const formatted = amount.toLocaleString("id-ID")
  return showCents ? `${formatted},00` : formatted
}

export function allocateWeighted(
  total: number,
  weights: Record<number, number>,
) {
  const keys = Object.keys(weights).map(Number)
  const weightTotal = keys.reduce((sum, key) => sum + weights[key], 0)
  if (!keys.length || weightTotal <= 0)
    throw new Error("Bobot pembagian tidak valid")
  const exact = Object.fromEntries(
    keys.map((key) => [key, (total * weights[key]) / weightTotal]),
  )
  const result: Record<number, number> = Object.fromEntries(
    keys.map((key) => [key, Math.floor(exact[key])]),
  )
  let remainder = total - keys.reduce((sum, key) => sum + result[key], 0)
  const order = [...keys].sort(
    (a, b) => exact[b] - result[b] - (exact[a] - result[a]) || a - b,
  )
  for (const key of order) {
    if (remainder <= 0) break
    result[key] += 1
    remainder -= 1
  }
  return result
}

export const equalSplit = (total: number, ids: number[]) =>
  allocateWeighted(total, Object.fromEntries(ids.map((id) => [id, 1])))

export function itemizedSplit(
  items: { price: number; members: number[] }[],
  extra: number,
  discount: number,
) {
  const subtotals: Record<number, number> = {}
  for (const item of items) {
    if (!item.members.length)
      throw new Error("Setiap item harus memiliki anggota")
    const portions = equalSplit(item.price, item.members)
    for (const [id, value] of Object.entries(portions)) {
      subtotals[Number(id)] = (subtotals[Number(id)] ?? 0) + value
    }
  }
  const subtotal = Object.values(subtotals).reduce(
    (sum, value) => sum + value,
    0,
  )
  return allocateWeighted(subtotal + extra - discount, subtotals)
}

export type Settlement = { from: number; to: number; amount: number }

export function balances(
  members: Member[],
  bills: Bill[],
  settlements: Settlement[] = [],
) {
  const result: Record<number, number> = Object.fromEntries(
    members.map((m) => [m.id, 0]),
  )
  for (const item of settlements) {
    result[item.from] += item.amount
    result[item.to] -= item.amount
  }
  for (const bill of bills) {
    for (const [id, value] of Object.entries(bill.shares)) {
      if (Number(id) === bill.payerId) continue
      result[bill.payerId] += value
      result[Number(id)] -= value
    }
  }
  return result
}

export function simplifyDebts(values: Record<number, number>) {
  const debtors = Object.entries(values)
    .filter(([, value]) => value < 0)
    .map(([id, value]) => [Number(id), -value])
    .sort((a, b) => b[1] - a[1])
  const creditors = Object.entries(values)
    .filter(([, value]) => value > 0)
    .map(([id, value]) => [Number(id), value])
    .sort((a, b) => b[1] - a[1])
  const transfers: [number, number, number][] = []
  let d = 0
  let c = 0
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d][1], creditors[c][1])
    if (amount) transfers.push([debtors[d][0], creditors[c][0], amount])
    debtors[d][1] -= amount
    creditors[c][1] -= amount
    if (!debtors[d][1]) d += 1
    if (!creditors[c][1]) c += 1
  }
  return transfers
}

/** Device-local calendar date as YYYY-MM-DD; toISOString would shift to UTC. */
export function localISODate(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function monthsAgo(count: number) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - count)
  return localISODate(date).slice(0, 7)
}

export const today = localISODate()
const month = today.slice(0, 7)
const previousMonth = monthsAgo(1)
const twoMonthsAgo = monthsAgo(2)

export const seedMembers: Member[] = [
  {
    id: 1,
    name: "Ayu",
    phone: "0812 1111 2222",
    paymentInfo: "BCA mobile 1234567890 a.n. Ayu",
    budget: 1_500_000,
    isOwner: true,
  },
  {
    id: 2,
    name: "Bima",
    phone: "0813 3333 4444",
    paymentInfo: "GoPay 081333334444 a.n. Bima",
    budget: 1_200_000,
    isOwner: false,
  },
  {
    id: 3,
    name: "Caca",
    phone: "0857 5555 6666",
    paymentInfo: "DANA 085755556666 a.n. Caca",
    budget: 1_000_000,
    isOwner: false,
  },
  {
    id: 4,
    name: "Dimas",
    phone: "0896 7777 8888",
    paymentInfo: "",
    budget: 900_000,
    isOwner: false,
  },
]

export const seedBills: Bill[] = [
  {
    id: 2,
    title: "Mie Gacoan malam",
    date: `${month}-09`,
    payerId: 2,
    method: "itemized",
    total: 118_800,
    shares: itemizedSplit(
      [
        { price: 38_000, members: [1] },
        { price: 30_000, members: [2] },
        { price: 22_000, members: [3] },
        { price: 18_000, members: [1, 3] },
      ],
      10_800,
      0,
    ),
  },
  {
    id: 1,
    title: "Token listrik",
    date: `${month}-03`,
    payerId: 1,
    method: "equal",
    total: 200_001,
    shares: equalSplit(200_001, [1, 2, 3, 4]),
  },
]

export const seedTransactions: Transaction[] = [
  {
    id: 6,
    memberId: 1,
    kind: "expense",
    category: "Patungan",
    description: "Mie Gacoan malam",
    amount: 51_700,
    date: `${month}-09`,
  },
  {
    id: 5,
    memberId: 1,
    kind: "expense",
    category: "Akademik",
    description: "Print laporan praktikum",
    amount: 24_000,
    date: `${month}-08`,
  },
  {
    id: 4,
    memberId: 1,
    kind: "expense",
    category: "Transportasi",
    description: "Ojek ke kampus",
    amount: 36_000,
    date: `${month}-06`,
  },
  {
    id: 3,
    memberId: 1,
    kind: "expense",
    category: "Makan & Minum",
    description: "Belanja sarapan",
    amount: 87_500,
    date: `${month}-05`,
  },
  {
    id: 2,
    memberId: 1,
    kind: "expense",
    category: "Kebutuhan Kos",
    description: "Galon dan sabun",
    amount: 42_000,
    date: `${month}-04`,
  },
  {
    id: 1,
    memberId: 1,
    kind: "income",
    category: "Uang kiriman",
    description: "Kiriman bulanan",
    amount: 1_500_000,
    date: `${month}-01`,
  },
  {
    id: -1,
    memberId: 1,
    kind: "expense",
    category: "Kebutuhan Kos",
    description: "Iuran kebersihan",
    amount: 75_000,
    date: `${previousMonth}-12`,
  },
  {
    id: -3,
    memberId: 1,
    kind: "expense",
    category: "Makan & Minum",
    description: "Nasi padang bareng",
    amount: 64_000,
    date: `${previousMonth}-07`,
  },
  {
    id: -2,
    memberId: 1,
    kind: "income",
    category: "Uang kiriman",
    description: "Kiriman bulan lalu",
    amount: 1_400_000,
    date: `${previousMonth}-01`,
  },
  {
    id: -4,
    memberId: 1,
    kind: "expense",
    category: "Akademik",
    description: "Fotokopi modul",
    amount: 18_000,
    date: `${twoMonthsAgo}-21`,
  },
  {
    id: -5,
    memberId: 1,
    kind: "income",
    category: "Uang kiriman",
    description: "Kiriman bulanan",
    amount: 1_400_000,
    date: `${twoMonthsAgo}-01`,
  },
]
