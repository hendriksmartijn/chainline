export const dynamic = 'force-static'

export default function Offline() {
  return (
    <main className="stack">
      <h1>Chainline</h1>
      <div className="card">
        <p>Je bent offline.</p>
        <p className="muted">Je wax-status wordt live berekend uit je ritten, dus die kan ik nu niet tonen. Zodra je weer verbinding hebt, is alles bij.</p>
      </div>
    </main>
  )
}
