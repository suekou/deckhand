import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@fontsource-variable/noto-sans-jp';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://deckhand-webmcp.suekou.workers.dev'),
  title: 'Deckhand — The agent-native slide editor',
  description:
    'A live presentation canvas where people edit visually and browser agents operate through semantic WebMCP tools.',
  applicationName: 'Deckhand',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Deckhand — The agent-native slide editor',
    description: 'A slide editor agents can actually operate.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1731,
        height: 909,
        alt: 'Deckhand agent-native slide editor',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Deckhand — The agent-native slide editor',
    description: 'A slide editor agents can actually operate.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta
          httpEquiv="origin-trial"
          content="ArxgjkKY0WzsdBdsWg1f3ITU8HfAbfXqBzdzGjv65xJ9Oom8rNEcVg+TfWr6m1XpDIYQyQL/lEqagmp1TeWT3QgAAABieyJvcmlnaW4iOiJodHRwczovL2RlY2toYW5kLXdlYm1jcC5zdWVrb3Uud29ya2Vycy5kZXY6NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMH0="
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
