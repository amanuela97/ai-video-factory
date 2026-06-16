export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>AI Video Factory</h1>
      <p>Send a WhatsApp message to trigger video generation.</p>
      <p>Format: <code>topic | duration</code></p>
      <p>Example: <code>How inflation works | 5min</code></p>
    </main>
  );
}
