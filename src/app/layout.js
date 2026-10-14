import "@fontsource-variable/inter";
import "./globals.css";
export const metadata = {
  title: "P-Ex Connect | Pekanbaru XChange",
  description: "Portal operasional Pekanbaru XChange Mall.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
