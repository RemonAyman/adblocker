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

    private val adguardDnsIpPrimary = "94.140.14.14"
    private val adguardDnsIpSecondary = "94.140.15.15"

    override fun run() {
        val inputStream = FileInputStream(vpnFileDescriptor)
        val outputStream = FileOutputStream(vpnFileDescriptor)
        val buffer = ByteArray(32767)

        var udpSocket: DatagramSocket? = null
        try {
            udpSocket = DatagramSocket()
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
        if (version != 4) return

        val ihl = versionAndIhl and 0x0F
        val ipHeaderLen = ihl * 4

        val protocol = packet[9].toInt()
        if (protocol != 17) return

        val srcIp = packet.copyOfRange(12, 16)
        val destIp = packet.copyOfRange(16, 20)

        val srcPort = ((packet[ipHeaderLen].toInt() and 0xFF) shl 8) or (packet[ipHeaderLen + 1].toInt() and 0xFF)
        val destPort = ((packet[ipHeaderLen + 2].toInt() and 0xFF) shl 8) or (packet[ipHeaderLen + 3].toInt() and 0xFF)

        if (destPort == 53) {
            val payloadOffset = ipHeaderLen + 8
            val payloadLen = length - payloadOffset
            if (payloadLen <= 0) return

            val dnsPayload = packet.copyOfRange(payloadOffset, length)
            val responseBuffer = ByteArray(4096)

            try {
                var responseLength = sendAndReceiveDns(dnsPayload, adguardDnsIpPrimary, udpSocket, responseBuffer)
                
                if (responseLength <= 0) {
                    responseLength = sendAndReceiveDns(dnsPayload, adguardDnsIpSecondary, udpSocket, responseBuffer)
                }

                if (responseLength > 0) {
                    val totalReplyLength = ipHeaderLen + 8 + responseLength
                    val replyPacket = ByteArray(totalReplyLength)

                    System.arraycopy(packet, 0, replyPacket, 0, ipHeaderLen)
                    replyPacket[2] = (totalReplyLength shr 8).toByte()
                    replyPacket[3] = (totalReplyLength and 0xFF).toByte()

                    System.arraycopy(destIp, 0, replyPacket, 12, 4)
                    System.arraycopy(srcIp, 0, replyPacket, 16, 4)

                    replyPacket[10] = 0
                    replyPacket[11] = 0
                    val ipChecksum = calculateChecksum(replyPacket, 0, ipHeaderLen)
                    replyPacket[10] = (ipChecksum shr 8).toByte()
                    replyPacket[11] = (ipChecksum and 0xFF).toByte()

                    val udpStart = ipHeaderLen
                    replyPacket[udpStart] = (destPort shr 8).toByte()
                    replyPacket[udpStart + 1] = (destPort and 0xFF).toByte()
                    replyPacket[udpStart + 2] = (srcPort shr 8).toByte()
                    replyPacket[udpStart + 3] = (srcPort and 0xFF).toByte()

                    val udpLength = 8 + responseLength
                    replyPacket[udpStart + 4] = (udpLength shr 8).toByte()
                    replyPacket[udpStart + 5] = (udpLength and 0xFF).toByte()
                    replyPacket[udpStart + 6] = 0
                    replyPacket[udpStart + 7] = 0

                    System.arraycopy(responseBuffer, 0, replyPacket, udpStart + 8, responseLength)
                    outputStream.write(replyPacket)
                }
            } catch (e: Exception) {
                Log.e("DnsForwarder", "Packet processing error", e)
            }
        }
    }

    private fun sendAndReceiveDns(payload: ByteArray, ip: String, socket: DatagramSocket, buffer: ByteArray): Int {
        return try {
            val address = InetAddress.getByName(ip)
            val outPacket = DatagramPacket(payload, payload.size, address, 53)
            socket.send(outPacket)
            
            socket.soTimeout = 1500
            val inPacket = DatagramPacket(buffer, buffer.size)
            socket.receive(inPacket)
            inPacket.length
        } catch (e: Exception) {
            -1
        }
    }

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
