// Kerangka halaman yang langsung tampil saat berpindah halaman, sementara data dimuat di server.
export default function Loading() {
  return (
    <div className="grid" aria-busy="true" aria-label="Memuat">
      <div className="blob low" aria-hidden />
      <section className="cell span-12 hero compact">
        <div className="skeleton pulse" style={{ height: 10, width: 90 }} />
        <div className="skeleton pulse" style={{ height: 44, width: 'min(520px, 80%)' }} />
        <div className="skeleton pulse" style={{ height: 10, width: 'min(380px, 60%)' }} />
      </section>
      {[0, 1, 2].map((i) => (
        <section key={i} className="cell span-4">
          <div className="skeleton pulse" style={{ height: 10, width: 70 }} />
          <div className="skeleton pulse" style={{ height: 22, width: '70%' }} />
          <div className="skeleton pulse" style={{ height: 60 }} />
        </section>
      ))}
    </div>
  )
}
