// TypeScript port of kossplit_android/kossplit/payments.py for the preview.
import { rupiah } from "./kossplit"

export type Provider = { key: string label: string aliases: string[] }

export const providers: Provider[] = [
  { key: "blu", label: "blu by BCA Digital", aliases: ["blu"] },
  { key: "bca", label: "BCA mobile", aliases: ["bca", "klikbca"] },
  { key: "mandiri", label: "Livin' by Mandiri", aliases: ["mandiri", "livin"] },
  { key: "bri", label: "BRImo", aliases: ["bri", "brimo"] },
  { key: "bni", label: "BNI Mobile", aliases: ["bni", "wondr"] },
  { key: "gopay", label: "GoPay", aliases: ["gopay", "gojek"] },
  { key: "ovo", label: "OVO", aliases: ["ovo"] },
  { key: "dana", label: "DANA", aliases: ["dana"] },
  { key: "shopeepay", label: "ShopeePay", aliases: ["shopeepay", "shopee"] },
]

export function parsePaymentInfo(text: string) {
  const lowered = text.toLowerCase()
  const provider =
    providers.find((item) =>
      item.aliases.some((alias) => new RegExp(`\\b${alias}\\b`).test(lowered)),
    ) ?? null
  const numbers = (text.match(/\d[\d\s-]{4,}\d/g) ?? []).map((chunk) =>
    chunk.replace(/\D/g, ""),
  )
  const accountNumber = numbers.sort((a, b) => b.length - a.length)[0] ?? ""
  return {
    provider,
    accountNumber,
    label: provider?.label ?? "Rekening",
    raw: text.trim(),
  }
}

export const formatPaymentInfo = (
  label: string,
  account: string,
  holder: string,
) =>
  [
    label.trim(),
    account.replace(/\D/g, ""),
    holder.trim() ? `a.n. ${holder.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" ")

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("0")) return `62${digits.slice(1)}`
  if (digits.startsWith("8")) return `62${digits}`
  return digits
}

export function paymentReminder(
  debtor: string,
  creditor: string,
  amount: number,
  info: ReturnType<typeof parsePaymentInfo>,
) {
  const lines = [
    `Halo ${debtor}, ini pengingat dari KosSplit.`,
    `Kamu perlu membayar ${rupiah(amount)} ke ${creditor}.`,
  ]
  if (info.accountNumber)
    lines.push(`Transfer ke ${info.label}: ${info.accountNumber}`)
  else if (info.raw) lines.push(`Info pembayaran: ${info.raw}`)
  lines.push("Terima kasih.")
  return lines.join("\n")
}

export const whatsappUrl = (phone: string, message: string) =>
  `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`
