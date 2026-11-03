import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import {
  allocateWeighted,
  balances,
  equalSplit,
  formatAmountInput,
  itemizedSplit,
  localISODate,
  parseAmount,
  rupiah,
  seedBills,
  seedMembers,
  seedTransactions,
  simplifyDebts,
  type Bill,
  type Member,
  type Settlement,
  type Transaction,
} from "./kossplit"
import {
  billValues,
  computedTotal,
  itemsFromText,
  itemsToText,
  parseReceipt,
  parseReceiptAmount,
  sampleReceipts,
  type ReceiptDraft,
} from "./receipt"
import {
  formatPaymentInfo,
  parsePaymentInfo,
  paymentReminder,
  providers,
  whatsappUrl,
} from "./payments"
import { categories, guessCategory } from "./categories"

type Screen = "dashboard" | "bills" | "expenses" | "members"
type Modal = "member" | "transaction" | "bill" | "scan" | "review" | "record" | "payment" | null
type Transfer = { from: number to: number amount: number }
type MonthGroup = {
  period: string
  items: Transaction[]
  income: number
  expense: number
  incomeCount: number
  expenseCount: number
}

const screens: Record<Screen, { kicker: string title: string nav: string }> = {
  dashboard: {
    kicker: "Ringkasan bulan ini",
    title: "Uang kos, tanpa tebak-tebakan",
    nav: "Ringkas",
  },
  bills: {
    kicker: "Tagihan patungan",
    title: "Siapa pesan apa",
    nav: "Tagihan",
  },
  expenses: {
    kicker: "Catatan per bulan",
    title: "Jejak setiap rupiah",
    nav: "Catatan",
  },
  members: {
    kicker: "Anggota kos",
    title: "Orang di balik patungan",
    nav: "Anggota",
  },
}

const methodLabel: Record<Bill["method"], string> = {
  equal: "Bagi rata",
  custom_amount: "Nominal kustom",
  percentage: "Persentase",
  itemized: "Per item",
}

const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

/** Re-reads the device clock so a new month opens without reloading. */
function useLiveDate() {
  const [now, setNow] = useState(() => localISODate())
  useEffect(() => {
    const tick = () => setNow(localISODate())
    const timer = window.setInterval(tick, 30_000)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [])
  return now
}

function Chevron({
  up = false,
  className = "",
}: {
  up?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`size-4 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
        up ? "rotate-180" : ""
      } ${className}`}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Check() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4 shrink-0 text-sky"
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* Raised surfaces sit on the same night blue as the page; only light and shadow separate them. */
function Sheet({
  children,
  className = "",
  inset = false,
}: {
  children: ReactNode
  className?: string
  inset?: boolean
}) {
  return (
    <div
      className={`bg-night ${
        inset ? "neu-inset rounded-[14px]" : "neu-raised rounded-[18px]"
      } ${className}`}
    >
      {children}
    </div>
  )
}

function Action({
  children,
  tone = "plain",
  size = "md",
  onClick,
}: {
  children: ReactNode
  tone?: "plain" | "primary"
  size?: "md" | "sm"
  onClick?: () => void
}) {
  const tones = {
    plain: "bg-night text-frost neu-raised-sm active:neu-inset",
    primary: "bg-azure text-white neu-azure active:neu-azure-inset",
  }
  const sizes = {
    md: "h-[50px] rounded-[16px] text-[13px]",
    sm: "h-10 rounded-[14px] text-[12px]",
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 font-bold transition-[box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky/60 ${tones[tone]} ${sizes[size]}`}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 pt-2 text-[10px] font-bold tracking-[0.08em] text-haze">
      {children}
    </p>
  )
}

const wellClass =
  "w-full rounded-[14px] bg-night px-4 text-[14px] text-frost neu-inset outline-none placeholder:text-haze/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky/50"

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...inputProps } = props
  return (
    <input
      {...inputProps}
      className={`h-12 shrink-0 ${wellClass} ${className}`}
    />
  )
}

function MoneyField({
  value,
  onValueChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "inputMode"> & {
  value: string
  onValueChange: (value: string) => void
}) {
  const [focused, setFocused] = useState(false)
  let display = value
  try {
    display = formatAmountInput(value, !focused)
  } catch {
    // Keep partially edited invalid text visible so the form can explain it.
  }

  return (
    <Field
      {...props}
      inputMode="numeric"
      value={display}
      onFocus={(event) => {
        setFocused(true)
        props.onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        props.onBlur?.(event)
      }}
      onChange={(event) => {
        try {
          onValueChange(formatAmountInput(event.target.value))
        } catch {
          onValueChange(event.target.value)
        }
      }}
    />
  )
}

function Choice({
  label,
  value,
  values,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  values: string[]
  placeholder?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const id = useId()
  const selectedIndex = values.indexOf(value)

  useEffect(() => {
    if (!open) return
    list.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", close)
    return () => document.removeEventListener("pointerdown", close)
  }, [open])

  useEffect(() => {
    if (open)
      list.current?.children[active]?.scrollIntoView({ block: "nearest" })
  }, [active, open])

  const toggle = () => {
    setActive(Math.max(0, selectedIndex))
    setOpen((state) => !state)
  }
  const pick = (item: string) => {
    onChange(item)
    setOpen(false)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false)
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) return toggle()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((index) => (index + step + values.length) % values.length)
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault()
      pick(values[active])
    }
  }

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={label}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={`flex h-[58px] w-full items-center gap-3 rounded-[16px] bg-night pl-4 pr-2 text-left transition-[box-shadow] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky/60 ${
          open ? "neu-inset" : "neu-raised-sm"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span
            className={`block text-[9px] font-bold tracking-[0.1em] ${
              open ? "text-sky" : "text-haze"
            }`}
          >
            {label.toUpperCase()}
          </span>
          <span
            className={`mt-0.5 block truncate text-[14px] font-medium ${
              value ? "text-frost" : "text-haze/80"
            }`}
          >
            {value || placeholder}
          </span>
        </span>
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-[12px] bg-night transition-[box-shadow,color] duration-150 ${
            open ? "text-sky neu-raised-sm" : "text-haze neu-inset"
          }`}
        >
          <Chevron up={open} />
        </span>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          className="menu-pop absolute inset-x-0 top-[calc(100%+10px)] z-30 flex max-h-[236px] flex-col gap-1 overflow-y-auto rounded-[18px] bg-night p-1.5 neu-raised"
        >
          {values.map((item, index) => {
            const selected = item === value
            return (
              <li
                key={item}
                id={`${id}-${index}`}
                role="option"
                aria-selected={selected}
                onPointerDown={(event) => event.preventDefault()}
                onPointerEnter={() => setActive(index)}
                onClick={() => pick(item)}
                className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-[12px] px-3 text-[13px] transition-[box-shadow,color] duration-100 ${
                  index === active ? "neu-inset" : ""
                } ${selected ? "font-bold text-sky" : "text-frost/90"}`}
              >
                <span className="min-w-0 flex-1 truncate">{item}</span>
                {selected && <Check />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TransactionRow({ item, who }: { item: Transaction who: string }) {
  const expense = item.kind === "expense"
  return (
    <Sheet inset className="flex h-16 shrink-0 items-center gap-3 px-3.5">
      <div className="w-8 shrink-0 text-center">
        <p className="text-[15px] font-bold leading-4 tabular-nums">
          {item.date.slice(8, 10)}
        </p>
        <p className="text-[9px] font-bold tracking-[0.06em] text-haze">
          {monthNames[Number(item.date.slice(5, 7)) - 1]
            .slice(0, 3)
            .toUpperCase()}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold">{item.description}</p>
        <p className="mt-0.5 truncate text-[10px] text-haze">
          {who} · {item.category}
        </p>
      </div>
      <p
        className={`shrink-0 text-[13px] font-bold tabular-nums ${
          expense ? "text-ember" : "text-mint"
        }`}
      >
        {expense ? "−" : "+"}
        {rupiah(item.amount)}
      </p>
    </Sheet>
  )
}

function MonthMenu({
  group,
  current,
  open,
  names,
  onToggle,
}: {
  group: MonthGroup
  current: boolean
  open: boolean
  names: Record<number, string>
  onToggle: () => void
}) {
  const month = monthNames[Number(group.period.slice(5, 7)) - 1]
  const net = group.income - group.expense
  const panel = useId()
  return (
    <section className="shrink-0 rounded-[22px] bg-night neu-raised">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-[22px] px-4 pb-3 pt-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-bold tracking-[-0.01em]">
              {month}
            </h2>
            {current && (
              <span className="rounded-full bg-night px-2 py-[3px] text-[9px] font-bold tracking-[0.08em] text-sky neu-inset">
                BULAN INI
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-haze tabular-nums">
            {group.items.length} catatan · sisa{" "}
            <span className={net < 0 ? "text-ember" : "text-frost"}>
              {rupiah(net)}
            </span>
          </p>
        </div>
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-full bg-night transition-[box-shadow,color] duration-150 ${
            open ? "text-sky neu-inset" : "text-haze neu-raised-sm"
          }`}
        >
          <Chevron up={open} />
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
        {([
          ["pengeluaran", group.expenseCount, group.expense, "text-ember", "−"],
          ["pemasukan", group.incomeCount, group.income, "text-mint", "+"],
        ] as const).map(([label, count, total, color, sign]) => (
          <Sheet inset key={label} className="px-3 py-2.5">
            <p className="text-[12px] text-haze">
              <span className="text-[17px] font-bold text-frost tabular-nums">
                {count}
              </span>{" "}
              {label}
            </p>
            <p
              className={`mt-0.5 truncate text-[13px] font-bold tabular-nums ${color}`}
            >
              {count ? sign : ""}
              {rupiah(total)}
            </p>
          </Sheet>
        ))}
      </div>

      <div
        id={panel}
        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2.5 px-3 pb-3.5">
            {group.items.map((item) => (
              <TransactionRow
                key={item.id}
                item={item}
                who={names[item.memberId]}
              />
            ))}
            {!group.items.length && (
              <p className="px-2 pb-1 text-[13px] leading-5 text-haze">
                Belum ada catatan di bulan ini. Catatan bulan lalu tetap
                tersimpan di bawah.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function FormModal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#03060d]/60 px-[4%]">
      <div className="flex h-[88%] w-full flex-col rounded-[28px] bg-night p-5 neu-raised">
        <div className="flex h-[42px] items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-[22px] font-bold tracking-[-0.01em]">
            {title}
          </h2>
          <div className="w-20">
            <Action size="sm" onClick={onClose}>
              Tutup
            </Action>
          </div>
        </div>
        <div className="-mx-2 mt-3 flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-2 py-2">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function PhonePreview() {
  const [screen, setScreen] = useState<Screen>("dashboard")
  const [modal, setModal] = useState<Modal>(null)
  const [members, setMembers] = useState<Member[]>(seedMembers)
  const [bills, setBills] = useState<Bill[]>(seedBills)
  const [transactions, setTransactions] =
    useState<Transaction[]>(seedTransactions)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [draft, setDraft] = useState<ReceiptDraft | null>(null)
  const [billDraft, setBillDraft] = useState<ReceiptDraft | null>(null)
  const [payment, setPayment] = useState<Transfer | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const liveDate = useLiveDate()
  const currentPeriod = liveDate.slice(0, 7)
  const names = Object.fromEntries(
    members.map((member) => [member.id, member.name]),
  )
  const currentTransactions = useMemo(
    () => transactions.filter((item) => item.date.startsWith(currentPeriod)),
    [transactions, currentPeriod],
  )
  // Every month that has records becomes its own menu; the running month always exists.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, MonthGroup>()
    const group = (period: string) => {
      if (!groups.has(period)) {
        groups.set(period, {
          period,
          items: [],
          income: 0,
          expense: 0,
          incomeCount: 0,
          expenseCount: 0,
        })
      }
      return groups.get(period)!
    }
    group(currentPeriod)
    for (const item of transactions) {
      const target = group(item.date.slice(0, 7))
      target.items.push(item)
      target[item.kind] += item.amount
      target[item.kind === "income" ? "incomeCount" : "expenseCount"] += 1
    }
    for (const target of groups.values())
      target.items.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    return [...groups.values()].sort((a, b) => b.period.localeCompare(a.period))
  }, [transactions, currentPeriod])
  const groupsByYear = monthGroups.reduce<[string, MonthGroup[]][]>(
    (years, item) => {
      const year = item.period.slice(0, 4)
      const last = years.at(-1)
      if (last?.[0] === year) last[1].push(item)
      else years.push([year, [item]])
      return years
    },
    [],
  )
  const [liveYear, liveMonth, liveDay] = liveDate.split("-").map(Number)

  const summary = useMemo(() => {
    const value = { income: 0, expense: 0 }
    for (const item of currentTransactions) value[item.kind] += item.amount
    return value
  }, [currentTransactions])

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const item of currentTransactions.filter(
      (entry) => entry.kind === "expense",
    )) {
      totals[item.category] = (totals[item.category] ?? 0) + item.amount
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1])
  }, [currentTransactions])

  const transfers = simplifyDebts(balances(members, bills, settlements))
  const peak = Math.max(1, ...categoryTotals.map(([, value]) => value))
  const page = screens[screen]
  const openManualBill = () => {
    setBillDraft(null)
    setModal("bill")
  }

  return (
    <div className="relative h-[780px] w-[390px] overflow-hidden rounded-[44px] bg-night shadow-[0_0_0_10px_#070b13,18px_18px_44px_rgba(0,0,0,0.55),-12px_-12px_32px_rgba(48,66,99,0.35)]">
      <div className="flex h-7 items-center justify-between px-8 pt-2 text-[11px] font-medium text-frost/70">
        <span>09.41</span>
        <span
          className="h-1.5 w-16 rounded-full bg-[#070b13]"
          aria-hidden="true"
        />
        <span>86%</span>
      </div>

      <div className="flex h-[752px] flex-col">
        <header className="h-[82px] shrink-0 px-5 pb-2 pt-3">
          <p className="text-[10px] font-bold tracking-[0.08em] text-sky">
            {page.kicker.toUpperCase()}
          </p>
          <h1 className="mt-1 truncate text-[27px] font-bold leading-[42px] tracking-[-0.02em]">
            {page.title}
          </h1>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 pt-3.5">
          <div className="flex flex-col gap-4">
            {screen === "dashboard" && (
              <>
                <section className="rounded-[24px] bg-night p-5 neu-raised">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-haze">
                    SISA ARUS KAS
                  </p>
                  <p className="mt-1.5 text-[32px] font-bold tabular-nums tracking-[-0.03em]">
                    {rupiah(summary.income - summary.expense)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {([
                      ["Masuk", summary.income, "text-mint"],
                      ["Keluar", summary.expense, "text-ember"],
                    ] as const).map(([label, value, color]) => (
                      <Sheet inset key={label} className="px-3 py-2">
                        <p className="text-[10px] text-haze">{label}</p>
                        <p
                          className={`text-[13px] font-bold tabular-nums ${color}`}
                        >
                          {rupiah(value)}
                        </p>
                      </Sheet>
                    ))}
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-3.5">
                  <Action tone="primary" onClick={() => setModal("scan")}>
                    Pindai struk
                  </Action>
                  <Action onClick={() => setModal("transaction")}>
                    Catat transaksi
                  </Action>
                </div>

                <Label>ALIRAN UTANG</Label>
                <Sheet className="flex flex-col gap-2.5 p-3">
                  {transfers.length ? (
                    transfers.map(([from, to, value]) => (
                      <button
                        type="button"
                        key={`${from}-${to}`}
                        onClick={() => {
                          setPayment({ from, to, amount: value })
                          setModal("payment")
                        }}
                        className="flex h-[52px] items-center justify-between gap-3 rounded-[14px] bg-night px-4 text-left neu-inset transition-[box-shadow] duration-150 hover:neu-raised-sm focus-visible:outline-2 focus-visible:outline-sky/60"
                      >
                        <p className="text-[14px] font-bold">
                          {names[from]}{" "}
                          <span className="px-1 text-ember">→</span> {names[to]}
                        </p>
                        <p className="text-[14px] font-bold text-ember tabular-nums">
                          {rupiah(value)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <p className="px-2 py-3 text-[14px] text-haze">
                      Semua beres. Belum ada utang aktif.
                    </p>
                  )}
                </Sheet>
                {transfers.length > 0 && (
                  <p className="-mt-1.5 px-1 text-[11px] text-haze">
                    Ketuk slip untuk membayar lewat bank atau mengingatkan.
                  </p>
                )}

                <Label>POLA PENGELUARAN</Label>
                <Sheet className="px-4 py-2.5">
                  {categoryTotals.map(([category, value]) => (
                    <div
                      key={category}
                      className="grid h-11 grid-cols-[1fr_1fr_1fr] items-center gap-2"
                    >
                      <p className="truncate text-[13px] font-bold">
                        {category}
                      </p>
                      <div className="h-3 rounded-full bg-night p-[2px] neu-inset">
                        <div
                          className="h-full rounded-full bg-mint"
                          style={{
                            width: `${Math.max(10, (value / peak) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-right text-[12px] text-haze tabular-nums">
                        {rupiah(value)}
                      </p>
                    </div>
                  ))}
                </Sheet>

                <div className="grid grid-cols-2 gap-3.5">
                  <Action>Ekspor Excel</Action>
                  <Action>Ekspor PDF</Action>
                </div>
              </>
            )}

            {screen === "bills" && (
              <>
                <div className="grid grid-cols-2 gap-3.5">
                  <Action tone="primary" onClick={() => setModal("scan")}>
                    Pindai struk
                  </Action>
                  <Action onClick={openManualBill}>Tambah manual</Action>
                </div>
                {bills.map((bill) => (
                  <Sheet key={bill.id} className="h-[94px] px-4 py-2.5">
                    <div className="flex h-[42px] items-center justify-between gap-3">
                      <p className="truncate text-[16px] font-bold">
                        {bill.title}
                      </p>
                      <p className="shrink-0 text-[15px] font-bold text-frost tabular-nums">
                        {rupiah(bill.total)}
                      </p>
                    </div>
                    <p className="truncate text-[11px] text-haze">
                      {bill.date} · dibayar {names[bill.payerId]} ·{" "}
                      {methodLabel[bill.method]}
                    </p>
                  </Sheet>
                ))}
              </>
            )}

            {screen === "expenses" && (
              <>
                <Action tone="primary" onClick={() => setModal("transaction")}>
                  Catat pemasukan atau pengeluaran
                </Action>
                <p
                  className="-mt-1 flex items-center gap-2 px-1 text-[11px] text-haze"
                  role="status"
                >
                  <span
                    className="size-1.5 rounded-full bg-mint shadow-[0_0_8px_rgba(95,211,164,0.8)]"
                    aria-hidden="true"
                  />
                  Terdeteksi otomatis · {liveDay} {monthNames[liveMonth - 1]}{" "}
                  {liveYear}
                </p>
                {groupsByYear.map(([year, groups]) => (
                  <div key={year} className="flex flex-col gap-4">
                    <Label>TAHUN {year}</Label>
                    {groups.map((group) => (
                      <MonthMenu
                        key={group.period}
                        group={group}
                        current={group.period === currentPeriod}
                        open={
                          expanded[group.period] ??
                          group.period === currentPeriod
                        }
                        names={names}
                        onToggle={() =>
                          setExpanded((state) => ({
                            ...state,
                            [group.period]: !(
                              state[group.period] ??
                              group.period === currentPeriod
                            ),
                          }))
                        }
                      />
                    ))}
                  </div>
                ))}
              </>
            )}

            {screen === "members" && (
              <>
                <Action tone="primary" onClick={() => setModal("member")}>
                  Tambah anggota
                </Action>
                {members.map((member) => (
                  <Sheet
                    key={member.id}
                    className="flex h-20 items-center gap-3.5 px-4 py-2.5"
                  >
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-night text-[15px] font-bold text-sky neu-inset">
                      {member.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">
                        {member.name}
                        {member.isOwner ? " · Saya" : ""}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-haze">
                        {member.paymentInfo || "Info pembayaran belum diisi"}
                      </p>
                    </div>
                    <p className="text-right text-[11px] leading-4 text-haze tabular-nums">
                      Budget
                      <br />
                      {rupiah(member.budget)}
                    </p>
                  </Sheet>
                ))}
              </>
            )}
          </div>
        </main>

        <div className="h-[84px] shrink-0 px-4 pb-3.5 pt-1.5">
          <nav
            className="grid h-full grid-cols-4 gap-1 rounded-[22px] bg-night p-1.5 neu-raised"
            aria-label="Navigasi utama"
          >
            {(Object.keys(screens) as Screen[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-current={screen === key ? "page" : undefined}
                onClick={() => setScreen(key)}
                className={`rounded-[16px] text-[11px] font-bold transition-[box-shadow,color] duration-150 focus-visible:outline-2 focus-visible:outline-sky/60 ${
                  screen === key
                    ? "text-sky neu-inset"
                    : "text-frost hover:text-sky"
                }`}
              >
                {screens[key].nav}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {modal === "member" && (
        <MemberForm
          onClose={() => setModal(null)}
          onSave={(member) => {
            setMembers((items) => [
              ...items,
              { ...member, id: Math.max(...items.map((m) => m.id)) + 1 },
            ])
            setModal(null)
          }}
        />
      )}
      {modal === "transaction" && (
        <TransactionForm
          members={members}
          onClose={() => setModal(null)}
          onSave={(item) => {
            setTransactions((items) => [{ ...item, id: Date.now() }, ...items])
            setModal(null)
          }}
        />
      )}
      {modal === "bill" && (
        <BillForm
          members={members}
          draft={billDraft}
          onClose={() => setModal(null)}
          onSave={(bill) => {
            setBills((items) => [{ ...bill, id: Date.now() }, ...items])
            const generated = Object.entries(bill.shares)
              .filter(([id]) => Number(id) !== bill.payerId)
              .map(([id, amount], index) => ({
                id: Date.now() + index + 1,
                memberId: Number(id),
                kind: "expense" as const,
                category: "Patungan",
                description: bill.title,
                amount,
                date: localISODate(),
              }))
            setTransactions((items) => [...generated, ...items])
            setBillDraft(null)
            setModal(null)
          }}
        />
      )}
      {modal === "scan" && (
        <ScanModal
          onClose={() => setModal(null)}
          onText={(text) => {
            setDraft(parseReceipt(text))
            setModal("review")
          }}
        />
      )}
      {modal === "review" && draft && (
        <ReviewForm
          draft={draft}
          onClose={() => setModal(null)}
          onNext={(next) => {
            setBillDraft(next)
            setModal("bill")
          }}
          onRecord={(next) => {
            setDraft(next)
            setModal("record")
          }}
        />
      )}
      {modal === "record" && draft && (
        <RecordForm
          draft={draft}
          members={members}
          onClose={() => setModal(null)}
          onSave={(item) => {
            setTransactions((items) => [{ ...item, id: Date.now() }, ...items])
            setModal(null)
            setScreen("expenses")
          }}
        />
      )}
      {modal === "payment" && payment && (
        <PaymentModal
          transfer={payment}
          debtor={members.find((item) => item.id === payment.from)!}
          creditor={members.find((item) => item.id === payment.to)!}
          onClose={() => setModal(null)}
          onSettle={() => {
            setSettlements((items) => [...items, payment])
            setModal(null)
          }}
        />
      )}
    </div>
  )
}

function Status({ error }: { error: string }) {
  return (
    <p className="min-h-7 shrink-0 px-1 text-[12px] text-ember" role="status">
      {error}
    </p>
  )
}

function MemberForm({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (member: Omit<Member, "id">) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [provider, setProvider] = useState("")
  const [account, setAccount] = useState("")
  const [budget, setBudget] = useState("")
  const [role, setRole] = useState("Anggota kos")
  const [error, setError] = useState("")
  return (
    <FormModal title="Anggota baru" onClose={onClose}>
      <Field
        placeholder="Nama panggilan"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        placeholder="Nomor WhatsApp"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Choice
        label="Bank atau e-wallet"
        placeholder="Pilih bank atau e-wallet"
        value={provider}
        values={[...providers.map((item) => item.label), "Lainnya"]}
        onChange={setProvider}
      />
      <Field
        inputMode="numeric"
        placeholder="Nomor rekening atau nomor e-wallet"
        value={account}
        onChange={(e) => setAccount(e.target.value)}
      />
      <MoneyField
        placeholder="Budget bulanan, contoh 1.500.000"
        value={budget}
        onValueChange={setBudget}
      />
      <Choice
        label="Peran"
        value={role}
        values={["Anggota kos", "Saya / pemilik catatan"]}
        onChange={setRole}
      />
      <Status error={error} />
      <Action
        tone="primary"
        onClick={() => {
          try {
            if (!name.trim()) throw new Error("Nama wajib diisi")
            const label = provider === "Lainnya" ? "" : provider
            onSave({
              name: name.trim(),
              phone,
              paymentInfo: account.trim()
                ? formatPaymentInfo(label, account, name)
                : "",
              budget: parseAmount(budget),
              isOwner: role.startsWith("Saya"),
            })
          } catch (reason) {
            setError((reason as Error).message)
          }
        }}
      >
        Simpan anggota
      </Action>
    </FormModal>
  )
}

function TransactionForm({
  members,
  onClose,
  onSave,
}: {
  members: Member[]
  onClose: () => void
  onSave: (item: Omit<Transaction, "id">) => void
}) {
  const [member, setMember] = useState(members[0].name)
  const [kind, setKind] = useState("Pengeluaran")
  const [category, setCategory] = useState(categories[0])
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [error, setError] = useState("")
  return (
    <FormModal title="Catat transaksi" onClose={onClose}>
      <Choice
        label="Anggota"
        value={member}
        values={members.map((item) => item.name)}
        onChange={setMember}
      />
      <Choice
        label="Jenis"
        value={kind}
        values={["Pengeluaran", "Pemasukan"]}
        onChange={setKind}
      />
      <Choice
        label="Kategori"
        value={category}
        values={categories}
        onChange={setCategory}
      />
      <Field
        placeholder="Keterangan"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <MoneyField
        placeholder="Nominal Rupiah"
        value={amount}
        onValueChange={setAmount}
      />
      <Status error={error} />
      <Action
        tone="primary"
        onClick={() => {
          try {
            const nominal = parseAmount(amount)
            if (!description.trim() || nominal <= 0)
              throw new Error("Keterangan dan nominal wajib diisi")
            onSave({
              memberId: members.find((item) => item.name === member)!.id,
              kind: kind === "Pengeluaran" ? "expense" : "income",
              category,
              description: description.trim(),
              amount: nominal,
              date: localISODate(),
            })
          } catch (reason) {
            setError((reason as Error).message)
          }
        }}
      >
        Simpan transaksi
      </Action>
    </FormModal>
  )
}

function BillForm({
  members,
  draft,
  onClose,
  onSave,
}: {
  members: Member[]
  draft: ReceiptDraft | null
  onClose: () => void
  onSave: (bill: Omit<Bill, "id">) => void
}) {
  const prefill = draft ? billValues(draft) : null
  const everyone = members.map((item) => item.name).join("+")
  const [title, setTitle] = useState(
    draft ? draft.merchant || "Struk belanja" : "Belanja dapur",
  )
  const [payer, setPayer] = useState(members[0].name)
  const [method, setMethod] = useState(draft ? "Per item" : "Bagi rata")
  const [subtotal, setSubtotal] = useState(String(prefill?.[0] ?? 120000))
  const [extra, setExtra] = useState(String(prefill?.[1] ?? 6000))
  const [discount, setDiscount] = useState(String(prefill?.[2] ?? 0))
  const [detail, setDetail] = useState(
    draft
      ? draft.items
          .map(
            (item) =>
              `${item.name}|${item.price.toLocaleString("id-ID")}|${everyone}`,
          )
          .join("\n")
      : "",
  )
  const [error, setError] = useState("")
  const hint = prefill
    ? `Total struk ${rupiah(prefill[0] + prefill[1] - prefill[2])}. Ubah nama di akhir setiap baris sesuai pemesan.`
    : ""
  const ids = Object.fromEntries(
    members.map((item) => [item.name.toLowerCase(), item.id]),
  )

  const memberId = (name: string) => {
    const id = ids[name.trim().toLowerCase()]
    if (!id) throw new Error(`anggota "${name.trim()}" tidak ditemukan`)
    return id
  }

  const keyValues = (decimal = false) => {
    const result: Record<number, number> = {}
    for (const pair of detail
      .replace(/\n/g, ",")
      .split(",")
      .filter((part) => part.trim())) {
      const [name, value] = pair.split("=")
      if (value === undefined) throw new Error("gunakan format Nama=nilai")
      result[memberId(name)] = decimal
        ? Number(value.trim())
        : parseAmount(value)
    }
    return result
  }

  const examples: Record<string, string> = {
    "Nominal kustom": "Ayu=60.000, Bima=66.000",
    Persentase: "Ayu=60, Bima=40",
    "Per item":
      "Nasi goreng|50.000|Ayu\nEs teh|20.000|Bima\nKentang|50.000|Ayu+Bima",
  }

  return (
    <FormModal
      title={draft ? "Tagihan dari struk" : "Tagihan baru"}
      onClose={onClose}
    >
      <Field
        placeholder="Judul, contoh Token listrik"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Choice
        label="Dibayar oleh"
        value={payer}
        values={members.map((item) => item.name)}
        onChange={setPayer}
      />
      <Choice
        label="Metode bagi"
        value={method}
        values={["Bagi rata", "Nominal kustom", "Persentase", "Per item"]}
        onChange={(value) => {
          setMethod(value)
          setDetail(examples[value] ?? "")
          setError("")
        }}
      />
      <MoneyField
        placeholder="Subtotal"
        value={subtotal}
        onValueChange={setSubtotal}
      />
      <MoneyField
        placeholder="Pajak, layanan, dan ongkir"
        value={extra}
        onValueChange={setExtra}
      />
      <MoneyField
        placeholder="Diskon"
        value={discount}
        onValueChange={setDiscount}
      />
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder={
          "Detail pembagian. Contoh:\nAyu=60.000, Bima=40.000\natau per item: Nasi|20.000|Ayu+Bima"
        }
        className={`h-[116px] shrink-0 resize-none py-3 leading-5 ${wellClass}`}
      />
      <p className="shrink-0 px-1 text-[11px] leading-4 text-haze">
        Bagi rata memakai semua anggota. Untuk metode lain, tulis nama sesuai
        daftar anggota.
      </p>
      {error ? (
        <Status error={error} />
      ) : (
        <p className="min-h-7 shrink-0 px-1 text-[12px] text-mint">{hint}</p>
      )}
      <Action
        tone="primary"
        onClick={() => {
          try {
            const sub = parseAmount(subtotal)
            const add = parseAmount(extra)
            const cut = parseAmount(discount)
            const total = sub + add - cut
            if (!title.trim() || sub <= 0 || total < 0)
              throw new Error("Judul dan subtotal wajib diisi")
            let shares: Record<number, number>
            let key: Bill["method"]
            if (method === "Bagi rata") {
              shares = equalSplit(
                total,
                members.map((item) => item.id),
              )
              key = "equal"
            } else if (method === "Nominal kustom") {
              shares = keyValues()
              if (Object.values(shares).reduce((a, b) => a + b, 0) !== total) {
                throw new Error(`jumlah nominal harus ${rupiah(total)}`)
              }
              key = "custom_amount"
            } else if (method === "Persentase") {
              const percentages = keyValues(true)
              if (
                Object.values(percentages).reduce((a, b) => a + b, 0) !== 100
              ) {
                throw new Error("total persentase harus tepat 100")
              }
              shares = allocateWeighted(total, percentages)
              key = "percentage"
            } else {
              const items = detail
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => {
                  const [name, price, people] = line.split("|")
                  if (!name || !price || !people)
                    throw new Error("gunakan format item|harga|Nama+Nama")
                  return {
                    price: parseAmount(price),
                    members: people.split("+").map(memberId),
                  }
                })
              if (items.reduce((sum, item) => sum + item.price, 0) !== sub) {
                throw new Error("jumlah harga item harus sama dengan subtotal")
              }
              shares = itemizedSplit(items, add, cut)
              key = "itemized"
            }
            onSave({
              title: title.trim(),
              date: localISODate(),
              payerId: memberId(payer),
              method: key,
              total,
              shares,
            })
          } catch (reason) {
            setError(`Periksa pembagian: ${(reason as Error).message}`)
          }
        }}
      >
        Hitung dan simpan
      </Action>
    </FormModal>
  )
}

function ScanModal({
  onClose,
  onText,
}: {
  onClose: () => void
  onText: (text: string) => void
}) {
  const [source, setSource] = useState<keyof typeof sampleReceipts>("camera")
  const [scanning, setScanning] = useState(false)
  const [pasted, setPasted] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!scanning) return
    const timer = window.setTimeout(() => onText(sampleReceipts[source]), 1500)
    return () => window.clearTimeout(timer)
  }, [scanning, source, onText])

  const start = (next: keyof typeof sampleReceipts) => {
    setSource(next)
    setScanning(true)
  }

  return (
    <FormModal title="Pindai struk" onClose={onClose}>
      <div className="relative h-[230px] shrink-0 overflow-hidden rounded-[18px] bg-abyss neu-inset">
        <div className="absolute inset-x-10 top-5 rotate-[-1.5deg] rounded-[3px] bg-[#f4f1e8] px-3 py-3 font-mono text-[8.5px] leading-[12px] whitespace-pre text-[#2a2a2a] shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          {sampleReceipts[source]}
        </div>
        {([
          "left-6 top-3 border-l-2 border-t-2",
          "right-6 top-3 border-r-2 border-t-2",
          "bottom-3 left-6 border-b-2 border-l-2",
          "bottom-3 right-6 border-b-2 border-r-2",
        ] as const).map((corner) => (
          <span
            key={corner}
            className={`absolute size-6 rounded-[4px] border-sky ${corner}`}
            aria-hidden="true"
          />
        ))}
        {scanning && (
          <>
            <span
              className="scan-line absolute inset-x-6 top-3 h-0.5 bg-sky shadow-[0_0_14px_3px_rgba(124,184,255,0.7)]"
              aria-hidden="true"
            />
            <p
              className="absolute inset-x-0 bottom-5 text-center text-[12px] font-bold text-sky"
              role="status"
            >
              Membaca teks di perangkat...
            </p>
          </>
        )}
      </div>
      <p className="shrink-0 px-1 text-[11px] leading-4 text-haze">
        Simulasi pratinjau. Di APK, Google ML Kit membuka kamera dan membaca
        struk asli langsung di ponsel.
      </p>
      <Action tone="primary" onClick={() => start("camera")}>
        Buka kamera pemindai
      </Action>
      <Action onClick={() => start("gallery")}>Pilih foto dari galeri</Action>
      <Label>ATAU TEMPEL TEKS STRUK</Label>
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="Tempel teks struk di sini, satu baris per item"
        className={`h-[120px] shrink-0 resize-none py-3 leading-5 ${wellClass}`}
      />
      <Action
        onClick={() => {
          if (!pasted.trim()) setError("Belum ada teks struk untuk dibaca.")
          else onText(pasted)
        }}
      >
        Baca teks
      </Action>
      <Status error={error} />
    </FormModal>
  )
}

function ReviewForm({
  draft,
  onClose,
  onNext,
  onRecord,
}: {
  draft: ReceiptDraft
  onClose: () => void
  onNext: (draft: ReceiptDraft) => void
  onRecord: (draft: ReceiptDraft) => void
}) {
  const [merchant, setMerchant] = useState(draft.merchant)
  const [items, setItems] = useState(itemsToText(draft.items))
  const [fees, setFees] = useState(String(draft.taxService))
  const [cut, setCut] = useState(String(draft.discount))
  const [total, setTotal] = useState(String(draft.total))
  const [error, setError] = useState("")

  const rebuild = (): ReceiptDraft => {
    const parsed = itemsFromText(items)
    return {
      merchant: merchant.trim(),
      items: parsed,
      subtotal: parsed.reduce((sum, item) => sum + item.price, 0),
      taxService: parseReceiptAmount(fees || "0"),
      discount: parseReceiptAmount(cut || "0"),
      total: parseReceiptAmount(total || "0"),
      notes: [],
    }
  }

  let summary = ""
  let matches = false
  try {
    const current = rebuild()
    matches = current.total === 0 || current.total === computedTotal(current)
    summary = `Item ${rupiah(current.subtotal)} + biaya ${rupiah(current.taxService)} - diskon ${rupiah(current.discount)} = ${rupiah(computedTotal(current))}`
  } catch (reason) {
    summary = (reason as Error).message
  }

  return (
    <FormModal title="Periksa hasil" onClose={onClose}>
      <Label>NAMA TEMPAT</Label>
      <Field
        value={merchant}
        placeholder="Nama toko atau restoran"
        onChange={(e) => setMerchant(e.target.value)}
      />
      <Label>ITEM, FORMAT NAMA|HARGA</Label>
      <textarea
        value={items}
        onChange={(e) => setItems(e.target.value)}
        className={`h-[150px] shrink-0 resize-none py-3 font-mono text-[12px] leading-5 ${wellClass}`}
      />
      <div className="flex shrink-0 flex-col gap-2.5">
        {([
          ["BIAYA", fees, setFees],
          ["DISKON", cut, setCut],
          ["TOTAL STRUK", total, setTotal],
        ] as const).map(([label, value, setter]) => (
          <label
            key={label}
            className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3"
          >
            <span className="text-[9px] font-bold tracking-[0.08em] text-haze">
              {label}
            </span>
            <MoneyField
              aria-label={label}
              value={value}
              onValueChange={setter}
              className="h-11 min-w-0 px-4 text-right text-[15px] font-bold tabular-nums"
            />
          </label>
        ))}
      </div>
      <p
        className={`shrink-0 px-1 text-[12px] leading-4 tabular-nums ${
          matches ? "text-mint" : "text-ember"
        }`}
      >
        {summary}
      </p>
      {draft.notes.length > 0 && !error && (
        <p className="shrink-0 px-1 text-[12px] leading-4 text-ember">
          {draft.notes.join(" ")}
        </p>
      )}
      <Status error={error} />
      <Label>MAU DIAPAKAN STRUK INI?</Label>
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <Action
          tone="primary"
          onClick={() => {
            try {
              const current = rebuild()
              if (!current.items.length)
                throw new Error("Tambahkan minimal satu item")
              onNext(current)
            } catch (reason) {
              setError((reason as Error).message)
            }
          }}
        >
          Bagi tagihan
        </Action>
        <Action
          onClick={() => {
            try {
              const current = rebuild()
              if ((current.total || computedTotal(current)) <= 0)
                throw new Error("Total struk masih Rp0")
              onRecord(current)
            } catch (reason) {
              setError((reason as Error).message)
            }
          }}
        >
          Catat pengeluaran
        </Action>
      </div>
      <p className="shrink-0 px-1 text-[11px] leading-4 text-haze">
        Bagi tagihan untuk patungan. Catat pengeluaran jika dibayar sendiri.
      </p>
    </FormModal>
  )
}

/** Saves a scanned receipt straight to Catatan as one expense. */
function RecordForm({
  draft,
  members,
  onClose,
  onSave,
}: {
  draft: ReceiptDraft
  members: Member[]
  onClose: () => void
  onSave: (item: Omit<Transaction, "id">) => void
}) {
  // The printed total wins; fall back to the item sum when OCR missed it.
  const nominal = draft.total || computedTotal(draft)
  const [category, setCategory] = useState(() =>
    guessCategory(
      draft.merchant,
      draft.items.map((item) => item.name),
    ),
  )
  const [member, setMember] = useState(members[0]?.name ?? "")
  const [description, setDescription] = useState(
    draft.merchant || "Belanja dari struk",
  )
  const [amount, setAmount] = useState(String(nominal))
  const [error, setError] = useState("")
  const shown = (() => {
    try {
      return parseAmount(amount)
    } catch {
      return 0
    }
  })()

  if (!members.length) {
    return (
      <FormModal title="Catat dari struk" onClose={onClose}>
        <Status error="Tambahkan anggota terlebih dahulu." />
      </FormModal>
    )
  }

  return (
    <FormModal title="Catat dari struk" onClose={onClose}>
      <Sheet inset className="shrink-0 px-4 py-3">
        <p className="text-[10px] font-bold tracking-[0.08em] text-haze">
          TOTAL
        </p>
        <p className="text-[28px] font-bold tabular-nums tracking-[-0.02em] text-ember">
          {rupiah(shown)}
        </p>
      </Sheet>
      <Choice
        label="Kategori"
        value={category}
        values={categories}
        onChange={setCategory}
      />
      <p className="-mt-1 shrink-0 px-1 text-[11px] leading-4 text-haze">
        Kategori dipilih otomatis dari nama toko dan item. Ganti jika kurang
        tepat.
      </p>
      <Choice
        label="Dibayar oleh"
        value={member}
        values={members.map((item) => item.name)}
        onChange={setMember}
      />
      <Field
        placeholder="Keterangan"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <MoneyField
        placeholder="Nominal Rupiah"
        value={amount}
        onValueChange={setAmount}
      />
      <Status error={error} />
      <Action
        tone="primary"
        onClick={() => {
          try {
            const total = parseAmount(amount)
            if (!description.trim() || total <= 0)
              throw new Error("Keterangan dan nominal wajib diisi")
            onSave({
              memberId: members.find((item) => item.name === member)!.id,
              kind: "expense",
              category,
              description: description.trim(),
              amount: total,
              date: localISODate(),
            })
          } catch (reason) {
            setError((reason as Error).message)
          }
        }}
      >
        Simpan ke catatan
      </Action>
    </FormModal>
  )
}

function PaymentModal({
  transfer,
  debtor,
  creditor,
  onClose,
  onSettle,
}: {
  transfer: Transfer
  debtor: Member
  creditor: Member
  onClose: () => void
  onSettle: () => void
}) {
  const target = parsePaymentInfo(creditor.paymentInfo)
  const [status, setStatus] = useState("")
  const appLabel = target.provider?.label ?? "aplikasi bank"

  return (
    <FormModal title={`Bayar ke ${creditor.name}`} onClose={onClose}>
      <section className="shrink-0 rounded-[22px] bg-night p-[18px] neu-raised">
        <p className="text-[10px] font-bold tracking-[0.08em] text-haze">
          {debtor.name.toUpperCase()} MEMBAYAR
        </p>
        <p className="mt-1 text-[30px] font-bold tabular-nums tracking-[-0.03em] text-ember">
          {rupiah(transfer.amount)}
        </p>
        <Sheet inset className="mt-3 px-3.5 py-2">
          <p className="text-[11px] font-bold text-sky">{target.label}</p>
          <p className="text-[15px] font-bold tabular-nums">
            {target.accountNumber || "Info pembayaran belum diisi"}
          </p>
        </Sheet>
      </section>
      <p
        className="min-h-10 shrink-0 px-1 text-[12px] leading-4 text-mint"
        role="status"
      >
        {status}
      </p>
      {target.accountNumber && (
        <Action
          tone="primary"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(target.accountNumber)
              .catch(() => undefined)
            setStatus(
              `Nomor disalin. Di APK, ${appLabel} langsung terbuka untuk transfer ${rupiah(transfer.amount)}.`,
            )
          }}
        >
          Salin nomor dan buka {appLabel}
        </Action>
      )}
      {debtor.phone && (
        <Action
          onClick={() =>
            window.open(
              whatsappUrl(
                debtor.phone,
                paymentReminder(
                  debtor.name,
                  creditor.name,
                  transfer.amount,
                  target,
                ),
              ),
              "_blank",
              "noopener",
            )
          }
        >
          Ingatkan {debtor.name} via WhatsApp
        </Action>
      )}
      <Action onClick={onSettle}>Tandai sudah lunas</Action>
      <p className="shrink-0 px-1 text-[11px] leading-4 text-haze">
        KosSplit tidak masuk ke akun bank. Transfer tetap dikonfirmasi di
        aplikasi resmi bank.
      </p>
    </FormModal>
  )
}
