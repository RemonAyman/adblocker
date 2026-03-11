package com.adshieldrn

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
        val currentActivity = currentActivity
        if (currentActivity == null) {
            promise.reject("ACTIVITY_NULL", "Activity is null")
            return
        }

        val intent = VpnService.prepare(currentActivity)
        if (intent != null) {
            currentActivity.startActivityForResult(intent, VPN_REQUEST_CODE)
            promise.resolve(null)
        } else {
            onActivityResult(currentActivity, VPN_REQUEST_CODE, Activity.RESULT_OK, null)
            promise.resolve(null)
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

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == VPN_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK) {
                val context = reactApplicationContext
                val intent = Intent(context, AdVpnService::class.java).apply {
                    action = AdVpnService.ACTION_START
                }
                context.startService(intent)
            } else {
                sendEvent("VpnPermissionDenied", true)
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {
        // Not used
    }
}
