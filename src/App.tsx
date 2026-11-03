import PhonePreview from "./PhonePreview"

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center gap-16 px-6 py-10 max-lg:flex-col max-lg:gap-10">
      <section className="max-w-[340px] max-lg:text-center">
        <p className="text-[11px] font-bold tracking-[0.12em] text-sky">
          PRATINJAU APK KIVY
        </p>
        <h1 className="mt-3 text-[44px] font-bold leading-[0.98] tracking-[-0.045em] text-balance">
          KosSplit sebelum masuk ke ponsel.
        </h1>
        <p className="mt-5 text-[15px] leading-6 text-haze text-pretty">
          Neumorphism biru gelap dengan permukaan timbul dan cekung, mengikuti
          <code> kossplit_android/main.py</code>. Data contoh dapat ditambah
          untuk mencoba alur aplikasi.
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-frost/10 pt-5 text-left text-[13px]">
          <div>
            <dt className="text-haze">Framework</dt>
            <dd className="mt-1 font-bold">Kivy 2.3</dd>
          </div>
          <div>
            <dt className="text-haze">Database</dt>
            <dd className="mt-1 font-bold">SQLite lokal</dd>
          </div>
          <div>
            <dt className="text-haze">Layar</dt>
            <dd className="mt-1 font-bold">4 tab utama</dd>
          </div>
          <div>
            <dt className="text-haze">Status data</dt>
            <dd className="mt-1 font-bold">Per bulan, otomatis</dd>
          </div>
        </dl>
      </section>
      <PhonePreview />
    </main>
  )
}
