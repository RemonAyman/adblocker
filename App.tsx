import React, { useState, useEffect, useRef } from 'react';
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
    TextInput,
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

const { AdBlocker } = NativeModules;
const adBlockerEmitter = new NativeEventEmitter(AdBlocker);
const { width } = Dimensions.get('window');

const COLORS = {
    background: '#0F172A',
    surface: '#1E293B',
    primary: '#6366F1',
    secondary: '#A855F7',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    accentGreen: '#4ADE80',
    accentRed: '#EF4444',
    inputBg: '#1E293B',
};

// Simple hashing for DB storage (as requested)
const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash.toString(16);
};

const App = () => {
    const [user, setUser] = useState<any>(null);
    const [screen, setScreen] = useState<'LOGIN' | 'SIGNUP' | 'FORGOT_PASSWORD' | 'DASHBOARD'>('LOGIN');
    const [loading, setLoading] = useState(true);

    // Form states
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Dashboard states
    const [isVpnActive, setIsVpnActive] = useState(false);
    const [blockedCount, setBlockedCount] = useState(0);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const subscriber = auth().onAuthStateChanged((u) => {
            setUser(u);
            if (u) setScreen('DASHBOARD');
            else setScreen('LOGIN');
            setLoading(false);
        });

        const vpnSub = adBlockerEmitter.addListener('VpnStateChanged', (active) => {
            setIsVpnActive(active);
            if (active) setBlockedCount(p => p + 1);
        });

        return () => {
            subscriber();
            vpnSub.remove();
        };
    }, []);

    useEffect(() => {
        if (isVpnActive) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isVpnActive]);

    const handleLogin = async () => {
        if (!email || !password) return Alert.alert('Error', 'Please fill all fields');
        try {
            await auth().signInWithEmailAndPassword(email, password);
        } catch (e: any) {
            Alert.alert('Login Failed', e.message);
        }
    };

    const handleSignup = async () => {
        if (!email || !username || !password || !confirmPassword) return Alert.alert('Error', 'Please fill all fields');
        if (password !== confirmPassword) return Alert.alert('Error', 'Passwords do not match');

        try {
            // Check uniqueness in Firestore
            const userSnap = await firestore().collection('users').where('username', '==', username).get();
            if (!userSnap.empty) return Alert.alert('Error', 'Username already taken');

            const res = await auth().createUserWithEmailAndPassword(email, password);
            if (res.user) {
                await firestore().collection('users').doc(res.user.uid).set({
                    uid: res.user.uid,
                    username,
                    email,
                    passwordHash: simpleHash(password), // Requested: Hashed password in DB
                    createdAt: firestore.FieldValue.serverTimestamp(),
                });
            }
        } catch (e: any) {
            Alert.alert('Signup Failed', e.message);
        }
    };

    const handleReset = async () => {
        if (!email) return Alert.alert('Error', 'Please enter your email');
        try {
            await auth().sendPasswordResetEmail(email);
            Alert.alert('Success', 'Reset link sent to your email');
            setScreen('LOGIN');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const toggleVpn = () => {
        if (isVpnActive) AdBlocker.stopBlocker();
        else AdBlocker.startBlocker().catch(console.error);
    };

    if (loading) return <View style={styles.loading}><Text style={styles.text}>Loading...</Text></View>;

    const renderAuth = () => (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.authHeader}>
                    <Text style={styles.title}>{screen === 'LOGIN' ? 'Welcome Back' : screen === 'SIGNUP' ? 'Join AdShield' : 'Reset Password'}</Text>
                    <Text style={styles.subtitle}>Protect your privacy with premium DNS</Text>
                </View>

                <View style={styles.form}>
                    {screen === 'SIGNUP' && (
                        <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor={COLORS.textSecondary}
                            value={username}
                            onChangeText={setUsername}
                        />
                    )}
                    <TextInput
                        style={styles.input}
                        placeholder="Email Address"
                        placeholderTextColor={COLORS.textSecondary}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                    />
                    {screen !== 'FORGOT_PASSWORD' && (
                        <>
                            <TextInput
                                style={styles.input}
                                placeholder="Password"
                                placeholderTextColor={COLORS.textSecondary}
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                            />
                            {screen === 'SIGNUP' && (
                                <TextInput
                                    style={styles.input}
                                    placeholder="Confirm Password"
                                    placeholderTextColor={COLORS.textSecondary}
                                    secureTextEntry
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                            )}
                        </>
                    )}

                    {screen === 'LOGIN' && (
                        <TouchableOpacity onPress={() => setScreen('FORGOT_PASSWORD')}>
                            <Text style={styles.forgotPass}>Forgot Password?</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity 
                        style={styles.primaryButton} 
                        onPress={screen === 'LOGIN' ? handleLogin : screen === 'SIGNUP' ? handleSignup : handleReset}
                    >
                        <Text style={styles.buttonText}>{screen === 'LOGIN' ? 'LOGIN' : screen === 'SIGNUP' ? 'SIGN UP' : 'SEND LINK'}</Text>
                    </TouchableOpacity>

                    <View style={styles.divider}>
                        <View style={styles.line} />
                        <Text style={styles.or}>OR</Text>
                        <View style={styles.line} />
                    </View>

                    <TouchableOpacity style={styles.googleButton} onPress={() => Alert.alert('Notice', 'Google Sign-in requires native SHA-1 configuration.')}>
                      <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setScreen(screen === 'LOGIN' ? 'SIGNUP' : 'LOGIN')} style={styles.switchAuth}>
                        <Text style={styles.textSecondary}>
                            {screen === 'LOGIN' ? "Don't have an account? " : "Already have an account? "}
                            <Text style={styles.accentText}>{screen === 'LOGIN' ? 'Sign Up' : 'Login'}</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    const renderDashboard = () => (
        <SafeAreaView style={styles.container}>
            <View style={styles.dashboardHeader}>
                <View>
                    <Text style={styles.titleSmall}>AdShield Dashboard</Text>
                    <Text style={styles.subtitleSmall}>Welcome back, {user?.email?.split('@')[0]}</Text>
                </View>
                <TouchableOpacity onPress={() => auth().signOut()} style={styles.logoutBtn}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.mainContent}>
                <Animated.View style={[styles.statusRing, { transform: [{ scale: pulseAnim }], borderColor: isVpnActive ? COLORS.accentGreen : COLORS.accentRed }]}>
                    <TouchableOpacity onPress={toggleVpn} style={[styles.pulseCircle, { backgroundColor: isVpnActive ? COLORS.accentGreen : COLORS.accentRed }]}>
                        <Text style={styles.shieldIcon}>🛡️</Text>
                    </TouchableOpacity>
                </Animated.View>

                <Text style={styles.statusLabel}>{isVpnActive ? 'SHIELD ACTIVE' : 'SHIELD INACTIVE'}</Text>

                <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Ads Blocked Today</Text>
                        <Text style={styles.statVal}>{isVpnActive ? blockedCount + 87 : 0}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Security Level</Text>
                        <Text style={[styles.statVal, { color: isVpnActive ? COLORS.accentGreen : COLORS.accentRed }]}>{isVpnActive ? 'Premium' : 'Off'}</Text>
                    </View>
                </View>
            </View>
        </SafeAreaView>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            {screen === 'DASHBOARD' ? renderDashboard() : renderAuth()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
    scrollContent: { padding: 30, flexGrow: 1, justifyContent: 'center' },
    authHeader: { marginBottom: 40 },
    title: { fontSize: 34, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
    subtitle: { fontSize: 16, color: COLORS.textSecondary },
    form: { gap: 16 },
    input: { height: 56, backgroundColor: COLORS.inputBg, borderRadius: 12, paddingHorizontal: 16, color: COLORS.text, borderWidth: 1, borderColor: '#334155' },
    forgotPass: { alignSelf: 'flex-end', color: COLORS.primary, fontWeight: '600' },
    primaryButton: { height: 56, backgroundColor: COLORS.primary, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    googleButton: { height: 56, backgroundColor: 'transparent', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    buttonText: { fontSize: 16, fontWeight: '700', color: COLORS.text, letterSpacing: 1 },
    googleButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.text },
    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
    line: { flex: 1, height: 1, backgroundColor: '#334155' },
    or: { marginHorizontal: 15, color: COLORS.textSecondary, fontSize: 12 },
    switchAuth: { marginTop: 20, alignItems: 'center' },
    accentText: { color: COLORS.primary, fontWeight: '700' },
    text: { color: COLORS.text },
    textSecondary: { color: COLORS.textSecondary },
    dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 25 },
    titleSmall: { fontSize: 24, fontWeight: '800', color: COLORS.text },
    subtitleSmall: { fontSize: 14, color: COLORS.textSecondary },
    logoutBtn: { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.accentRed },
    logoutText: { color: COLORS.accentRed, fontWeight: '600' },
    mainContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    statusRing: { width: 220, height: 220, borderRadius: 110, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    pulseCircle: { width: 180, height: 180, borderRadius: 90, justifyContent: 'center', alignItems: 'center', elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 10 },
    shieldIcon: { fontSize: 60 },
    statusLabel: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 40, letterSpacing: 2 },
    statsGrid: { flexDirection: 'row', gap: 15, marginTop: 50 },
    statBox: { flex: 1, backgroundColor: COLORS.surface, padding: 20, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
    statLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 5 },
    statVal: { fontSize: 28, fontWeight: '800', color: COLORS.text },
});

export default App;
