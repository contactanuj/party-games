import { registerRootComponent } from 'expo';
import App from './App';

// Custom entry (monorepo-safe): expo/AppEntry.js hardcodes a relative path that breaks when
// expo is hoisted to the workspace root.
registerRootComponent(App);
