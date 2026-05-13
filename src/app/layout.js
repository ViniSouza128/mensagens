import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

// metadataBase é usado pelo Next pra resolver URLs relativas em og:image,
// twitter:image etc. WhatsApp/Telegram exigem URL absoluta no preview.
// NEXT_PUBLIC_SITE_URL é a forma de configurar isso em produção (tunnel
// Cloudflare, domínio próprio…). Fallback pra localhost em dev.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Mensagens — mensageiro web moderno',
  description:
    'Mensageiro web com chats, grupos, mídia e bots de IA local. Rápido, responsivo e privado.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Mensagens',
  appleWebApp: {
    capable: true,
    title: 'Mensagens',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  // OpenGraph é o que o WhatsApp lê pra montar o preview de link.
  // A imagem em si é gerada por src/app/opengraph-image.js (1200×630).
  openGraph: {
    type: 'website',
    siteName: 'Mensagens',
    title: 'Mensagens — mensageiro web moderno',
    description:
      'Mensageiro web com chats, grupos, mídia e bots de IA local. Rápido, responsivo e privado.',
    locale: 'pt_BR',
    url: '/',
  },
  // Twitter card — alguns apps (Slack, Discord) preferem ele ao OpenGraph.
  // 'summary_large_image' garante a imagem grande horizontal.
  twitter: {
    card: 'summary_large_image',
    title: 'Mensagens — mensageiro web moderno',
    description:
      'Mensageiro web com chats, grupos, mídia e bots de IA local. Rápido, responsivo e privado.',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f17' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/* Apple touch icon (substitua por PNG 180×180 em produção) */}
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="apple-touch-startup-image" href="/icon.svg" />
        {/* Impede auto-link de números de telefone no iOS */}
        <meta name="format-detection" content="telephone=no" />
        {/* Modo tela cheia no iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mensagens" />
      </head>
      <body>
        <ServiceWorkerRegistration />
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
