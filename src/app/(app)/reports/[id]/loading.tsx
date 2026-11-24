export default function Loading() {
  return (
    <div className="grid" aria-busy="true" aria-label="Memuat">
      <section className="cell span-8 hero compact">
        <div className="skeleton pulse" style={{ height: 10, width: 140 }} />
        <div className="skeleton pulse" style={{ height: 34, width: '60%' }} />
      </section>
      <section className="cell span-4">
        <div className="skeleton pulse" style={{ height: 34 }} />
        <div className="skeleton pulse" style={{ height: 28, width: '70%' }} />
      </section>
      <section className="cell span-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton pulse" style={{ height: 64 }} />
        ))}
      </section>
      <section className="cell span-4">
        <div className="skeleton pulse" style={{ height: 80 }} />
        <div className="skeleton pulse" style={{ height: 120 }} />
      </section>
    </div>
  )
}
