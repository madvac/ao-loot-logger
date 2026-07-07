const { EventEmitter } = require('events')

/**
 * ServerRegion - detects Albion Online server region from IP address.
 * Based on IP ranges used by albiondata-client (Go implementation).
 *
 * Servers:
 *   - West:   5.188.125.x   (Americas)
 *   - East:   5.45.187.x    (Asia / Albion East)
 *   - Europe: 193.169.238.x (Europe)
 */
const SERVER_CHANGE_DELAY_MS = 5000

class ServerRegion extends EventEmitter {
  constructor() {
    super()
    this.currentServer = null
    this.pendingServer = null
    this.changeTimeout = null
    this.knownServers = [
      {
        id: 1,
        name: 'West',
        region: 'Americas',
        prefixes: ['5.188.125.']
      },
      {
        id: 2,
        name: 'East',
        region: 'Asia',
        prefixes: ['5.45.187.']
      },
      {
        id: 3,
        name: 'Europe',
        region: 'Europe',
        prefixes: ['193.169.238.']
      }
    ]
  }

  /**
   * Detect server from a single IP address string.
   * @param {string} ipAddress - IPv4 address (e.g. "5.188.125.123")
   * @returns {object|null} Server info or null if unknown.
   */
  detect(ipAddress) {
    if (!ipAddress || typeof ipAddress !== 'string') {
      return null
    }

    for (const server of this.knownServers) {
      for (const prefix of server.prefixes) {
        if (ipAddress.startsWith(prefix)) {
          return { ...server }
        }
      }
    }

    return null
  }

  /**
   * Detect server from IPv4 packet info returned by node-cap decoders.IPV4.
   * Checks both srcaddr and dstaddr to handle packets in both directions.
   * @param {object} ipv4Info - decoders.IPV4 result info object
   * @returns {object|null} Server info or null if unknown.
   */
  detectFromPacket(ipv4Info) {
    if (!ipv4Info) return null

    // Try source address first (packet from server to client)
    let server = this.detect(ipv4Info.srcaddr)
    if (server) return server

    // Try destination address (packet from client to server)
    server = this.detect(ipv4Info.dstaddr)
    if (server) return server

    return null
  }

  /**
   * Process a packet and emit 'server-changed' if the server changed.
   * @param {object} ipv4Info - decoders.IPV4 result info object
   * @returns {object|null} Detected server or null.
   */
  processPacket(ipv4Info) {
    const server = this.detectFromPacket(ipv4Info)
    if (!server) return null

    // Already on this server — cancel any pending change
    if (this.currentServer && this.currentServer.id === server.id) {
      if (this.changeTimeout) {
        clearTimeout(this.changeTimeout)
        this.changeTimeout = null
        this.pendingServer = null
      }
      return server
    }

    // Already waiting for this server — do nothing
    if (this.pendingServer && this.pendingServer.id === server.id) {
      return server
    }

    // New potential server change — start debounce timer
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
    }

    this.pendingServer = server
    this.changeTimeout = setTimeout(() => {
      this.currentServer = server
      this.pendingServer = null
      this.changeTimeout = null
      this.emit('server-changed', server)
    }, SERVER_CHANGE_DELAY_MS)

    return server
  }

  /**
   * Manually set server (useful for overriding auto-detection).
   * @param {object} server - Server object with id, name, region
   */
  setServer(server) {
    if (!this.currentServer || this.currentServer.id !== server.id) {
      this.currentServer = server
      this.emit('server-changed', server)
    }
  }

  /**
   * Get current detected server.
   * @returns {object|null}
   */
  getCurrentServer() {
    return this.currentServer
  }

  /**
   * Reset detector (e.g. on network restart).
   */
  reset() {
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout)
      this.changeTimeout = null
    }
    this.currentServer = null
    this.pendingServer = null
  }
}

module.exports = new ServerRegion()
