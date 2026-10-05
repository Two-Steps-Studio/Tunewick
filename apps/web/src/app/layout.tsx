// The real root layout lives in [locale]/layout.tsx; this one only passes children through
// so that app/not-found.tsx can render for requests outside any locale.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
