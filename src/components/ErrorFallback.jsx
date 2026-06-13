import RandomCat from './CatSvg/RandomCat.jsx';

export default function ErrorFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        textAlign: 'center',
        background: 'var(--bg)',
        color: 'var(--ink)',
      }}
    >
      <RandomCat size={300} />
      <p style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.6, color: 'var(--ink-2)' }}>
        網站程式出錯了...我們會回報工程師並盡快搶修！
      </p>
    </div>
  );
}
