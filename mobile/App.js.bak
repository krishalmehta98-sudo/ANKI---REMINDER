import { useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, BackHandler, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

// 1. Deploy the web folder (GitHub Pages / Netlify / Vercel)
// 2. Paste that https:// URL here
const SITE = 'https://krishalmehta98-sudo.github.io/ANKI---REMINDER/';

export default function App() {
  const ref = useRef(null);
  const [canBack, setCanBack] = useState(false);

  if (Platform.OS === 'android') {
    BackHandler.addEventListener('hardwareBackPress', () => {
      if (canBack && ref.current) { ref.current.goBack(); return true; }
      return false;
    });
  }

  return (
    <SafeAreaView style={styles.wrap}>
      <StatusBar style="light" />
      <WebView
        ref={ref}
        source={{ uri: SITE }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled            /* keeps localStorage — all your tasks live here */
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onNavigationStateChange={s => setCanBack(s.canGoBack)}
        style={styles.web}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0F0F0F' },
  web: { flex: 1, backgroundColor: '#0F0F0F' }
});
