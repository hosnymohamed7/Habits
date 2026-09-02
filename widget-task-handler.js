/**
 * =============================================================
 *  widget-task-handler.js
 *  معالج ويدجت الشاشة الرئيسية لتطبيق "خُطوة" على أندرويد
 * =============================================================
 * هذا الملف مسؤول عن:
 *  1) رسم واجهة الويدجت (عرض اسم العادة + مهامها الفرعية + السلسلة).
 *  2) التعامل مع ضغطات المستخدم على الويدجت (تأشير مهمة/عادة كمكتملة).
 *  3) قراءة وتحديث البيانات مباشرة من AsyncStorage لتبقى متزامنة مع التطبيق.
 *
 * ملاحظة مهمة: هذا الملف لا يعمل داخل Expo Go أو Snack، فهو يحتاج
 * "Development Build" أو APK مبني فعلياً (EAS Build) لأنه يعتمد على
 * كود Native حقيقي توفره مكتبة react-native-android-widget.
 *
 * طريقة الربط في index.js (بعد إزالة التسجيل الافتراضي لـ App):
 *
 *   import { registerWidgetTaskHandler } from 'react-native-android-widget';
 *   import { widgetTaskHandler } from './widget-task-handler';
 *   registerWidgetTaskHandler(widgetTaskHandler);
 *
 * ويُذكر اسم الويدجت "HabitWidget" أيضاً داخل app.json ضمن
 * إعدادات plugin الخاصة بـ react-native-android-widget (راجع ملف
 * app.json وقسم android/widgets في التوثيق الرسمي للمكتبة).
 */

import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WIDGET_DATA_KEY = '@khatwa_widget_data';
const LOGS_KEY = '@khatwa_logs_v1';

// تنسيق التاريخ الحالي كمفتاح YYYY-MM-DD (نفس الدالة المستخدمة في App.js)
function formatDateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * مكوّن رسم الويدجت لعادة واحدة (Single Habit Widget)
 * يستقبل بيانات العادة ويعرض: العنوان، السلسلة، وقائمة المهام الفرعية القابلة للضغط
 */
function HabitWidgetView({ habit, clickActionData }) {
  if (!habit) {
    return (
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: '#151E2E',
          borderRadius: 16,
          padding: 12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <TextWidget text="افتح التطبيق واختر عادة للويدجت" style={{ color: '#94A3B8', fontSize: 12 }} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#151E2E',
        borderRadius: 16,
        padding: 12,
        flexDirection: 'column',
      }}
    >
      {/* رأس الويدجت: اسم العادة + السلسلة */}
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget
          text={habit.title}
          style={{ color: '#F1F5F9', fontSize: 15, fontWeight: 'bold' }}
        />
        <TextWidget text={`🔥 ${habit.streak}`} style={{ color: '#FDCB6E', fontSize: 13 }} />
      </FlexWidget>

      {/* قائمة المهام الفرعية (حتى 4 عناصر لضيق مساحة الويدجت) */}
      <FlexWidget style={{ flexDirection: 'column', marginTop: 8 }}>
        {(habit.subtasks || []).slice(0, 4).map((s) => {
          const done = (habit.doneSubtasks || []).includes(s.id);
          return (
            <FlexWidget
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 6,
                width: 'match_parent',
              }}
              clickAction="TOGGLE_SUBTASK"
              clickActionData={{ habitId: habit.id, subtaskId: s.id }}
            >
              <TextWidget
                text={done ? '✅' : '⬜'}
                style={{ fontSize: 14, marginEnd: 6 }}
              />
              <TextWidget
                text={s.title}
                style={{ color: done ? '#64748B' : '#E2E8F0', fontSize: 12 }}
                maxLines={1}
              />
            </FlexWidget>
          );
        })}

        {/* في حال عدم وجود مهام فرعية: زر تأشير مباشر للعادة كاملة */}
        {(!habit.subtasks || habit.subtasks.length === 0) && (
          <FlexWidget
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: habit.completed ? habit.color : '#1C2B41',
              borderRadius: 10,
              padding: 8,
              marginTop: 4,
            }}
            clickAction="TOGGLE_HABIT"
            clickActionData={{ habitId: habit.id }}
          >
            <TextWidget
              text={habit.completed ? '✓ تم الإنجاز' : 'تأشير كمكتمل'}
              style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}
            />
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

/**
 * معالج المهام الرئيسي للويدجت — يُستدعى من النظام تلقائياً عند:
 *  - إضافة الويدجت لأول مرة (WIDGET_ADDED)
 *  - طلب تحديث دوري (WIDGET_UPDATE)
 *  - إعادة تغيير حجمه (WIDGET_RESIZED)
 *  - حذفه (WIDGET_DELETED)
 *  - أو عند ضغط المستخدم على عنصر بداخله (WIDGET_CLICK)
 */
export async function widgetTaskHandler(props) {
  const widgetInfo = props.widgetInfo;

  // نحدد أي عادة مرتبطة بهذه النسخة من الويدجت (يمكن حفظ الربط حسب widgetId لدعم عدة ويدجت)
  const savedData = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  const allHabitsData = savedData ? JSON.parse(savedData) : [];

  // نحاول قراءة معرف العادة المرتبطة بهذا الويدجت تحديداً (يُحفظ عند إضافته من التطبيق)
  const widgetHabitMapRaw = await AsyncStorage.getItem('@khatwa_widget_habit_map');
  const widgetHabitMap = widgetHabitMapRaw ? JSON.parse(widgetHabitMapRaw) : {};
  const linkedHabitId = widgetHabitMap[widgetInfo.widgetId];

  const habit =
    allHabitsData.find((h) => h.id === linkedHabitId) || allHabitsData[0] || null;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<HabitWidgetView habit={habit} />);
      break;

    case 'WIDGET_DELETED':
      // تنظيف الربط عند حذف الويدجت
      delete widgetHabitMap[widgetInfo.widgetId];
      await AsyncStorage.setItem('@khatwa_widget_habit_map', JSON.stringify(widgetHabitMap));
      break;

    case 'WIDGET_CLICK': {
      const action = props.clickAction;
      const dateKey = formatDateKey();

      // نقرأ السجلات الحالية لتحديثها مباشرة
      const rawLogs = await AsyncStorage.getItem(LOGS_KEY);
      const logs = rawLogs ? JSON.parse(rawLogs) : {};

      if (action === 'TOGGLE_SUBTASK') {
        const { habitId, subtaskId } = props.clickActionData;
        const habitLogs = logs[habitId] || {};
        const current = habitLogs[dateKey] || { doneSubtasks: [], count: 0, minutes: 0, completed: false };
        const already = current.doneSubtasks.includes(subtaskId);
        const nextDone = already
          ? current.doneSubtasks.filter((id) => id !== subtaskId)
          : [...current.doneSubtasks, subtaskId];

        const targetHabit = allHabitsData.find((h) => h.id === habitId);
        const allDone =
          targetHabit && targetHabit.subtasks.length > 0 && nextDone.length === targetHabit.subtasks.length;

        habitLogs[dateKey] = { ...current, doneSubtasks: nextDone, completed: allDone };
        logs[habitId] = habitLogs;
        await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));

        // تحديث نسخة بيانات الويدجت المصغرة أيضاً حتى يعكس الرسم القادم التغيير فوراً
        const updatedWidgetData = allHabitsData.map((h) =>
          h.id === habitId ? { ...h, doneSubtasks: nextDone, completed: allDone } : h
        );
        await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(updatedWidgetData));

        const updatedHabit = updatedWidgetData.find((h) => h.id === habitId);
        props.renderWidget(<HabitWidgetView habit={updatedHabit} />);
      }

      if (action === 'TOGGLE_HABIT') {
        const { habitId } = props.clickActionData;
        const habitLogs = logs[habitId] || {};
        const current = habitLogs[dateKey] || { doneSubtasks: [], count: 0, minutes: 0, completed: false };
        habitLogs[dateKey] = { ...current, completed: !current.completed };
        logs[habitId] = habitLogs;
        await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));

        const updatedWidgetData = allHabitsData.map((h) =>
          h.id === habitId ? { ...h, completed: !h.completed } : h
        );
        await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(updatedWidgetData));

        const updatedHabit = updatedWidgetData.find((h) => h.id === habitId);
        props.renderWidget(<HabitWidgetView habit={updatedHabit} />);
      }
      break;
    }

    default:
      break;
  }
}
