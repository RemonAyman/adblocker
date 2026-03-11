import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  NativeModules,
  NativeEventEmitter,
  SafeAreaView,
  Animated,
} from 'react-native';

const { AdBlocker } = NativeModules;
const adBlockerEmitter = new NativeEventEmitter(AdBlocker);

const COLORS = {
  background: '#121212',
  card: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  accentBlue: '#3B82F6',
  accentRed: '#EF4444',
  accentGreen: '#4ADE80',
};

const App = () => {
  const [isVpnActive, setIsVpnActive] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const pulseAnim = useState(new Animated.Value(1))[0];

  useEffect(() => {
    // Listen for VPN state changes from Native Module
    const vpnStateSubscription = adBlockerEmitter.addListener(
      'VpnStateChanged',
      isActive => {
        setIsVpnActive(isActive);
        if (isActive) {
          setBlockedCount(prev => prev + 1); // Mock increment for demo
        }
      },
    );

    const permissionDeniedSubscription = adBlockerEmitter.addListener(
      'VpnPermissionDenied',
      () => {
        console.log('VPN Permission Denied');
        setIsVpnActive(false);
      },
    );

    return () => {
      vpnStateSubscription.remove();
      permissionDeniedSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (isVpnActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isVpnActive, pulseAnim]);

  const toggleVpn = () => {
    if (isVpnActive) {
      AdBlocker.stopBlocker();
    } else {
      AdBlocker.startBlocker().catch((err: any) =>
        console.error('Start Blocker Error:', err),
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <View style={styles.header}>
        <Text style={styles.title}>AdShield</Text>
        <Text style={styles.subtitle}>Privacy Protection</Text>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Animated.View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isVpnActive
                    ? COLORS.accentGreen
                    : COLORS.accentRed,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            />
            <Text style={styles.statusText}>
              {isVpnActive ? 'Shield Active' : 'Shield Inactive'}
            </Text>
          </View>

          <Text style={styles.description}>
            {isVpnActive
              ? 'Your device is currently protected from targeted advertisements and trackers.'
              : 'Enable the shield to start protecting your privacy and saving data usage.'}
          </Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Blocked Ads</Text>
            <Text style={styles.statValue}>
              {isVpnActive ? blockedCount + 42 : 0}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Status</Text>
            <Text
              style={[
                styles.statValue,
                { color: isVpnActive ? COLORS.accentGreen : COLORS.accentRed },
              ]}
            >
              {isVpnActive ? 'Secure' : 'Off'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.toggleButton,
            {
              backgroundColor: isVpnActive
                ? COLORS.accentRed
                : COLORS.accentBlue,
            },
          ]}
          onPress={toggleVpn}
          activeOpacity={0.8}
        >
          <Text style={styles.toggleButtonText}>
            {isVpnActive ? 'DISCONNECT' : 'PROTECT ME'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by AdShield RN Engine</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    padding: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.accentBlue,
    fontWeight: '500',
    marginTop: 5,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 25,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  description: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  toggleButton: {
    height: 65,
    borderRadius: 32.5,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  toggleButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 2,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#444',
    letterSpacing: 1,
  },
});

export default App;
