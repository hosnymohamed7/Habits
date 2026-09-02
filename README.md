# خُطوة — تطبيق تعقب العادات والتخطيط الشخصي

تطبيق React Native + Expo كامل لتعقب العادات، يعمل أوفلاين بالكامل.

## الملفات
- `App.js` — الملف الرئيسي (كل الشاشات والمنطق).
- `widget-task-handler.js` — معالج ويدجت الشاشة الرئيسية على أندرويد.
- `app.json` — إعدادات Expo (الاسم، الحزمة، الأيقونة، Splash).
- `package.json` — الاعتماديات.

## التشغيل السريع على Expo Snack
1. أنشئ Snack جديد على https://snack.expo.dev
2. الصق محتوى `App.js` في ملف App.js بالمشروع.
3. من تبويب Dependencies أضف:
   `@react-native-async-storage/async-storage`, `expo-av`, `expo-haptics`,
   `expo-file-system`, `expo-sharing`, `expo-document-picker`, `react-native-svg`.
4. جرّب مباشرة عبر QR على جهازك أو المحاكي.

> ملاحظة: مكتبة `react-native-android-widget` **لا تعمل داخل Snack/Expo Go**
> لأنها تحتاج كود Native حقيقي. لتجربة الويدجت فعلياً يجب عمل Development Build
> أو بناء APK كما بالخطوات التالية.

## بناء APK فعلي (يشمل الويدجت)
```bash
npm install -g eas-cli
npm install
eas login
eas build:configure
eas build -p android --profile preview
```

### لتفعيل الويدجت في `index.js` (خارج Snack، في مشروع محلي):
```js
import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import App from './App';
import { widgetTaskHandler } from './widget-task-handler';

registerRootComponent(App);
registerWidgetTaskHandler(widgetTaskHandler);
```

كما يجب إضافة تعريف الويدجت داخل `app.json` ضمن plugin
`react-native-android-widget` (اسم الويدجت، الحجم الأدنى/الأقصى، الأيقونة)
حسب توثيق المكتبة الرسمي: https://github.com/sAleksovski/react-native-android-widget

## الأيقونة و Splash Screen
ضع الملفات التالية داخل مجلد `assets/`:
- `icon.png` (1024×1024)
- `adaptive-icon.png` (1024×1024، خلفية شفافة)
- `splash.png` (خلفية متناسقة مع `#0F172A` للوضع الداكن)

## الميزات المنفذة
- إضافة/تعديل/حذف عادات مع مهام فرعية غير محدودة.
- 3 أنواع أهداف: عدد مرات، وقت بالدقائق، إنجاز كلي.
- أولويات مرئية بالألوان (Flags).
- لوحة ألوان مخصصة لكل عادة (15 لون).
- تجميد السلسلة (Streak Freeze) بعدد محدود من المرات.
- تكرار مرن: يومي / أيام أسبوع محددة / أسبوعي / أيام مخصصة بالشهر.
- صوت + اهتزاز عند الإنجاز، وتأثير Confetti بصري.
- دعم كامل للوضع الداكن والفاتح.
- رسوم بيانية SVG: عمودي أسبوعي، خطي شهري، دائري لتوزيع الأولويات.
- تخزين محلي بالكامل عبر AsyncStorage.
- تصدير/استيراد البيانات كملف JSON.
- هيكلية جاهزة لويدجت أندرويد تفاعلي (تأشير مباشر من الشاشة الرئيسية).
