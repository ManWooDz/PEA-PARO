import './globals.css'

export const metadata = {
  title: 'PEA-PARO',
  description: 'PEA Power Autonomous Resource Optimizer — 3-Island Cascading Grid EMS',
}

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Font Awesome — CSS Web-Font mode only.
            The kit's default SVG mode mutates the DOM (replaces <i> with <svg>)
            which conflicts with React's reconciler:
              "removeChild: node to be removed is not a child of this node".
            We use the public CDN CSS instead — pure ::before pseudo-elements,
            no DOM mutation, no React conflict. Same icon names as the kit. */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
          integrity="sha512-SnH5WK+bZxgPHs44uWIX+LLJAJ9/2PkPKZ5QiAj6Ta86w+fsb2TkcmfRyVX3pBnMFcV7oQPJkl9QevSCWr3W6A=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
