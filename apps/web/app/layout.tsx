export const metadata = {
  title: "AI Video Factory",
  description: "Automated YouTube video generation via WhatsApp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
