import dxdataJson from './dxdata.json' with { type: 'json' }
import type { DXData } from './index.js'

export const dxdata = dxdataJson as DXData

export const dxdataUpdateTime = dxdata.updateTime
