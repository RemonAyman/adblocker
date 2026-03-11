package com.adshieldrn

import android.net.VpnService
import android.util.Log
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class DnsForwarder(
    private val vpnService: VpnService,
    private val vpnFileDescriptor: java.io.FileDescriptor
) : Runnable {

    private val adguardDnsIp = "94.140.14.14" // AdGuard DNS IP

    override fun run() {
        val inputStream = FileInputStream(vpnFileDescriptor)
        val outputStream = FileOutputStream(vpnFileDescriptor)
        val buffer = ByteArray(32767)

        var udpSocket: DatagramSocket? = null
        try {
            udpSocket = DatagramSocket()
            // CRITICAL: Prevent routing loop by explicitly protecting the socket
            // so it goes over the real Wi-Fi/Mobile network instead of back into the TUN!
            vpnService.protect(udpSocket)

            while (!Thread.interrupted()) {
                val length = inputStream.read(buffer)
                if (length > 0) {
                    processPacket(buffer, length, udpSocket, outputStream)
                }
            }
        } catch (e: Exception) {
            Log.e("DnsForwarder", "VPN Forwarder stopped", e)
        } finally {
            try {
                inputStream.close()
                outputStream.close()
            } catch (ignored: Exception) {}
            udpSocket?.close()
        }
    }

    private fun processPacket(
        packet: ByteArray,
        length: Int,
        udpSocket: DatagramSocket,
        outputStream: FileOutputStream
    ) {
        val versionAndIhl = packet[0].toInt()
        val version = (versionAndIhl shr 4) and 0x0F
        if (version != 4) return // Only handle IPv4

        val ihl = versionAndIhl and 0x0F
        val ipHeaderLen = ihl * 4

        val protocol = packet[9].toInt()
        if (protocol != 17) return // Only handle UDP (17)

        val srcIp = packet.copyOfRange(12, 16)
        val destIp = packet.copyOfRange(16, 20)

        val srcPort = ((packet[ipHeaderLen].toInt() and 0xFF) shl 8) or (packet[ipHeaderLen + 1].toInt() and 0xFF)
        val destPort = ((packet[ipHeaderLen + 2].toInt() and 0xFF) shl 8) or (packet[ipHeaderLen + 3].toInt() and 0xFF)

        // Only process if it's a DNS query (Port 53)
        if (destPort == 53) {
            val payloadOffset = ipHeaderLen + 8
            val payloadLen = length - payloadOffset
            if (payloadLen <= 0) return

            val dnsPayload = packet.copyOfRange(payloadOffset, length)

            try {
                // 1. Send DNS query out to AdGuard DNS
                val adguardAddress = InetAddress.getByName(adguardDnsIp)
                val outPacket = DatagramPacket(dnsPayload, dnsPayload.size, adguardAddress, 53)
                udpSocket.send(outPacket)

                // 2. Wait for the DNS response from AdGuard
                udpSocket.soTimeout = 3000 // 3 seconds timeout
                val responseBuffer = ByteArray(4096)
                val inPacket = DatagramPacket(responseBuffer, responseBuffer.size)
                udpSocket.receive(inPacket)
                val responseLength = inPacket.length

                // 3. Build the response IP+UDP packet to trick the Android system into accepting it
                val totalReplyLength = ipHeaderLen + 8 + responseLength
                val replyPacket = ByteArray(totalReplyLength)

                // Copy original IP header
                System.arraycopy(packet, 0, replyPacket, 0, ipHeaderLen)

                // Update Total Length in IP header
                replyPacket[2] = (totalReplyLength shr 8).toByte()
                replyPacket[3] = (totalReplyLength and 0xFF).toByte()

                // Swap Source and Destination IPs
                System.arraycopy(destIp, 0, replyPacket, 12, 4)
                System.arraycopy(srcIp, 0, replyPacket, 16, 4)

                // Recalculate IP Checksum
                replyPacket[10] = 0
                replyPacket[11] = 0
                val ipChecksum = calculateChecksum(replyPacket, 0, ipHeaderLen)
                replyPacket[10] = (ipChecksum shr 8).toByte()
                replyPacket[11] = (ipChecksum and 0xFF).toByte()

                // Copy Original UDP ports but reversed
                val udpStart = ipHeaderLen
                replyPacket[udpStart] = (destPort shr 8).toByte()     // Src Port -> Dest Port
                replyPacket[udpStart + 1] = (destPort and 0xFF).toByte()
                replyPacket[udpStart + 2] = (srcPort shr 8).toByte()      // Dest Port -> Src Port
                replyPacket[udpStart + 3] = (srcPort and 0xFF).toByte()

                // Update UDP Length
                val udpLength = 8 + responseLength
                replyPacket[udpStart + 4] = (udpLength shr 8).toByte()
                replyPacket[udpStart + 5] = (udpLength and 0xFF).toByte()

                // Clear UDP Checksum (0 means ignored in IPv4)
                replyPacket[udpStart + 6] = 0
                replyPacket[udpStart + 7] = 0

                // Attach the real DNS response payload
                System.arraycopy(responseBuffer, 0, replyPacket, udpStart + 8, responseLength)

                // 4. Inject the packet back into the local VPN tunnel
                outputStream.write(replyPacket)

            } catch (e: Exception) {
                // Ignore timeout or network errors on individual queries
            }
        }
    }

    // RFC 1071 Internet Checksum
    private fun calculateChecksum(data: ByteArray, offset: Int, length: Int): Int {
        var sum = 0
        var i = offset
        var remaining = length
        while (remaining > 1) {
            val word = ((data[i].toInt() and 0xFF) shl 8) or (data[i + 1].toInt() and 0xFF)
            sum += word
            i += 2
            remaining -= 2
        }
        if (remaining > 0) {
            val word = (data[i].toInt() and 0xFF) shl 8
            sum += word
        }
        while ((sum shr 16) > 0) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        return sum.inv() and 0xFFFF
    }
}
