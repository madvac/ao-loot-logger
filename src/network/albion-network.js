const { Cap, decoders } = require('cap')

const PhotonParser = require('./photon/photon-parser')
const Logger = require('../utils/logger')
const { prettyPrintBuffer } = require('../utils/binary')
const ServerRegion = require('./server-region')

const MAX_SECONDS_BETWEEN_PACKETS = 5

class AlbionNetwork extends PhotonParser {
  constructor() {
    super()

    this.caps = []
    this.lastReceivedTime = null
    this.isLive = null

    // Forward ServerRegion's 'server-changed' as our own 'server-detected'
    ServerRegion.on('server-changed', (server) => {
      this.emit('server-detected', server)
    })

    setInterval(() => this.checkOffline(), 5001)

    process.on('exit', () => {
      this.close()
    })
  }

  checkOffline() {
    const lastReceivedPacketIsRecent =
      process.uptime() - this.lastReceivedTime <= MAX_SECONDS_BETWEEN_PACKETS
    if (lastReceivedPacketIsRecent) {
      return
    }

    if (this.isLive === false) {
      return
    }

    this.isLive = false

    return this.emit('offline')
  }

  init() {
    const infos = []

    for (const device of Cap.deviceList()) {
      for (const address of device.addresses) {
        if (address.addr.match(/\d+\.\d+\.\d+\.\d+/)) {
          const name = []

          if (device.name) {
            name.push(device.name)
          }

          if (device.description) {
            name.push(device.description)
          }

          infos.push({ addr: address.addr, name: name.join(' - ') })
        }
      }
    }

    for (const info of infos) {
      try {
        this.addListener(info)
      } catch (error) {
        Logger.warn(error)
      }
    }
  }

  close() {
    for (const cap of this.caps) {
      cap.close()
    }

    this.caps = []
    this.lastReceivedTime = null
    this.isLive = null

    // Reset server region on close
    ServerRegion.reset()
  }

  addListener(info) {
    this.emit('add-listener', info)

    const c = new Cap()

    const filter = `ip and udp and (port 5056 or port 5055 or port 4535)`
    const bufSize = 1 * 1024 * 1024
    const buffer = Buffer.alloc(bufSize)
    const device = Cap.findDevice(info.addr)

    this.caps.push(c)

    c.on('packet', () => {
      let ret = decoders.Ethernet(buffer)

      if (ret.info.type !== decoders.PROTOCOL.ETHERNET.IPV4) {
        return
      }

      ret = decoders.IPV4(buffer, ret.offset)

      const ipv4Info = ret.info
      let packet = null

      if (ret.info.protocol === decoders.PROTOCOL.IP.UDP) {
        ret = decoders.UDP(buffer, ret.offset)

        packet = buffer.slice(ret.offset, ret.offset + ret.info.length)

        try {
          this.lastReceivedTime = process.uptime()

          if (!this.isLive) {
            this.isLive = true
            this.emit('online')
          }

          // Detect server region from packet IP addresses
          ServerRegion.processPacket(ipv4Info)

          this.handlePhotonPacket(packet)
        } catch (error) {
          Logger.warn('error parsing photon packet', error)
          Logger.warn('packet', prettyPrintBuffer(packet))
        }
      }
    })

    const linkType = c.open(device, filter, bufSize, buffer)

    if (c.setMinBytes != null) {
      c.setMinBytes(0)
    }

    if (linkType !== 'ETHERNET') {
      c.close()
    }
  }
}

module.exports = new AlbionNetwork()
