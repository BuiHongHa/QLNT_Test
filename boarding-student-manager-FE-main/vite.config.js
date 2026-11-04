import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import http from 'http'

const HTTP_PORT = 5173   // HTTP port (will redirect to HTTPS)
const HTTPS_PORT = 5174   // HTTPS port (secure server)

/** Plugin: tạo HTTP server redirect 301 → HTTPS */
function httpRedirectPlugin() {
  return {
    name: 'http-redirect-server',
    configureServer(server) {
      const redirectServer = http.createServer((req, res) => {
        const rawHost = req.headers.host || ''
        const host = rawHost.replace(new RegExp(`:${HTTP_PORT}$`), `:${HTTPS_PORT}`)
        res.writeHead(301, { Location: `https://${host}${req.url}` })
        res.end()
      })
      redirectServer.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`  \x1b[32m➜\x1b[0m  HTTP redirect : http://0.0.0.0:${HTTP_PORT} → https://...:${HTTPS_PORT}`)
      })
      server.httpServer?.on('close', () => redirectServer.close())
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), httpRedirectPlugin()],
  server: {
    host: '0.0.0.0',   // lắng nghe mọi interface
    port: HTTPS_PORT,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      }
    }
  }
})
