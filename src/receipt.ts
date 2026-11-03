// TypeScript port of kossplit_android/kossplit/receipt_parser.py for the preview.
export type ReceiptItem = { name: string; price: number }

export type ReceiptDraft = {
  merchant: string
  items: ReceiptItem[]
  subtotal: number
  taxService: number
  discount: number
  total: number
  notes: string[]
}

const AMOUNT_AT_END =
  /(?<neg>[-(])?\s*(?:(?:rp|idr)\.?\s*)?(?<num>\d[\d.,]*\d|\d)(?:\s*,?\s*-\s*)?\)?\s*$/i
const QTY_AT_END =
  /(?<qty>\d+)\s*[xX×@]\s*(?:(?:rp|idr)\.?\s*)?[\d.,]+(?:\s*,?\s*-\s*)?$/i
const DATE_OR_TIME = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}:\d{2}\b/
const SUBTOTAL = /\b(sub\s*-?\s*total|harga\s*jual|jumlah\s*harga)\b/i
const DISCOUNT =
  /\b(disc(ount)?|diskon|potongan|promo|voucher|hemat|cashback)\b/i
const TAX =
  /\b(ppn|pajak|pb1|tax|service|servis|layanan|ongkir|ongkos|delivery|pengiriman|biaya|packaging|kemasan|admin|platform)\b/i
const TOTAL =
  /\b(grand\s*total|total(\s*(bayar|tagihan|belanja|harga|akhir))?|jumlah(\s*bayar)?|amount\s*due)\b/i
const IGNORE =
  /\b(tunai|cash|kembali(an)?|change|debit|kredit|credit|kartu|card|qris|edc|npwp|telp|tel|phone|kasir|cashier|struk|nota|trx|member|poin|point|terima\s*kasih|thank|bayar|pembayaran|saldo|item|qty)\b/i
const MIN_PRICE = 100

export function parseReceiptAmount(text: string) {
  let cleaned = text
    .replace(/\b(?:rp|idr)\.?/gi, "")
    .trim()
    .replace(/[()\s]/g, "")
    .replace(/^-+/, "")
    .replace(/,?-$/, "")
  if (/[.,]\d{2}$/.test(cleaned) && !/[.,]\d{3}$/.test(cleaned))
    cleaned = cleaned.slice(0, -3)
  const digits = cleaned.replace(/[.,]/g, "")
  if (!/^\d+$/.test(digits)) throw new Error(`Nominal tidak dikenali: ${text}`)
  return Number(digits)
}

const letters = (text: string, minimum = 2) =>
  (text.match(/[A-Za-z]/g) ?? []).length >= minimum
const cleanName = (text: string) =>
  text.replace(/\s{2,}/g, " ").replace(/^[\s.:\-*]+|[\s.:\-*]+$/g, "")
const sum = (items: ReceiptItem[]) =>
  items.reduce((total, item) => total + item.price, 0)
const idr = (value: number) => `Rp${value.toLocaleString("id-ID")}`

export const computedTotal = (draft: ReceiptDraft) =>
  draft.subtotal + draft.taxService - draft.discount

export function parseReceipt(text: string): ReceiptDraft {
  const draft: ReceiptDraft = {
    merchant: "",
    items: [],
    subtotal: 0,
    taxService: 0,
    discount: 0,
    total: 0,
    notes: [],
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  let pending = ""
  let taxSeen = false
  let discountSeen = false

  lines.forEach((line, index) => {
    const match = AMOUNT_AT_END.exec(line)
    const label = match ? line.slice(0, match.index) : line
    const meta = DATE_OR_TIME.test(line)
    if (!match || meta) {
      if (!draft.merchant && index < 4 && letters(line, 3) && !meta)
        draft.merchant = cleanName(line)
      else
        pending =
          letters(line) && !meta && !IGNORE.test(line) ? cleanName(line) : ""
      return
    }
    let value: number
    try {
      value = parseReceiptAmount(match.groups!.num)
    } catch {
      pending = ""
      return
    }
    if (SUBTOTAL.test(label)) draft.subtotal = value
    else if (DISCOUNT.test(label)) {
      draft.discount += value
      discountSeen = true
    } else if (TAX.test(label)) {
      draft.taxService += value
      taxSeen = true
    } else if (TOTAL.test(label)) draft.total = value
    else if (!IGNORE.test(label) && value >= MIN_PRICE) {
      const quantity = QTY_AT_END.exec(label)
      let name = cleanName(quantity ? label.slice(0, quantity.index) : label)
      if (!letters(name) && pending) name = pending
      if (letters(name)) {
        if (quantity && Number(quantity.groups!.qty) > 1)
          name = `${name} x${quantity.groups!.qty}`
        draft.items.push({ name, price: value })
      }
    }
    pending = ""
  })

  if (!draft.subtotal) draft.subtotal = sum(draft.items)
  if (!draft.total) draft.total = computedTotal(draft)
  else if (draft.total !== computedTotal(draft)) {
    const gap = draft.total - computedTotal(draft)
    if (gap > 0 && !taxSeen) {
      draft.taxService += gap
      draft.notes.push(`Selisih ${idr(gap)} dianggap biaya tambahan`)
    } else if (gap < 0 && !discountSeen) {
      draft.discount += -gap
      draft.notes.push(`Selisih ${idr(-gap)} dianggap diskon`)
    } else
      draft.notes.push(
        "Total struk berbeda dari hitungan. Periksa kembali angka.",
      )
  }
  if (sum(draft.items) !== draft.subtotal)
    draft.notes.push("Jumlah harga item belum sama dengan subtotal struk.")
  if (!draft.items.length)
    draft.notes.push(
      "Tidak ada item yang terbaca. Tambahkan item secara manual.",
    )
  return draft
}

/** Subtotal, fees, and discount that match the item list and the printed total. */
export function billValues(draft: ReceiptDraft): [number, number, number] {
  const subtotal = sum(draft.items)
  let fees = draft.taxService
  let discount = draft.discount
  if (draft.total) {
    const gap = draft.total - (subtotal + fees - discount)
    if (gap > 0) fees += gap
    else if (gap < 0) discount += -gap
  }
  return [subtotal, fees, discount]
}

export const itemsToText = (items: ReceiptItem[]) =>
  items
    .map((item) => `${item.name}|${item.price.toLocaleString("id-ID")}`)
    .join("\n")

export function itemsFromText(text: string): ReceiptItem[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const cut = line.lastIndexOf("|")
      if (cut < 0)
        throw new Error(`Gunakan format nama|harga pada baris: ${line}`)
      const name = line.slice(0, cut).trim()
      if (!name) throw new Error("Nama item tidak boleh kosong")
      return { name, price: parseReceiptAmount(line.slice(cut + 1)) }
    })
}

export const sampleReceipts = {
  camera: `MIE GACOAN SETURAN
Jl. Seturan Raya No. 12
12/05/2025 19:42
Mie Hompimpa Lv 3      IDR 38.000,00
Mie Suit               IDR 30.000,00
Udang Rambutan         IDR 22.000,00
Es Teh 2 x 9.000       IDR 18.000,00
Subtotal               IDR 108.000,00
PB1 10%                IDR 10.800,00
Total                  IDR 118.800,00
Tunai                  IDR 150.000,00
Kembali                IDR 31.200,00`,
  gallery: `INDOMARET KALIURANG
AQUA GALON 19L
1 x 21.000 21.000
SABUN CUCI PIRING
2 x 8.500 17.000
Indomie Goreng 5 x 3.100 15.500
HARGA JUAL 53.500
DISKON PROMO -5.000
TOTAL BELANJA 48.500
TUNAI 50.000
KEMBALIAN 1.500`,
}
