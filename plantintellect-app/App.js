import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Button, Image, ActivityIndicator, TouchableOpacity, Modal, TextInput, ScrollView, Animated } from 'react-native';
import React from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import axios from 'axios';
import './i18n';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from './config';

const backendBaseUrl = API_BASE_URL;

export default function App() {
  const { t, i18n } = useTranslation();
  const [image, setImage] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [botOpen, setBotOpen] = React.useState(false);
  const [messages, setMessages] = React.useState([
    { role: 'bot', text: 'Hi! I can explain the result, suggest timing, soil and sunlight tips.' }
  ]);
  const [alternatives, setAlternatives] = React.useState([]);

  // Helper to compute inferred reasons and fallback recommendations when backend doesn't provide them
  const getInferredReasons = (res) => {
    if (!res) return [];
    const explicit = res.suitability?.reasons ?? [];
    if (explicit.length) return explicit;
    const inferred = [];
    if (res.suitability?.weather) {
      const w = res.suitability.weather;
      if (w.tempC !== undefined && w.humidity !== undefined) inferred.push(`Current weather: ${w.tempC}°C, humidity ${w.humidity}%`);
      else if (w.tempC !== undefined) inferred.push(`Current temperature: ${w.tempC}°C`);
    }
    const conf = res.identify?.confidence ?? null;
    if (conf !== null) inferred.push(`Identification confidence ${Math.round(conf * 100)}%`);
    if (!inferred.length) inferred.push('Conditions such as season, temperature, soil moisture, or light may not be ideal for sowing.');
    return inferred;
  };

  const getFallbackAdvice = (res) => {
    if (!res) return [];
    const explicit = res.suitability?.advice ?? [];
    if (explicit.length) return explicit;
    // Generic fallback advice
    return [
      'Delay sowing until conditions improve (temperature/season).',
      'Improve soil with compost and ensure good drainage.',
      'Adjust watering to avoid waterlogged or overly dry soil.',
      'Choose a more suitable variety or alternative crop for current conditions.'
    ];
  };

  // Simple button press animations
  const scaleCapture = React.useRef(new Animated.Value(1)).current;
  const scaleGallery = React.useRef(new Animated.Value(1)).current;
  const scaleAnalyze = React.useRef(new Animated.Value(1)).current;
  const opacityCapture = React.useRef(new Animated.Value(1)).current;
  const opacityGallery = React.useRef(new Animated.Value(1)).current;
  const opacityAnalyze = React.useRef(new Animated.Value(1)).current;
  const animateIn = (scaleVal, opacityVal) => {
    Animated.parallel([
      Animated.spring(scaleVal, { toValue: 0.92, useNativeDriver: true, speed: 40, bounciness: 8 }),
      Animated.timing(opacityVal, { toValue: 0.8, duration: 120, useNativeDriver: true })
    ]).start();
  };
  const animateOut = (scaleVal, opacityVal) => {
    Animated.parallel([
      Animated.spring(scaleVal, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 8 }),
      Animated.timing(opacityVal, { toValue: 1, duration: 120, useNativeDriver: true })
    ]).start();
  };

  const addMessage = (role, text) => setMessages(prev => [...prev, { role, text }]);
  const askBot = (text) => {
    addMessage('you', text);
    // Simple rule-based responses using latest result context
    const adv = result?.suitability?.advice || [];
    const reasons = result?.suitability?.reasons || [];
    const suitable = result?.suitability?.suitableNow;
    let reply = '';
    const t = text.toLowerCase();
    if (!result) reply = 'Run Analyze first, then I can give plant-specific advice.';
    else if (t.includes('why') || t.includes('not') || t.includes('reason')) reply = reasons.length ? `Reasons: ${reasons.join('; ')}` : (suitable ? 'It is suitable now.' : 'Conditions are not ideal.');
    else if (t.includes('what') && (t.includes('do') || t.includes('improve') || t.includes('tips'))) reply = adv.length ? `Try: ${adv.join('; ')}` : 'Aim for ideal temperature, soil and full sun as recommended.';
    else if (t.includes('weather')) {
      const w = result?.suitability?.weather;
      if (!w) reply = 'Weather data unavailable.';
      else {
        const parts = [];
        if (w.tempC !== undefined) parts.push(`Temp ${w.tempC}°C`);
        if (w.humidity !== undefined) parts.push(`humidity ${w.humidity}%`);
        if (w.windspeed !== undefined) parts.push(`wind ${w.windspeed} m/s`);
        reply = parts.length ? parts.join(', ') : 'Weather data unavailable.';
      }
    }
    else if (t.includes('when') || t.includes('month')) reply = 'Check sowing window in the card; consider upcoming months for your region.';
    else reply = 'I can help with: Why not suitable? What to do? Weather now?';
    addMessage('bot', reply);
  };

  const pickImage = async () => {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      setError(t('permission_gallery'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    if (!res.canceled) {
      const asset = res.assets[0];
      setImage(asset);
    }
  };

  const captureImage = async () => {
    setError(null);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      setError(t('permission_camera'));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    if (!res.canceled) {
      const asset = res.assets[0];
      setImage(asset);
    }
  };

  const analyze = async () => {
    if (!image?.base64) {
      setError(t('select_image_first'));
      return;
    }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      // request location permission first and bail with a clear message if not granted
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t('permission_location'));
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      if (!loc || !loc.coords) {
        setError('Could not obtain current location. Please ensure location services are enabled.');
        setLoading(false);
        return;
      }
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;

      // Try to fetch current weather (open-meteo) as a fallback if backend doesn't supply it
      const fetchWeather = async (lat, lon) => {
        try {
          const wresp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m,temperature_2m&timezone=auto`);
          if (!wresp.ok) return null;
          const data = await wresp.json();
          const current = data.current_weather ?? null;
          const weather = {};
          if (current && current.temperature !== undefined) weather.tempC = Math.round(current.temperature);
          if (current && current.windspeed !== undefined) weather.windspeed = current.windspeed;
          // Try to extract humidity from hourly arrays if present (use latest hour index)
          if (data.hourly && Array.isArray(data.hourly.relativehumidity_2m) && Array.isArray(data.hourly.time)) {
            const times = data.hourly.time;
            const hum = data.hourly.relativehumidity_2m;
            // find index matching current time (approx)
            const idx = times.length - 1;
            const h = hum[idx];
            if (h !== undefined) weather.humidity = Math.round(h);
          }
          return weather;
        } catch (e) {
          return null;
        }
      };

      const identify = await axios.post(`${backendBaseUrl}/identify`, { imageBase64: image.base64 });
      const species = identify.data?.species;
      const confidence = identify.data?.confidence ?? 0;

      // If we couldn't identify a plant at all, stop and inform the user
      if (!species) {
        setResult({ identify: identify.data, suitability: null });
        setError('Could not identify a plant. Please try a clearer plant photo.');
        setLoading(false);
        return;
      }

      // Require a minimum confidence before asking suitability — prevents low-confidence guesses from being used
      const MIN_CONFIDENCE = 0.40; // 40%
      if (confidence < MIN_CONFIDENCE) {
        setResult({ identify: identify.data, suitability: null });
        setError(`Low confidence identification (${Math.round(confidence * 100)}%). Please provide a clearer photo or try again.`);
        setLoading(false);
        return;
      }

      const suitability = await axios.post(`${backendBaseUrl}/suitability`, { species, lat, lon });
      // if backend did not include weather, try to fetch it and attach as a convenience
      const suitabilityData = suitability.data || {};
      if (!suitabilityData.weather) {
        const w = await fetchWeather(lat, lon);
        if (w) suitabilityData.weather = w;
      }
      const combined = { identify: identify.data, suitability: suitabilityData };
      setResult(combined);

      // Suggest alternatives if not suitable
      if (!combined.suitability?.suitableNow) {
        const CANDIDATES = ['pearl millet', 'finger millet', 'sorghum', 'paddy', 'tomato', 'chili', 'okra', 'spinach', 'coriander'];
        const calls = CANDIDATES.map(name => axios.post(`${backendBaseUrl}/suitability`, { species: name, lat, lon })
          .then(r => ({ name, data: r.data }))
          .catch(() => null));
        const responses = (await Promise.all(calls)).filter(Boolean);
        const good = responses.filter(x => x.data?.suitableNow);
        setAlternatives(good.slice(0, 3).map(x => x.name));
      } else {
        setAlternatives([]);
      }
    } catch (e) {
      setError(t('analyze_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('title')}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.langBtn} onPress={() => i18n.changeLanguage('en')}><Text style={styles.langText}>EN</Text></TouchableOpacity>
          <TouchableOpacity style={styles.langBtn} onPress={() => i18n.changeLanguage('ta')}><Text style={styles.langText}>தமிழ்</Text></TouchableOpacity>
        </View>
      </View>

      {image?.uri ? (
        <Image
          source={{ uri: image.uri }}
          style={[
            styles.preview,
            image.width && image.height ? { height: undefined, aspectRatio: image.width / image.height } : {}
          ]}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.placeholder}><Text style={styles.placeholderText}>{t('select_image_first')}</Text></View>
      )}

      <View style={styles.controls}>
        <Animated.View style={{ width: 160, marginRight: 10, transform: [{ scale: scaleCapture }], opacity: opacityCapture, alignSelf: 'center' }}>
          <TouchableOpacity style={styles.primaryBtn} onPressIn={() => animateIn(scaleCapture, opacityCapture)} onPressOut={() => animateOut(scaleCapture, opacityCapture)} onPress={captureImage}>
            <Text style={styles.primaryText}>{t('capture')}</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={{ width: 160, marginRight: 10, transform: [{ scale: scaleGallery }], opacity: opacityGallery, alignSelf: 'center' }}>
          <TouchableOpacity style={styles.secondaryBtn} onPressIn={() => animateIn(scaleGallery, opacityGallery)} onPressOut={() => animateOut(scaleGallery, opacityGallery)} onPress={pickImage}>
            <Text style={styles.secondaryText}>{t('gallery')}</Text>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={{ width: 160, transform: [{ scale: scaleAnalyze }], opacity: opacityAnalyze, alignSelf: 'center' }}>
          <TouchableOpacity style={styles.analyzeBtn} onPressIn={() => animateIn(scaleAnalyze, opacityAnalyze)} onPressOut={() => animateOut(scaleAnalyze, opacityAnalyze)} onPress={analyze}>
            <Text style={styles.analyzeText}>{t('analyze')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {loading && <ActivityIndicator color="#2ea043" style={{ marginTop: 12 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{result.identify?.commonName || result.identify?.species}</Text>
          <Text style={styles.subtle}>{t('confidence')}: {Math.round((result.identify?.confidence ?? 0) * 100)}%</Text>
          {result.suitability?.weather && (
            <Text style={styles.subtle}>
              {(() => {
                const w = result.suitability.weather;
                const parts = [];
                if (w.tempC !== undefined) parts.push(`Temp ${w.tempC}°C`);
                if (w.humidity !== undefined) parts.push(`humidity ${w.humidity}%`);
                if (w.windspeed !== undefined) parts.push(`wind ${w.windspeed} m/s`);
                return `Current weather: ${parts.join(', ')}`;
              })()}
            </Text>
          )}
          <View style={[styles.badge, result.suitability?.suitableNow ? styles.badgeYes : styles.badgeNo]}>
            <Text style={styles.badgeText}>{t('suitableNow')}: {result.suitability?.suitableNow ? t('yes') : t('no')}</Text>
          </View>

          {/* When not suitable, surface reasons and actionable recommendations (use backend data or sensible fallbacks) */}
          {!result.suitability?.suitableNow && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.sectionTitle}>Possible reasons</Text>
              {(getInferredReasons(result) || []).map((r, i) => (
                <Text style={styles.listItem} key={`reason-${i}`}>• {r}</Text>
              ))}

              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Recommendations</Text>
              {(getFallbackAdvice(result) || []).map((a, i) => (
                <Text style={styles.listItem} key={`advice-${i}`}>• {a}</Text>
              ))}
            </View>
          )}
          {Array.isArray(result.suitability?.reasons) && result.suitability.reasons.length > 0 && (
            <View style={{ marginBottom: 6 }}>
              <Text style={styles.sectionTitle}>Issues detected</Text>
              {result.suitability.reasons.map((r, i) => (
                <Text style={styles.listItem} key={i}>• {r}</Text>
              ))}
            </View>
          )}
          {(Array.isArray(result.suitability?.advice) && result.suitability.advice.length > 0) || alternatives.length > 0 ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              {Array.isArray(result.suitability?.advice) && result.suitability.advice.map((a, i) => (
                <Text style={styles.listItem} key={i}>• {a}</Text>
              ))}
              {alternatives.length > 0 && (
                <Text style={styles.listItem}>
                  • Also good now: {alternatives.join(', ')}
                </Text>
              )}
            </View>
          ) : null}
        </View>
      )}

      {/* Floating Assistant Button */}
      <TouchableOpacity style={styles.botFab} onPress={() => setBotOpen(true)}>
        <Text style={styles.botFabText}>🤖</Text>
      </TouchableOpacity>

      {/* Assistant Modal */}
      <Modal visible={botOpen} transparent animationType="slide" onRequestClose={() => setBotOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Grow Assistant</Text>
              <TouchableOpacity onPress={() => setBotOpen(false)}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 260 }}>
              {messages.map((m, i) => (
                <View key={i} style={[styles.msg, m.role === 'you' ? styles.msgYou : styles.msgBot]}>
                  <Text style={styles.msgText}>{m.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.suggestRow}>
              <TouchableOpacity style={styles.suggest} onPress={() => askBot('Why not suitable?')}><Text style={styles.suggestText}>Why not suitable?</Text></TouchableOpacity>
              <TouchableOpacity style={styles.suggest} onPress={() => askBot('What should I do now?')}><Text style={styles.suggestText}>What should I do?</Text></TouchableOpacity>
              <TouchableOpacity style={styles.suggest} onPress={() => askBot('Weather now?')}><Text style={styles.suggestText}>Weather now?</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1727', padding: 16, paddingBottom: 140 },
  header: { marginTop: 16, marginBottom: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  title: { color: '#e6f1ff', fontSize: 22, fontWeight: '700' },
  row: { position: 'absolute', right: 0, flexDirection: 'row' },
  langBtn: { backgroundColor: '#172a46', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, marginLeft: 8 },
  langText: { color: '#e6f1ff' },
  placeholder: { height: 220, borderRadius: 12, backgroundColor: '#10233d', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 900 },
  placeholderText: { color: '#7f9bb6' },
  preview: { width: '100%', maxWidth: 900, height: 220, resizeMode: 'cover', borderRadius: 12, alignSelf: 'center' },
  controls: { flexDirection: 'row', marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { backgroundColor: '#1f6feb', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  secondaryBtn: { backgroundColor: '#172a46', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  analyzeBtn: { backgroundColor: '#2ea043', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  primaryText: { color: 'white', textAlign: 'center', fontWeight: '600' },
  secondaryText: { color: '#e6f1ff', textAlign: 'center', fontWeight: '600' },
  analyzeText: { color: 'white', textAlign: 'center', fontWeight: '700' },
  error: { color: '#ff6b6b', marginTop: 10 },
  card: { marginTop: 16, backgroundColor: '#0e2239', borderRadius: 12, padding: 14 },
  cardTitle: { color: '#e6f1ff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  subtle: { color: '#7f9bb6', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  badgeYes: { backgroundColor: '#153e27' },
  badgeNo: { backgroundColor: '#3d1a1a' },
  badgeText: { color: '#e6f1ff', fontWeight: '700' },
  listItem: { color: '#e6f1ff' },
  sectionTitle: { color: '#e6f1ff', fontWeight: '700', marginBottom: 4 }
  ,botFab: { position: 'absolute', right: 16, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1f6feb', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6 },
  botFabText: { color: 'white', fontSize: 22 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#0e2239', width: '100%', padding: 14, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: '#e6f1ff', fontSize: 18, fontWeight: '700' },
  closeText: { color: '#e6f1ff', fontSize: 18 },
  msg: { marginVertical: 4, padding: 10, borderRadius: 10, maxWidth: '90%' },
  msgYou: { alignSelf: 'flex-end', backgroundColor: '#172a46' },
  msgBot: { alignSelf: 'flex-start', backgroundColor: '#153e27' },
  msgText: { color: '#e6f1ff' },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  suggest: { backgroundColor: '#172a46', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10, marginRight: 8, marginTop: 6 },
  suggestText: { color: '#e6f1ff', fontSize: 12 }
});
