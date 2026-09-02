/**
 * =============================================================
 *  تطبيق "خُطوة" - تعقب العادات والتخطيط الشخصي
 * =============================================================
 * ملف رئيسي متكامل (App.js) جاهز للتشغيل على Expo Snack
 * وقابل لبناء APK عبر EAS Build.
 *
 * المكتبات المستخدمة:
 *  - @react-native-async-storage/async-storage : تخزين محلي أوفلاين
 *  - expo-av                                    : تشغيل المؤثرات الصوتية
 *  - expo-haptics                                : الاهتزاز عند الإنجاز
 *  - react-native-svg                            : الرسوم البيانية والإحصائيات
 *  - expo-file-system + expo-sharing             : تصدير/استيراد JSON
 *  - expo-document-picker                        : اختيار ملف الاستيراد
 *  - react-native-android-widget                 : ويدجت الشاشة الرئيسية
 * =============================================================
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Switch,
  Alert,
  Animated,
  Easing,
  Dimensions,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import Svg, {
  Circle,
  Path,
  Line,
  Rect,
  G,
  Text as SvgText,
  Polyline,
} from 'react-native-svg';

// محاولة استيراد مكتبة الويدجت (تعمل فقط على بناء Android حقيقي وليس داخل Expo Go)
let requestWidgetUpdate = null;
try {
  // eslint-disable-next-line global-require
  const widgetLib = require('react-native-android-widget');
  requestWidgetUpdate = widgetLib.requestWidgetUpdate;
} catch (e) {
  // غير متاح داخل Snack/Expo Go - سيتم تجاهله بأمان
}

const { width: SCREEN_W } = Dimensions.get('window');

/* =============================================================
 *  الثوابت العامة
 * ============================================================= */

// مفاتيح التخزين المحلي
const STORAGE_KEYS = {
  HABITS: '@khatwa_habits_v1',
  LOGS: '@khatwa_logs_v1', // سجل الإنجاز اليومي لكل عادة
  SETTINGS: '@khatwa_settings_v1',
};

// ألوان الثيم الفاتح والداكن
const THEMES = {
  light: {
    mode: 'light',
    bg: '#F4F6FB',
    card: '#FFFFFF',
    text: '#0F172A',
    subtext: '#64748B',
    border: '#E2E8F0',
    primary: '#6C5CE7',
    success: '#22C55E',
    danger: '#EF4444',
    inputBg: '#F1F5F9',
    tabBar: '#FFFFFF',
  },
  dark: {
    mode: 'dark',
    bg: '#0B1220',
    card: '#151E2E',
    text: '#F1F5F9',
    subtext: '#94A3B8',
    border: '#22304A',
    primary: '#8B7CF6',
    success: '#34D399',
    danger: '#F87171',
    inputBg: '#1C2B41',
    tabBar: '#101928',
  },
};

// لوحة الألوان المخصصة للعادات (Presets)
const COLOR_PRESETS = [
  '#6C5CE7', '#00B894', '#0984E3', '#E17055', '#D63031',
  '#FDCB6E', '#00CEC9', '#E84393', '#2D3436', '#0FB9B1',
  '#F368E0', '#FF7675', '#55A3FF', '#A29BFE', '#FAB1A0',
];

// مستويات الأولوية
const PRIORITIES = {
  none: { label: 'بدون أولوية', color: '#94A3B8' },
  low: { label: 'منخفضة', color: '#3B82F6' },
  medium: { label: 'متوسطة', color: '#F97316' },
  high: { label: 'قصوى', color: '#EF4444' },
};

// أنواع الأهداف
const GOAL_TYPES = {
  count: 'عدد مرات',
  time: 'وقت (دقائق)',
  full: 'إنجاز كلي',
};

// أنواع التكرار
const REPEAT_TYPES = {
  daily: 'يومي',
  weekdays: 'أيام محددة',
  weekly: 'أسبوعي',
  monthly_days: 'أيام مخصصة بالشهر',
};

const WEEK_DAYS = [
  { key: 0, label: 'أحد' },
  { key: 1, label: 'إثنين' },
  { key: 2, label: 'ثلاثاء' },
  { key: 3, label: 'أربع' },
  { key: 4, label: 'خميس' },
  { key: 5, label: 'جمعة' },
  { key: 6, label: 'سبت' },
];

// أصوات محايدة عبر الإنترنت (يمكن استبدالها بملفات محلية داخل assets/sounds)
const SOUND_URIS = {
  complete: 'https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg',
  tick: 'https://actions.google.com/sounds/v1/cartoon/wood_plank_flick.ogg',
};

/* =============================================================
 *  أدوات مساعدة عامة (Utils)
 * ============================================================= */

// توليد معرف فريد بسيط
const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// تنسيق التاريخ كـ YYYY-MM-DD
const formatDateKey = (date = new Date()) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// إرجاع مصفوفة بآخر N يوم كمفاتيح تاريخ
const lastNDays = (n) => {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(formatDateKey(d));
  }
  return arr;
};

// التحقق: هل العادة "مستحقة" اليوم بناءً على نمط التكرار؟
const isHabitDueToday = (habit, dateObj = new Date()) => {
  const dow = dateObj.getDay(); // 0 = أحد
  const dom = dateObj.getDate(); // يوم الشهر
  switch (habit.repeat?.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return (habit.repeat.days || []).includes(dow);
    case 'weekly':
      // تعتبر مستحقة مرة كل أسبوع في اليوم المحدد الأول من قائمة الأيام
      return (habit.repeat.days || []).includes(dow);
    case 'monthly_days':
      return (habit.repeat.monthDays || []).includes(dom);
    default:
      return true;
  }
};

/* =============================================================
 *  سياق الثيم (Theme Context)
 * ============================================================= */
const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

/* =============================================================
 *  سياق البيانات (Data Context) - إدارة العادات والسجلات
 * ============================================================= */
const DataContext = createContext();
const useData = () => useContext(DataContext);

/**
 * مزوّد البيانات: يحمّل العادات والسجلات من AsyncStorage عند الإقلاع،
 * ويوفر جميع دوال التعديل (إضافة/حذف/تعديل/تأشير كمكتمل/تجميد السلسلة...)
 */
function DataProvider({ children }) {
  const [habits, setHabits] = useState([]); // قائمة العادات
  const [logs, setLogs] = useState({}); // { habitId: { 'YYYY-MM-DD': { doneSubtasks: [], count, minutes, completed } } }
  const [loaded, setLoaded] = useState(false);

  // تحميل البيانات عند بدء التطبيق
  useEffect(() => {
    (async () => {
      try {
        const rawHabits = await AsyncStorage.getItem(STORAGE_KEYS.HABITS);
        const rawLogs = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
        if (rawHabits) setHabits(JSON.parse(rawHabits));
        if (rawLogs) setLogs(JSON.parse(rawLogs));
      } catch (e) {
        console.warn('خطأ في تحميل البيانات المحلية', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // حفظ العادات تلقائياً عند أي تغيير
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.HABITS, JSON.stringify(habits));
  }, [habits, loaded]);

  // حفظ السجلات تلقائياً عند أي تغيير
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
  }, [logs, loaded]);

  // مزامنة الويدجت في كل مرة تتغير فيها البيانات (إن كانت المكتبة متاحة)
  useEffect(() => {
    if (loaded) syncAllWidgets(habits, logs);
  }, [habits, logs, loaded]);

  /* ---------- إدارة العادات ---------- */

  // إضافة عادة جديدة
  const addHabit = useCallback((habitData) => {
    const newHabit = {
      id: genId(),
      title: habitData.title,
      subtasks: (habitData.subtasks || []).map((t) => ({ id: genId(), title: t })),
      goalType: habitData.goalType || 'full', // count | time | full
      goalTarget: habitData.goalTarget || 1, // عدد المرات أو الدقائق
      priority: habitData.priority || 'none',
      color: habitData.color || COLOR_PRESETS[0],
      repeat: habitData.repeat || { type: 'daily' },
      streak: 0,
      bestStreak: 0,
      freezeAvailable: 2, // عدد مرات تجميد السلسلة المتاحة
      frozenDates: [], // تواريخ تم تجميدها
      createdAt: new Date().toISOString(),
    };
    setHabits((prev) => [newHabit, ...prev]);
    return newHabit.id;
  }, []);

  // تعديل عادة موجودة
  const updateHabit = useCallback((id, patch) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  }, []);

  // حذف عادة
  const deleteHabit = useCallback((id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    setLogs((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  /* ---------- إدارة السجل اليومي ---------- */

  // إرجاع سجل عادة معينة في تاريخ معين (أو كائن افتراضي فارغ)
  const getLog = useCallback(
    (habitId, dateKey) => {
      return (
        logs[habitId]?.[dateKey] || {
          doneSubtasks: [],
          count: 0,
          minutes: 0,
          completed: false,
        }
      );
    },
    [logs]
  );

  // تحديث سجل عادة في تاريخ معين، مع إعادة حساب السلسلة إن اكتملت
  const setLog = useCallback(
    (habitId, dateKey, patch) => {
      setLogs((prev) => {
        const habitLogs = { ...(prev[habitId] || {}) };
        const current = habitLogs[dateKey] || {
          doneSubtasks: [],
          count: 0,
          minutes: 0,
          completed: false,
        };
        habitLogs[dateKey] = { ...current, ...patch };
        return { ...prev, [habitId]: habitLogs };
      });
    },
    []
  );

  // تبديل حالة مهمة فرعية (تم/لم يتم) وإعادة حساب اكتمال العادة تلقائياً
  const toggleSubtask = useCallback(
    (habitId, subtaskId, dateKey = formatDateKey()) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return { justCompleted: false };

      const current = logs[habitId]?.[dateKey] || {
        doneSubtasks: [],
        count: 0,
        minutes: 0,
        completed: false,
      };
      const already = current.doneSubtasks.includes(subtaskId);
      const nextDone = already
        ? current.doneSubtasks.filter((id) => id !== subtaskId)
        : [...current.doneSubtasks, subtaskId];

      const allDone =
        habit.subtasks.length > 0 && nextDone.length === habit.subtasks.length;

      const wasCompleted = current.completed;
      const nowCompleted = habit.subtasks.length > 0 ? allDone : current.completed;

      setLog(habitId, dateKey, { doneSubtasks: nextDone, completed: nowCompleted });

      if (nowCompleted && !wasCompleted) {
        recalcStreak(habitId, dateKey);
      }

      return { justCompleted: nowCompleted && !wasCompleted };
    },
    [habits, logs, setLog]
  );

  // تحديد العادة كمكتملة بالكامل مباشرة (لهدف من نوع "إنجاز كلي" بدون مهام فرعية)
  const markHabitComplete = useCallback(
    (habitId, dateKey = formatDateKey()) => {
      const current = logs[habitId]?.[dateKey];
      const wasCompleted = current?.completed;
      setLog(habitId, dateKey, { completed: !wasCompleted });
      if (!wasCompleted) recalcStreak(habitId, dateKey);
      return { justCompleted: !wasCompleted };
    },
    [logs, setLog]
  );

  // زيادة/إنقاص عداد الهدف (لنوع "عدد مرات" أو "وقت")
  const incrementGoalProgress = useCallback(
    (habitId, field, delta, dateKey = formatDateKey()) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return { justCompleted: false };
      const current = logs[habitId]?.[dateKey] || {
        doneSubtasks: [],
        count: 0,
        minutes: 0,
        completed: false,
      };
      const nextVal = Math.max(0, (current[field] || 0) + delta);
      const target = habit.goalTarget || 1;
      const wasCompleted = current.completed;
      const nowCompleted = nextVal >= target;
      setLog(habitId, dateKey, { [field]: nextVal, completed: nowCompleted });
      if (nowCompleted && !wasCompleted) recalcStreak(habitId, dateKey);
      return { justCompleted: nowCompleted && !wasCompleted };
    },
    [habits, logs, setLog]
  );

  // إعادة حساب السلسلة المتصلة (Streak) بعد إنجاز يوم جديد
  const recalcStreak = useCallback(
    (habitId, completedDateKey) => {
      setHabits((prev) =>
        prev.map((h) => {
          if (h.id !== habitId) return h;
          // نحسب السلسلة بالرجوع للخلف من اليوم الحالي
          let streak = 0;
          let cursor = new Date(completedDateKey);
          // نتحقق يوماً بيوم للخلف
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const key = formatDateKey(cursor);
            const dayLog = logs[habitId]?.[key];
            const wasFrozen = (h.frozenDates || []).includes(key);
            const due = isHabitDueToday(h, cursor);
            if (key === completedDateKey) {
              streak += 1;
            } else if (dayLog?.completed || wasFrozen) {
              streak += 1;
            } else if (!due) {
              // يوم غير مستحق لا يكسر السلسلة، نتخطاه بدون زيادة
            } else {
              break;
            }
            cursor.setDate(cursor.getDate() - 1);
            if (streak > 3650) break; // حماية من الحلقات اللانهائية
          }
          const bestStreak = Math.max(h.bestStreak || 0, streak);
          return { ...h, streak, bestStreak };
        })
      );
    },
    [logs]
  );

  // تجميد السلسلة ليوم معين (حماية العداد عند الطوارئ)
  const freezeStreak = useCallback((habitId, dateKey = formatDateKey()) => {
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        if ((h.freezeAvailable || 0) <= 0) return h;
        if ((h.frozenDates || []).includes(dateKey)) return h;
        return {
          ...h,
          freezeAvailable: h.freezeAvailable - 1,
          frozenDates: [...(h.frozenDates || []), dateKey],
        };
      })
    );
  }, []);

  /* ---------- إحصائيات ---------- */

  // نسبة الالتزام لعادة معينة خلال آخر N يوم
  const getCompletionRate = useCallback(
    (habitId, days = 7) => {
      const dates = lastNDays(days);
      const relevantDates = dates.filter((dk) => {
        const habit = habits.find((h) => h.id === habitId);
        return habit ? isHabitDueToday(habit, new Date(dk)) : true;
      });
      if (relevantDates.length === 0) return 0;
      const doneCount = relevantDates.filter(
        (dk) => logs[habitId]?.[dk]?.completed
      ).length;
      return Math.round((doneCount / relevantDates.length) * 100);
    },
    [habits, logs]
  );

  /* ---------- تصدير / استيراد ---------- */

  // تصدير كل البيانات إلى ملف JSON ومشاركته
  const exportData = useCallback(async () => {
    try {
      const payload = JSON.stringify({ habits, logs, exportedAt: new Date().toISOString() }, null, 2);
      const fileUri = FileSystem.documentDirectory + `khatwa_backup_${formatDateKey()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, payload, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('تم الحفظ', `تم حفظ النسخة الاحتياطية في: ${fileUri}`);
      }
    } catch (e) {
      Alert.alert('خطأ', 'تعذر تصدير البيانات: ' + e.message);
    }
  }, [habits, logs]);

  // استيراد بيانات من ملف JSON تم اختياره
  const importData = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;
      const fileUri = result.assets ? result.assets[0].uri : result.uri;
      const content = await FileSystem.readAsStringAsync(fileUri);
      const parsed = JSON.parse(content);
      if (!parsed.habits) throw new Error('ملف غير صالح');
      Alert.alert(
        'تأكيد الاستيراد',
        'سيتم استبدال البيانات الحالية بالبيانات المستوردة. هل تريد المتابعة؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          {
            text: 'استيراد',
            style: 'destructive',
            onPress: () => {
              setHabits(parsed.habits || []);
              setLogs(parsed.logs || {});
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('خطأ', 'تعذر استيراد الملف: ' + e.message);
    }
  }, []);

  const value = useMemo(
    () => ({
      habits,
      logs,
      loaded,
      addHabit,
      updateHabit,
      deleteHabit,
      getLog,
      setLog,
      toggleSubtask,
      markHabitComplete,
      incrementGoalProgress,
      freezeStreak,
      getCompletionRate,
      exportData,
      importData,
    }),
    [
      habits,
      logs,
      loaded,
      addHabit,
      updateHabit,
      deleteHabit,
      getLog,
      setLog,
      toggleSubtask,
      markHabitComplete,
      incrementGoalProgress,
      freezeStreak,
      getCompletionRate,
      exportData,
      importData,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/* =============================================================
 *  مزامنة الويدجت (Android Home Screen Widget)
 *  باستخدام مكتبة react-native-android-widget
 * ============================================================= */

// دالة تُستدعى عند أي تغيير في البيانات لتحديث كل الويدجت المضافة
async function syncAllWidgets(habits, logs) {
  if (!requestWidgetUpdate || Platform.OS !== 'android') return;
  try {
    // نحفظ نسخة مبسطة من بيانات كل عادة في AsyncStorage بمفتاح خاص
    // ليقرأها ملف تعريف الويدجت (widget-task-handler) عند إعادة الرسم
    const dateKey = formatDateKey();
    const widgetData = habits.map((h) => ({
      id: h.id,
      title: h.title,
      color: h.color,
      streak: h.streak,
      subtasks: h.subtasks,
      doneSubtasks: logs[h.id]?.[dateKey]?.doneSubtasks || [],
      completed: logs[h.id]?.[dateKey]?.completed || false,
    }));
    await AsyncStorage.setItem('@khatwa_widget_data', JSON.stringify(widgetData));
    // إعادة رسم كل نسخ الويدجت المضافة على الشاشة الرئيسية
    // (المنطق الفعلي لرسم الـ Widget موجود في widget-task-handler.js المرفق أدناه كملف منفصل)
    requestWidgetUpdate({
      widgetName: 'HabitWidget',
      renderWidget: () => null, // يُستبدل عملياً بمكوّن الويدجت الحقيقي عبر widget-task-handler
      widgetNotFound: () => {},
    });
  } catch (e) {
    // تجاهل أخطاء الويدجت بأمان حتى لا يؤثر على التطبيق الأساسي
  }
}

/* =============================================================
 *  نظام الصوت والاهتزاز (Sound & Haptics)
 * ============================================================= */

// هوك مخصص لتشغيل صوت الإنجاز مع اهتزاز خفيف
function useCelebrationEffects() {
  const soundRef = useRef(null);

  const playComplete = useCallback(async () => {
    try {
      // اهتزاز النجاح (يعمل حتى لو فشل الصوت)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {}
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: SOUND_URIS.complete },
        { shouldPlay: true, volume: 1 }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      // تجاهل بأمان في حال تعذر تحميل الصوت (مثلاً بدون إنترنت)
    }
  }, []);

  const playTick = useCallback(async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
  }, []);

  useEffect(() => {
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  return { playComplete, playTick };
}

/* =============================================================
 *  تأثير الاحتفال البصري (Confetti خفيف باستخدام Animated)
 * ============================================================= */
function ConfettiBurst({ trigger }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        x: Math.random() * SCREEN_W,
        color: COLOR_PRESETS[i % COLOR_PRESETS.length],
        delay: Math.random() * 150,
        size: 6 + Math.random() * 6,
      })),
    [trigger]
  );
  const anims = useRef(pieces.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (trigger === 0) return;
    anims.forEach((a) => a.setValue(0));
    const animations = anims.map((a, i) =>
      Animated.timing(a, {
        toValue: 1,
        duration: 900 + Math.random() * 400,
        delay: pieces[i].delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    Animated.stagger(15, animations).start();
  }, [trigger]);

  if (trigger === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const translateY = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [-20, 500],
        });
        const opacity = anims[i].interpolate({
          inputRange: [0, 0.8, 1],
          outputRange: [1, 1, 0],
        });
        const rotate = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', `${360 + Math.random() * 360}deg`],
        });
        return (
          <Animated.View
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: 0,
              width: p.size,
              height: p.size * 1.6,
              backgroundColor: p.color,
              borderRadius: 2,
              opacity,
              transform: [{ translateY }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}

/* =============================================================
 *  مكونات مشتركة (Reusable UI Components)
 * ============================================================= */

// شريط تقدم متحرك (Progress Bar)
function ProgressBar({ progress = 0, color = '#6C5CE7', height = 8 }) {
  const anim = useRef(new Animated.Value(0)).current;
  const { theme } = useTheme();

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const widthInterp = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: theme.border,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <Animated.View
        style={{
          height: '100%',
          width: widthInterp,
          backgroundColor: color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

// دائرة تقدم SVG (تستخدم في تفاصيل العادة)
function ProgressRing({ size = 90, strokeWidth = 10, progress = 0, color = '#6C5CE7' }) {
  const { theme } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <Svg width={size} height={size}>
      <Circle
        stroke={theme.border}
        fill="none"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
      />
      <Circle
        stroke={color}
        fill="none"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
      <SvgText
        x={size / 2}
        y={size / 2 + 6}
        fontSize="18"
        fontWeight="bold"
        fill={theme.text}
        textAnchor="middle"
      >
        {`${Math.round(progress)}%`}
      </SvgText>
    </Svg>
  );
}

// علامة الأولوية (Flag)
function PriorityFlag({ priority }) {
  const p = PRIORITIES[priority] || PRIORITIES.none;
  return (
    <View style={styles.flagWrap}>
      <View style={[styles.flagDot, { backgroundColor: p.color }]} />
      <Text style={{ color: p.color, fontSize: 12, fontWeight: '600' }}>{p.label}</Text>
    </View>
  );
}

// زر دائري عام
function IconButton({ onPress, children, style, color }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.iconBtn,
        { backgroundColor: color || theme.inputBg, borderColor: theme.border },
        style,
      ]}
      activeOpacity={0.7}
    >
      {children}
    </TouchableOpacity>
  );
}

/* =============================================================
 *  بطاقة عرض عادة واحدة داخل القائمة الرئيسية
 * ============================================================= */
function HabitCard({ habit, onOpen, onCelebrate }) {
  const { theme } = useTheme();
  const {
    getLog,
    toggleSubtask,
    markHabitComplete,
    incrementGoalProgress,
    freezeStreak,
  } = useData();
  const dateKey = formatDateKey();
  const log = getLog(habit.id, dateKey);
  const due = isHabitDueToday(habit);

  // حساب نسبة التقدم بناءً على نوع الهدف
  let progress = 0;
  if (habit.goalType === 'full') {
    progress = log.completed ? 100 : habit.subtasks.length > 0
      ? Math.round((log.doneSubtasks.length / habit.subtasks.length) * 100)
      : 0;
  } else if (habit.goalType === 'count') {
    progress = Math.min(100, Math.round((log.count / habit.goalTarget) * 100));
  } else if (habit.goalType === 'time') {
    progress = Math.min(100, Math.round((log.minutes / habit.goalTarget) * 100));
  }

  const handleQuickToggle = () => {
    let res = { justCompleted: false };
    if (habit.subtasks.length > 0) {
      // إذا فيه مهام فرعية، الزر السريع يفتح التفاصيل بدل التأشير المباشر
      onOpen();
      return;
    }
    if (habit.goalType === 'count') {
      res = incrementGoalProgress(habit.id, 'count', 1, dateKey);
    } else if (habit.goalType === 'time') {
      res = incrementGoalProgress(habit.id, 'minutes', 5, dateKey);
    } else {
      res = markHabitComplete(habit.id, dateKey);
    }
    if (res.justCompleted) onCelebrate();
  };

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.85}
      style={[
        styles.habitCard,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: due ? 1 : 0.55 },
      ]}
    >
      <View style={[styles.colorBar, { backgroundColor: habit.color }]} />
      <View style={{ flex: 1, padding: 14 }}>
        <View style={styles.rowBetween}>
          <Text style={[styles.habitTitle, { color: theme.text }]} numberOfLines={1}>
            {habit.title}
          </Text>
          <PriorityFlag priority={habit.priority} />
        </View>

        <View style={{ marginTop: 8 }}>
          <ProgressBar progress={progress} color={habit.color} />
        </View>

        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <View style={styles.rowCenter}>
            <Text style={{ fontSize: 13, color: theme.subtext }}>
              🔥 {habit.streak} يوم متتالي
            </Text>
            {!due && (
              <Text style={{ fontSize: 12, color: theme.subtext, marginRight: 8 }}>
                (غير مستحقة اليوم)
              </Text>
            )}
          </View>

          <View style={styles.rowCenter}>
            {habit.freezeAvailable > 0 && (
              <TouchableOpacity
                onPress={() => freezeStreak(habit.id, dateKey)}
                style={{ marginLeft: 8 }}
              >
                <Text style={{ fontSize: 16 }}>🧊</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleQuickToggle}
              style={[
                styles.checkCircle,
                {
                  backgroundColor: log.completed ? habit.color : 'transparent',
                  borderColor: habit.color,
                },
              ]}
            >
              {log.completed && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* =============================================================
 *  الشاشة الرئيسية: قائمة العادات
 * ============================================================= */
function HomeScreen({ onOpenHabit, onAddHabit, celebrationTrigger, fireCelebration }) {
  const { theme } = useTheme();
  const { habits } = useData();
  const { playComplete } = useCelebrationEffects();

  const todayLabel = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleCelebrate = () => {
    playComplete();
    fireCelebration();
  };

  const dueHabits = habits.filter((h) => isHabitDueToday(h));
  const otherHabits = habits.filter((h) => !isHabitDueToday(h));

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.headerWrap}>
        <View>
          <Text style={[styles.appTitle, { color: theme.text }]}>خُطوة 🚶‍♂️</Text>
          <Text style={{ color: theme.subtext, marginTop: 2 }}>{todayLabel}</Text>
        </View>
        <IconButton onPress={onAddHabit} color={theme.primary}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>+</Text>
        </IconButton>
      </View>

      {habits.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 50 }}>🌱</Text>
          <Text style={{ color: theme.subtext, marginTop: 10, fontSize: 15 }}>
            لا توجد عادات بعد. اضغط + لإضافة أول عادة لك!
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...dueHabits, ...otherHabits]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <HabitCard
              habit={item}
              onOpen={() => onOpenHabit(item.id)}
              onCelebrate={handleCelebrate}
            />
          )}
        />
      )}

      <ConfettiBurst trigger={celebrationTrigger} />
    </View>
  );
}

/* =============================================================
 *  شاشة تفاصيل العادة: المهام الفرعية + الهدف + السجل
 * ============================================================= */
function HabitDetailScreen({ habitId, onBack, onEdit, celebrationTrigger, fireCelebration }) {
  const { theme } = useTheme();
  const { habits, getLog, toggleSubtask, incrementGoalProgress, markHabitComplete, deleteHabit, freezeStreak, getCompletionRate } =
    useData();
  const { playComplete, playTick } = useCelebrationEffects();
  const habit = habits.find((h) => h.id === habitId);
  const dateKey = formatDateKey();

  if (!habit) return null;
  const log = getLog(habit.id, dateKey);

  let progress = 0;
  if (habit.goalType === 'full') {
    progress = log.completed
      ? 100
      : habit.subtasks.length > 0
      ? Math.round((log.doneSubtasks.length / habit.subtasks.length) * 100)
      : 0;
  } else if (habit.goalType === 'count') {
    progress = Math.min(100, Math.round((log.count / habit.goalTarget) * 100));
  } else if (habit.goalType === 'time') {
    progress = Math.min(100, Math.round((log.minutes / habit.goalTarget) * 100));
  }

  const handleToggleSub = (subId) => {
    const res = toggleSubtask(habit.id, subId, dateKey);
    playTick();
    if (res.justCompleted) {
      playComplete();
      fireCelebration();
    }
  };

  const handleFullComplete = () => {
    const res = markHabitComplete(habit.id, dateKey);
    if (res.justCompleted) {
      playComplete();
      fireCelebration();
    } else {
      playTick();
    }
  };

  const handleIncrement = (field, delta) => {
    const res = incrementGoalProgress(habit.id, field, delta, dateKey);
    playTick();
    if (res.justCompleted) {
      playComplete();
      fireCelebration();
    }
  };

  const confirmDelete = () => {
    Alert.alert('حذف العادة', `هل تريد حذف "${habit.title}" نهائياً؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => { deleteHabit(habit.id); onBack(); } },
    ]);
  };

  const weekRate = getCompletionRate(habit.id, 7);
  const monthRate = getCompletionRate(habit.id, 30);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={styles.rowBetween}>
          <TouchableOpacity onPress={onBack}>
            <Text style={{ color: theme.primary, fontSize: 16 }}>‹ رجوع</Text>
          </TouchableOpacity>
          <View style={styles.rowCenter}>
            <TouchableOpacity onPress={() => onEdit(habit.id)} style={{ marginLeft: 16 }}>
              <Text style={{ color: theme.primary }}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete}>
              <Text style={{ color: theme.danger }}>حذف</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.detailHeaderCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailTitle, { color: theme.text }]}>{habit.title}</Text>
            <PriorityFlag priority={habit.priority} />
            <Text style={{ color: theme.subtext, marginTop: 6 }}>
              🔥 السلسلة الحالية: {habit.streak} يوم | الأفضل: {habit.bestStreak} يوم
            </Text>
            <Text style={{ color: theme.subtext, marginTop: 2 }}>
              🧊 تجميدات متاحة: {habit.freezeAvailable}
            </Text>
            <Text style={{ color: theme.subtext, marginTop: 2 }}>
              🔁 التكرار: {REPEAT_TYPES[habit.repeat?.type] || 'يومي'}
            </Text>
          </View>
          <ProgressRing progress={progress} color={habit.color} />
        </View>

        {/* المهام الفرعية */}
        {habit.subtasks.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>المهام الفرعية</Text>
            {habit.subtasks.map((s) => {
              const done = log.doneSubtasks.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => handleToggleSub(s.id)}
                  style={styles.subtaskRow}
                >
                  <View
                    style={[
                      styles.checkCircleSm,
                      { backgroundColor: done ? habit.color : 'transparent', borderColor: habit.color },
                    ]}
                  >
                    {done && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                  </View>
                  <Text
                    style={{
                      color: theme.text,
                      marginRight: 10,
                      textDecorationLine: done ? 'line-through' : 'none',
                      opacity: done ? 0.6 : 1,
                    }}
                  >
                    {s.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* هدف: عدد مرات */}
        {habit.goalType === 'count' && (
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              الهدف: {log.count} / {habit.goalTarget} مرة
            </Text>
            <View style={styles.rowCenter}>
              <IconButton onPress={() => handleIncrement('count', -1)}>
                <Text style={{ color: theme.text, fontSize: 18 }}>−</Text>
              </IconButton>
              <View style={{ width: 16 }} />
              <IconButton onPress={() => handleIncrement('count', 1)} color={habit.color}>
                <Text style={{ color: '#fff', fontSize: 18 }}>+</Text>
              </IconButton>
            </View>
          </View>
        )}

        {/* هدف: وقت */}
        {habit.goalType === 'time' && (
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              الهدف: {log.minutes} / {habit.goalTarget} دقيقة
            </Text>
            <View style={styles.rowCenter}>
              <IconButton onPress={() => handleIncrement('minutes', -5)}>
                <Text style={{ color: theme.text, fontSize: 16 }}>−5</Text>
              </IconButton>
              <View style={{ width: 16 }} />
              <IconButton onPress={() => handleIncrement('minutes', 5)} color={habit.color}>
                <Text style={{ color: '#fff', fontSize: 16 }}>+5</Text>
              </IconButton>
            </View>
          </View>
        )}

        {/* هدف: إنجاز كلي بدون مهام فرعية */}
        {habit.goalType === 'full' && habit.subtasks.length === 0 && (
          <TouchableOpacity
            onPress={handleFullComplete}
            style={[
              styles.bigCompleteBtn,
              { backgroundColor: log.completed ? habit.color : theme.card, borderColor: habit.color },
            ]}
          >
            <Text style={{ color: log.completed ? '#fff' : habit.color, fontWeight: 'bold', fontSize: 15 }}>
              {log.completed ? '✓ تم الإنجاز اليوم' : 'تأشير كمكتمل'}
            </Text>
          </TouchableOpacity>
        )}

        {/* تجميد السلسلة */}
        {habit.freezeAvailable > 0 && (
          <TouchableOpacity
            onPress={() => freezeStreak(habit.id, dateKey)}
            style={[styles.freezeBtn, { borderColor: theme.border }]}
          >
            <Text style={{ color: theme.text }}>🧊 تجميد السلسلة لهذا اليوم (طوارئ)</Text>
          </TouchableOpacity>
        )}

        {/* إحصائيات مختصرة */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>معدل الالتزام</Text>
          <View style={styles.rowBetween}>
            <StatMini label="آخر 7 أيام" value={`${weekRate}%`} color={habit.color} />
            <StatMini label="آخر 30 يوم" value={`${monthRate}%`} color={habit.color} />
          </View>
          <View style={{ marginTop: 14 }}>
            <WeeklyBarChart habitId={habit.id} color={habit.color} />
          </View>
        </View>
      </ScrollView>

      <ConfettiBurst trigger={celebrationTrigger} />
    </View>
  );
}

// عنصر صغير لعرض قيمة إحصائية
function StatMini({ label, value, color }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.subtext, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

/* =============================================================
 *  رسم بياني عمودي (Bar Chart) لآخر 7 أيام - باستخدام react-native-svg
 * ============================================================= */
function WeeklyBarChart({ habitId, color }) {
  const { theme } = useTheme();
  const { logs } = useData();
  const days = lastNDays(7);
  const width = SCREEN_W - 80;
  const height = 120;
  const barWidth = width / (days.length * 2);

  const dayLabels = ['أحد', 'إثنين', 'ثلاثاء', 'أربع', 'خميس', 'جمعة', 'سبت'];

  return (
    <Svg width={width} height={height + 24}>
      {days.map((dk, i) => {
        const completed = logs[habitId]?.[dk]?.completed;
        const barHeight = completed ? height * 0.8 : height * 0.08;
        const x = i * (width / days.length) + barWidth / 2;
        const y = height - barHeight;
        const dow = new Date(dk).getDay();
        return (
          <G key={dk}>
            <Rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={6}
              fill={completed ? color : theme.border}
            />
            <SvgText
              x={x + barWidth / 2}
              y={height + 16}
              fontSize="10"
              fill={theme.subtext}
              textAnchor="middle"
            >
              {dayLabels[dow]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/* =============================================================
 *  رسم بياني خطي (Line Chart) للتقدم الشهري
 * ============================================================= */
function MonthlyLineChart({ habitId, color }) {
  const { theme } = useTheme();
  const { logs } = useData();
  const days = lastNDays(30);
  const width = SCREEN_W - 64;
  const height = 130;

  // نحسب نسبة تراكمية بسيطة لكل 5 أيام (6 نقاط)
  const buckets = [];
  for (let i = 0; i < 30; i += 5) {
    const slice = days.slice(i, i + 5);
    const doneCount = slice.filter((dk) => logs[habitId]?.[dk]?.completed).length;
    buckets.push(Math.round((doneCount / slice.length) * 100));
  }

  const stepX = width / (buckets.length - 1);
  const points = buckets
    .map((val, i) => `${i * stepX},${height - (val / 100) * height}`)
    .join(' ');

  return (
    <Svg width={width} height={height + 20}>
      {/* خطوط شبكة أفقية خفيفة */}
      {[0, 0.5, 1].map((f, idx) => (
        <Line
          key={idx}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          stroke={theme.border}
          strokeWidth={1}
        />
      ))}
      <Polyline points={points} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {buckets.map((val, i) => (
        <Circle key={i} cx={i * stepX} cy={height - (val / 100) * height} r={4} fill={color} />
      ))}
    </Svg>
  );
}

/* =============================================================
 *  مخطط دائري (Pie-like) بسيط لتوزيع الأولويات عبر كل العادات
 * ============================================================= */
function PriorityDonutChart({ habits }) {
  const { theme } = useTheme();
  const size = 140;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const counts = { high: 0, medium: 0, low: 0, none: 0 };
  habits.forEach((h) => { counts[h.priority || 'none'] += 1; });
  const total = habits.length || 1;

  let cumulative = 0;
  const segments = Object.keys(counts).map((key) => {
    const value = counts[key];
    const fraction = value / total;
    const dash = fraction * circumference;
    const seg = {
      key,
      color: PRIORITIES[key].color,
      dashArray: `${dash} ${circumference - dash}`,
      offset: -cumulative,
    };
    cumulative += dash;
    return seg;
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          {segments.map((s) => (
            <Circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={s.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={s.dashArray}
              strokeDashoffset={s.offset}
            />
          ))}
        </G>
      </Svg>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
        {Object.keys(PRIORITIES).map((key) => (
          <View key={key} style={{ flexDirection: 'row-reverse', alignItems: 'center', margin: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIORITIES[key].color, marginLeft: 4 }} />
            <Text style={{ fontSize: 11, color: theme.subtext }}>
              {PRIORITIES[key].label} ({counts[key]})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* =============================================================
 *  شاشة الإحصائيات الشاملة (Dashboard)
 * ============================================================= */
function StatsScreen() {
  const { theme } = useTheme();
  const { habits, getCompletionRate } = useData();
  const [selectedHabit, setSelectedHabit] = useState(habits[0]?.id || null);

  const habit = habits.find((h) => h.id === selectedHabit) || habits[0];

  if (habits.length === 0) {
    return (
      <View style={[styles.emptyState, { flex: 1, backgroundColor: theme.bg }]}>
        <Text style={{ fontSize: 44 }}>📊</Text>
        <Text style={{ color: theme.subtext, marginTop: 10 }}>
          أضف عادات أولاً لعرض الإحصائيات
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
        <Text style={[styles.appTitle, { color: theme.text, marginBottom: 12 }]}>الإحصائيات</Text>

        {/* توزيع الأولويات على كل العادات */}
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>توزيع الأولويات</Text>
          <PriorityDonutChart habits={habits} />
        </View>

        {/* اختيار عادة لعرض تفاصيلها */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 20, marginBottom: 10 }]}>
          تفاصيل عادة محددة
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {habits.map((h) => (
            <TouchableOpacity
              key={h.id}
              onPress={() => setSelectedHabit(h.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selectedHabit === h.id ? h.color : theme.card,
                  borderColor: h.color,
                },
              ]}
            >
              <Text style={{ color: selectedHabit === h.id ? '#fff' : theme.text, fontSize: 13 }}>
                {h.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {habit && (
          <>
            <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>الأسبوع الحالي</Text>
              <WeeklyBarChart habitId={habit.id} color={habit.color} />
            </View>

            <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>الاتجاه الشهري</Text>
              <MonthlyLineChart habitId={habit.id} color={habit.color} />
            </View>

            <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>ملخص سنوي (آخر 365 يوم)</Text>
              <View style={styles.rowBetween}>
                <StatMini label="7 أيام" value={`${getCompletionRate(habit.id, 7)}%`} color={habit.color} />
                <StatMini label="30 يوم" value={`${getCompletionRate(habit.id, 30)}%`} color={habit.color} />
                <StatMini label="365 يوم" value={`${getCompletionRate(habit.id, 365)}%`} color={habit.color} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* =============================================================
 *  شاشة إضافة / تعديل عادة
 * ============================================================= */
function HabitFormScreen({ habitId, onDone, onCancel }) {
  const { theme } = useTheme();
  const { habits, addHabit, updateHabit } = useData();
  const existing = habitId ? habits.find((h) => h.id === habitId) : null;

  const [title, setTitle] = useState(existing?.title || '');
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtasks, setSubtasks] = useState(existing?.subtasks?.map((s) => s.title) || []);
  const [goalType, setGoalType] = useState(existing?.goalType || 'full');
  const [goalTarget, setGoalTarget] = useState(String(existing?.goalTarget || 1));
  const [priority, setPriority] = useState(existing?.priority || 'none');
  const [color, setColor] = useState(existing?.color || COLOR_PRESETS[0]);
  const [repeatType, setRepeatType] = useState(existing?.repeat?.type || 'daily');
  const [repeatDays, setRepeatDays] = useState(existing?.repeat?.days || []);
  const [monthDaysInput, setMonthDaysInput] = useState(
    (existing?.repeat?.monthDays || []).join('، ')
  );

  const toggleWeekday = (dayKey) => {
    setRepeatDays((prev) =>
      prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey]
    );
  };

  const addSubtask = () => {
    if (!subtaskInput.trim()) return;
    setSubtasks((prev) => [...prev, subtaskInput.trim()]);
    setSubtaskInput('');
  };

  const removeSubtask = (idx) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال اسم العادة');
      return;
    }
    const monthDays = monthDaysInput
      .split(/[،,]/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 31);

    const habitData = {
      title: title.trim(),
      subtasks,
      goalType,
      goalTarget: Math.max(1, parseInt(goalTarget, 10) || 1),
      priority,
      color,
      repeat: {
        type: repeatType,
        days: repeatDays,
        monthDays,
      },
    };

    if (existing) {
      // عند التعديل نحافظ على العناصر القديمة للمهام الفرعية إن كان نصها لم يتغير
      const mergedSubtasks = subtasks.map((t, i) => {
        const old = existing.subtasks[i];
        return old && old.title === t ? old : { id: genId(), title: t };
      });
      updateHabit(existing.id, { ...habitData, subtasks: mergedSubtasks });
    } else {
      addHabit(habitData);
    }
    onDone();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <View style={styles.rowBetween}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={{ color: theme.subtext, fontSize: 15 }}>إلغاء</Text>
          </TouchableOpacity>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {existing ? 'تعديل العادة' : 'عادة جديدة'}
          </Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 15 }}>حفظ</Text>
          </TouchableOpacity>
        </View>

        {/* اسم العادة */}
        <Text style={[styles.label, { color: theme.subtext }]}>اسم العادة</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="مثال: قراءة كتاب"
          placeholderTextColor={theme.subtext}
          style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text }]}
        />

        {/* المهام الفرعية */}
        <Text style={[styles.label, { color: theme.subtext }]}>المهام الفرعية (اختياري)</Text>
        <View style={styles.rowCenter}>
          <TextInput
            value={subtaskInput}
            onChangeText={setSubtaskInput}
            placeholder="أضف مهمة فرعية..."
            placeholderTextColor={theme.subtext}
            style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, color: theme.text }]}
            onSubmitEditing={addSubtask}
          />
          <TouchableOpacity onPress={addSubtask} style={[styles.smallAddBtn, { backgroundColor: theme.primary }]}>
            <Text style={{ color: '#fff', fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>
        {subtasks.map((t, idx) => (
          <View key={idx} style={[styles.subtaskEditRow, { borderColor: theme.border }]}>
            <Text style={{ color: theme.text, flex: 1 }}>• {t}</Text>
            <TouchableOpacity onPress={() => removeSubtask(idx)}>
              <Text style={{ color: theme.danger }}>حذف</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* نوع الهدف */}
        <Text style={[styles.label, { color: theme.subtext }]}>نوع الهدف</Text>
        <View style={styles.rowCenter}>
          {Object.keys(GOAL_TYPES).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setGoalType(key)}
              style={[
                styles.chip,
                { backgroundColor: goalType === key ? theme.primary : theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={{ color: goalType === key ? '#fff' : theme.text, fontSize: 13 }}>
                {GOAL_TYPES[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {(goalType === 'count' || goalType === 'time') && (
          <>
            <Text style={[styles.label, { color: theme.subtext }]}>
              {goalType === 'count' ? 'العدد المستهدف' : 'الدقائق المستهدفة'}
            </Text>
            <TextInput
              value={goalTarget}
              onChangeText={setGoalTarget}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text }]}
            />
          </>
        )}

        {/* الأولوية */}
        <Text style={[styles.label, { color: theme.subtext }]}>الأولوية</Text>
        <View style={styles.rowCenter}>
          {Object.keys(PRIORITIES).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setPriority(key)}
              style={[
                styles.chip,
                {
                  backgroundColor: priority === key ? PRIORITIES[key].color : theme.card,
                  borderColor: PRIORITIES[key].color,
                },
              ]}
            >
              <Text style={{ color: priority === key ? '#fff' : theme.text, fontSize: 13 }}>
                {PRIORITIES[key].label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* لوحة الألوان */}
        <Text style={[styles.label, { color: theme.subtext }]}>لون العادة</Text>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
          {COLOR_PRESETS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setColor(c)}
              style={[
                styles.colorSwatch,
                { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: theme.text },
              ]}
            />
          ))}
        </View>

        {/* نمط التكرار */}
        <Text style={[styles.label, { color: theme.subtext }]}>نمط التكرار</Text>
        <View style={styles.rowCenter}>
          {Object.keys(REPEAT_TYPES).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setRepeatType(key)}
              style={[
                styles.chip,
                { backgroundColor: repeatType === key ? theme.primary : theme.card, borderColor: theme.border },
              ]}
            >
              <Text style={{ color: repeatType === key ? '#fff' : theme.text, fontSize: 12 }}>
                {REPEAT_TYPES[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {(repeatType === 'weekdays' || repeatType === 'weekly') && (
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', marginTop: 8 }}>
            {WEEK_DAYS.map((d) => (
              <TouchableOpacity
                key={d.key}
                onPress={() => toggleWeekday(d.key)}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: repeatDays.includes(d.key) ? theme.primary : theme.card,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={{ color: repeatDays.includes(d.key) ? '#fff' : theme.text, fontSize: 12 }}>
                  {d.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {repeatType === 'monthly_days' && (
          <>
            <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 6 }}>
              أدخل أيام الشهر مفصولة بفاصلة (مثال: 1، 15، 28)
            </Text>
            <TextInput
              value={monthDaysInput}
              onChangeText={setMonthDaysInput}
              placeholder="1، 15، 28"
              placeholderTextColor={theme.subtext}
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text }]}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* =============================================================
 *  شاشة الإعدادات: الثيم + تصدير/استيراد + معلومات
 * ============================================================= */
function SettingsScreen({ themeMode, setThemeMode }) {
  const { theme } = useTheme();
  const { exportData, importData, habits } = useData();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={[styles.appTitle, { color: theme.text, marginBottom: 16 }]}>الإعدادات</Text>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.text, fontSize: 15 }}>الوضع الداكن</Text>
          <Switch
            value={themeMode === 'dark'}
            onValueChange={(v) => setThemeMode(v ? 'dark' : 'light')}
            trackColor={{ true: theme.primary, false: theme.border }}
          />
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>النسخ الاحتياطي</Text>
        <Text style={{ color: theme.subtext, fontSize: 13, marginBottom: 12 }}>
          يمكنك تصدير جميع بياناتك ({habits.length} عادة) كملف JSON، أو استيراد نسخة سابقة.
        </Text>
        <TouchableOpacity onPress={exportData} style={[styles.settingBtn, { backgroundColor: theme.primary }]}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>تصدير البيانات (JSON)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={importData}
          style={[styles.settingBtn, { backgroundColor: theme.inputBg, marginTop: 10 }]}
        >
          <Text style={{ color: theme.text, fontWeight: '600' }}>استيراد بيانات</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>حول التطبيق</Text>
        <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 20 }}>
          "خُطوة" تطبيق لتعقب العادات والتخطيط الشخصي، يعمل بالكامل بدون إنترنت،
          مع دعم ويدجت الشاشة الرئيسية على أندرويد، رسوم بيانية للإحصائيات،
          ونظام سلاسل (Streaks) مع إمكانية التجميد وقت الطوارئ.
        </Text>
      </View>
    </ScrollView>
  );
}

/* =============================================================
 *  شريط التبويبات السفلي (Bottom Tab Bar) بسيط بدون مكتبات ملاحة خارجية
 * ============================================================= */
function BottomTabBar({ activeTab, setActiveTab }) {
  const { theme } = useTheme();
  const tabs = [
    { key: 'home', label: 'الرئيسية', icon: '🏠' },
    { key: 'stats', label: 'الإحصائيات', icon: '📊' },
    { key: 'settings', label: 'الإعدادات', icon: '⚙️' },
  ];
  return (
    <View style={[styles.tabBar, { backgroundColor: theme.tabBar, borderColor: theme.border }]}>
      {tabs.map((t) => (
        <TouchableOpacity
          key={t.key}
          onPress={() => setActiveTab(t.key)}
          style={styles.tabItem}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 20 }}>{t.icon}</Text>
          <Text
            style={{
              fontSize: 11,
              marginTop: 2,
              color: activeTab === t.key ? theme.primary : theme.subtext,
              fontWeight: activeTab === t.key ? 'bold' : 'normal',
            }}
          >
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* =============================================================
 *  المكوّن الرئيسي للتطبيق: يدير التنقل بين الشاشات والحالة العامة
 * ============================================================= */
export default function App() {
  const [themeMode, setThemeMode] = useState('light'); // light | dark
  const [activeTab, setActiveTab] = useState('home'); // home | stats | settings
  const [screenStack, setScreenStack] = useState(['list']); // list | detail | form
  const [selectedHabitId, setSelectedHabitId] = useState(null);
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [celebrationTrigger, setCelebrationTrigger] = useState(0);

  const theme = THEMES[themeMode];

  const fireCelebration = () => setCelebrationTrigger((c) => c + 1);

  const currentScreen = screenStack[screenStack.length - 1];

  const push = (screen) => setScreenStack((prev) => [...prev, screen]);
  const pop = () => setScreenStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const openHabitDetail = (id) => {
    setSelectedHabitId(id);
    push('detail');
  };

  const openAddHabit = () => {
    setEditingHabitId(null);
    push('form');
  };

  const openEditHabit = (id) => {
    setEditingHabitId(id);
    push('form');
  };

  const handleFormDone = () => {
    pop();
  };

  // عند التبديل بين التبويبات نعيد المكدس لأول شاشة
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setScreenStack(['list']);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeMode }}>
      <DataProvider>
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <StatusBar
            barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
            backgroundColor={theme.bg}
          />

          <View style={{ flex: 1 }}>
            {activeTab === 'home' && (
              <>
                {currentScreen === 'list' && (
                  <HomeScreen
                    onOpenHabit={openHabitDetail}
                    onAddHabit={openAddHabit}
                    celebrationTrigger={celebrationTrigger}
                    fireCelebration={fireCelebration}
                  />
                )}
                {currentScreen === 'detail' && (
                  <HabitDetailScreen
                    habitId={selectedHabitId}
                    onBack={pop}
                    onEdit={openEditHabit}
                    celebrationTrigger={celebrationTrigger}
                    fireCelebration={fireCelebration}
                  />
                )}
                {currentScreen === 'form' && (
                  <HabitFormScreen
                    habitId={editingHabitId}
                    onDone={handleFormDone}
                    onCancel={pop}
                  />
                )}
              </>
            )}

            {activeTab === 'stats' && <StatsScreen />}

            {activeTab === 'settings' && (
              <SettingsScreen themeMode={themeMode} setThemeMode={setThemeMode} />
            )}
          </View>

          {/* شريط التبويبات يظهر فقط في الشاشة الرئيسية للقائمة (وليس أثناء التفاصيل/الفورم) */}
          {(activeTab !== 'home' || currentScreen === 'list') && (
            <BottomTabBar activeTab={activeTab} setActiveTab={handleTabChange} />
          )}
        </View>
      </DataProvider>
    </ThemeContext.Provider>
  );
}

/* =============================================================
 *  الأنماط العامة (StyleSheet)
 * ============================================================= */
const styles = StyleSheet.create({
  headerWrap: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 16,
    paddingBottom: 8,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  habitCard: {
    flexDirection: 'row-reverse',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  colorBar: {
    width: 6,
  },
  habitTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  rowBetween: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowCenter: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  flagWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  flagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSm: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  detailHeaderCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 6,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 10,
  },
  subtaskRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subtaskEditRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  bigCompleteBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
  },
  freezeBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    marginTop: 16,
    marginBottom: 6,
    textAlign: 'right',
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlign: 'right',
  },
  smallAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginLeft: 8,
    marginBottom: 8,
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 6,
    marginBottom: 6,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginLeft: 10,
    marginBottom: 10,
  },
  settingBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row-reverse',
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
