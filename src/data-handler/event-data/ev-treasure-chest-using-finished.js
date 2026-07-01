const MemoryStorage = require('../../storage/memory-storage')
const LootLogger = require('../../loot-logger')
const Items = require('../../items')
const ParserError = require('../parser-error')
const Logger = require('../../utils/logger')

const name = 'EvTreasureChestUsingFinished'

function handle(event) {
  const { playerId, lootedFrom, lootedBy, itemNumId, quantity, isSilver } = parse(event)

  Logger.debug('EvTreasureChestUsingFinished', {
    playerId,
    lootedFrom,
    lootedBy,
    itemNumId,
    quantity,
    isSilver
  })

  if (isSilver) {
    return
  }

  const { itemId, itemName } = Items.get(itemNumId)

  const date = new Date()

  LootLogger.write({
    date,
    itemId,
    quantity,
    itemName,
    lootedBy:
      MemoryStorage.players.getByName(lootedBy) ??
      MemoryStorage.players.add({ playerName: lootedBy }),
    lootedFrom:
      MemoryStorage.players.getByName(lootedFrom) ??
      MemoryStorage.players.add({ playerName: lootedFrom })
  })
}

function parse(event) {
  const playerId = event.parameters[0]

  if (typeof playerId !== 'number') {
    throw new ParserError('EvTreasureChestUsingFinished has invalid playerId parameter')
  }

  const lootedFrom = event.parameters[1]
  const itemNumId = event.parameters[4]

  // Silver loot variant only contains parameters 0, 2 and 5.
  if (typeof lootedFrom !== 'string' || typeof itemNumId !== 'number') {
    const lootedBy = event.parameters[2]
    const quantity = event.parameters[5]

    return { playerId, lootedFrom, lootedBy, itemNumId, quantity, isSilver: true }
  }

  const lootedBy = event.parameters[2]

  if (typeof lootedBy !== 'string') {
    throw new ParserError('EvTreasureChestUsingFinished has invalid lootedBy parameter')
  }

  const quantity = event.parameters[5]

  if (typeof quantity !== 'number') {
    throw new ParserError('EvTreasureChestUsingFinished has invalid quantity parameter')
  }

  return { playerId, lootedFrom, lootedBy, itemNumId, quantity, isSilver: false }
}

module.exports = { name, handle, parse }
