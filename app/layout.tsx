import type { ReactNode } from "react"
import "./globals.css"

interface Props {
  children: ReactNode
}

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en">
      <head>
        <title>Phone Number Validator</title>
        <meta name="description" content="Validate phone numbers and identify mobile vs landline numbers" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
