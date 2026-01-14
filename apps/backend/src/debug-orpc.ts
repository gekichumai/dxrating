import * as contract from '@orpc/contract'
import * as server from '@orpc/server'
import * as openapi from '@orpc/openapi'

console.log('--- @orpc/contract exports ---')
console.log(Object.keys(contract))

console.log('--- @orpc/server exports ---')
console.log(Object.keys(server))

console.log('--- @orpc/openapi exports ---')
console.log(Object.keys(openapi))
