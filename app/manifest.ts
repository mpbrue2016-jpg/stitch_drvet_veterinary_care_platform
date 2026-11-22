import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'DrVets Telemedicina Veterinária',
    short_name: 'DrVets',
    description:
      'Telemedicina veterinária 24h, agenda de consultas, prontuário clínico e alertas em tempo real.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6faff',
    theme_color: '#087a68',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
