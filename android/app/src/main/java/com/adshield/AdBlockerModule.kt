package com.adshield

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class AdBlockerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    init {
        reactContext.addActivityEventListener(this)
        _reactContext = reactContext
    }

    companion object {
        const val VPN_REQUEST_CODE = 42
        private var _reactContext: ReactApplicationContext? = null

        fun sendEvent(eventName: String, params: Boolean) {
            _reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        }
    }

    override fun getName(): String {
        return "AdBlocker"
    }

    @ReactMethod
    fun startBlocker(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("ACTIVITY_NULL", "Activity is null")
            return
        }

        try {
            val intent = VpnService.prepare(activity)
            if (intent != null) {
                activity.startActivityForResult(intent, VPN_REQUEST_CODE)
                promise.resolve(null)
            } else {
                // Already authorized, start immediately
                startServiceInternal()
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("PREPARE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopBlocker() {
        val context = reactApplicationContext
        val intent = Intent(context, AdVpnService::class.java).apply {
            action = AdVpnService.ACTION_STOP
        }
        context.startService(intent)
    }

    private fun startServiceInternal() {
        val context = reactApplicationContext
        val intent = Intent(context, AdVpnService::class.java).apply {
            action = AdVpnService.ACTION_START
        }
        context.startService(intent)
    }

    // Signature must match ActivityEventListener exactly
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == VPN_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK) {
                startServiceInternal()
            } else {
                sendEvent("VpnPermissionDenied", true)
            }
        }
    }

    // Signature must match ActivityEventListener exactly
    override fun onNewIntent(intent: Intent) {
        // Not used
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
