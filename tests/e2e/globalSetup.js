import { createServer } from 'vite'
import { getE2EPort } from './support/environment.js'

export default async function globalSetup() {
  const port = getE2EPort()
  const server = await createServer({
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true
    }
  })

  await server.listen()

  return async () => {
    await server.close()
  }
}
