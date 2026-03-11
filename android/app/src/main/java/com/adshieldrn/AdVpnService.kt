package com.adshieldrn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat

class AdVpnService : VpnService() {

    private var vpnInterface: ParcelFileDescriptor? = null
    private var forwarderThread: Thread? = null
    private val CHANNEL_ID = "AdShield_Channel"

    companion object {
        const val ACTION_START = "com.adshieldrn.START"
        const val ACTION_STOP = "com.adshieldrn.STOP"
        private const val TAG = "AdVpnService"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                showNotification()
                startVpn()
            }
            ACTION_STOP -> stopVpn()
        }
        return START_STICKY
    }

    private fun showNotification() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "AdShield Protection", NotificationManager.IMPORTANCE_LOW)
            manager.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AdShield is Active")
            .setContentText("Your device is protected from ads.")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        startForeground(1, notification)
    }

    private fun startVpn() {
        if (vpnInterface != null) return

        try {
            val builder = Builder()
            builder.addAddress("10.8.0.2", 32)
            
            // Porting high-speed DNS failover from Kotlin project
            builder.addDnsServer("94.140.14.14")
            builder.addDnsServer("94.140.15.15")
            
            builder.addRoute("94.140.14.14", 32)
            builder.addRoute("94.140.15.15", 32)

            vpnInterface = builder.setSession("AdShield")
                .setBlocking(true)
                .establish()

            vpnInterface?.fileDescriptor?.let {
                forwarderThread = Thread(DnsForwarder(this, it))
                forwarderThread?.start()
            }

            Log.i(TAG, "VPN Started in High-Speed Mode (AdShieldRN)")
            AdBlockerModule.sendEvent("VpnStateChanged", true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start VPN", e)
        }
    }

    private fun stopVpn() {
        try {
            forwarderThread?.interrupt()
            forwarderThread = null

            vpnInterface?.close()
            vpnInterface = null
            stopForeground(true)
            stopSelf()
            Log.i(TAG, "VPN Stopped")
            AdBlockerModule.sendEvent("VpnStateChanged", false)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping VPN", e)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        stopVpn()
    }
}
