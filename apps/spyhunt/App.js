import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { useEffect, useState } from 'react';
import identity from './identity.json';

// Shared WebView shell — the whole game lives in the inlined assets/app.html.
export default function App() {
  const [html, setHtml] = useState(null);
  const bg = identity.bgColor || '#0e1117';

  useEffect(() => {
    (async () => {
      const asset = Asset.fromModule(require('./assets/app.html'));
      await asset.downloadAsync();
      const content = await FileSystem.readAsStringAsync(asset.localUri);
      setHtml(content);
    })();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar style="light" backgroundColor={bg} translucent={false} />
      {html && (
        <WebView
          style={[styles.webview, { backgroundColor: bg }]}
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowFileAccess={true}
          mixedContentMode="always"
          scrollEnabled={true}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
