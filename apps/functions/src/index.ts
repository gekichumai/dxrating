import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { fetchPlayerByQQ, fetchScoresByFriendCode } from './routes/fetch-lxns-data'
import { fetchNetRecordsV0Handler, fetchNetRecordsV1Handler } from './routes/fetch-net-records'

const app = new Hono()

// Apply CORS to all routes
app.use('*', cors())

// Root endpoint
app.get('/', (c) => {
  return c.json({
    message: 'miruku is up and running!',
    _self: 'https://github.com/gekichumai/dxrating/tree/main/apps/functions',
  })
})

// NET Records routes
app.post('/functions/fetch-net-records/v0', fetchNetRecordsV0Handler)
app.post('/functions/fetch-net-records/v1/:region', fetchNetRecordsV1Handler)

// LXNS API routes
app.get('/functions/fetch-lxns-data/player/qq/:qq', fetchPlayerByQQ)
app.get('/functions/fetch-lxns-data/player/:friendCode/scores', fetchScoresByFriendCode)

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

export default app
