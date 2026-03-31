import "./globals.css";

export const metadata = {
  title: "CN 수입 원가 계산기",
  description: "중국 수입 원가 자동 계산 시스템",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
