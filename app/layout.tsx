import './globals.css'

export const metadata = {
  title: 'Bad Rally - Xếp Trận Cầu Lông',
  description: 'App xếp trận thông minh',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        {/* Ép nhận Tailwind trực tiếp bỏ qua mọi config */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>{children}</body>
    </html>
  )
}