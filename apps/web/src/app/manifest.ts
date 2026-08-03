import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trafy Community',
    short_name: 'Trafy',
    description: 'Trafy Community — learn, connect, and get hired.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#c6ff33',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
