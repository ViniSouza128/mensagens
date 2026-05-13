import { ImageResponse } from 'next/og';

// Imagem que o WhatsApp/Telegram/Twitter/Facebook puxam quando alguém cola
// o link do site no chat. 1200×630 é o tamanho canônico — WhatsApp aceita
// até 600 KB. Geramos via ImageResponse (satori) pra não depender de PNG
// estático que precisaria ser regerado a cada mudança de branding.
export const runtime = 'edge';
export const alt = 'Mensagens — mensageiro web moderno e responsivo';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          position: 'relative',
        }}
      >
        {/* "bolhas" decorativas no fundo, igual o ícone do app */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 360,
            height: 360,
            borderRadius: 360,
            background: 'rgba(255,255,255,0.10)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -160,
            left: -160,
            width: 420,
            height: 420,
            borderRadius: 420,
            background: 'rgba(255,255,255,0.08)',
          }}
        />

        {/* "ícone" do app — mesma silhueta do /public/icon.svg */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 180,
            height: 180,
            borderRadius: 40,
            background: 'rgba(255,255,255,0.18)',
            marginBottom: 36,
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          }}
        >
          <svg width="120" height="120" viewBox="0 0 512 512">
            <path
              d="M112 192c0-26.5 21.5-48 48-48h192c26.5 0 48 21.5 48 48v112c0 26.5-21.5 48-48 48H240l-64 56v-56h-16c-26.5 0-48-21.5-48-48V192z"
              fill="#fff"
            />
          </svg>
        </div>

        <div
          style={{
            fontSize: 108,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
            marginBottom: 24,
            textShadow: '0 4px 24px rgba(0,0,0,0.25)',
          }}
        >
          Mensagens
        </div>

        <div
          style={{
            fontSize: 36,
            fontWeight: 500,
            opacity: 0.95,
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          Mensageiro web moderno com chats, grupos e bots de IA local
        </div>
      </div>
    ),
    { ...size },
  );
}
