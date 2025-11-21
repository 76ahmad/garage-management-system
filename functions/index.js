// Firebase Cloud Functions for DRVN Notifications
// جميع أنواع الإشعارات - 8 أنواع

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// ==========================================
// دالة مساعدة: إرسال إشعار
// ==========================================

async function sendNotification(userId, title, body, data = {}) {
    try {
        // الحصول على FCM Token من المستخدم
        const userDoc = await admin.firestore()
            .collection('users')
            .doc(userId)
            .get();
        
        if (!userDoc.exists) {
            console.log('User not found:', userId);
            return null;
        }
        
        const userData = userDoc.data();
        const fcmToken = userData.fcmToken;
        
        // تحقق من تفعيل الإشعارات
        if (userData.notificationsDisabled === true) {
            console.log('Notifications disabled for user:', userId);
            return null;
        }
        
        if (!fcmToken) {
            console.log('No FCM token for user:', userId);
            return null;
        }
        
        // إنشاء رسالة الإشعار
        const message = {
            token: fcmToken,
            notification: {
                title: title,
                body: body
            },
            data: {
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                url: '/',
                timestamp: new Date().toISOString(),
                ...data
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'default',
                    sound: 'default',
                    priority: 'high',
                    icon: 'notification_icon',
                    color: '#f59e0b'
                }
            },
            webpush: {
                notification: {
                    icon: '/icon-192.png',
                    badge: '/icon-72.png',
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    tag: data.type || 'default'
                },
                fcmOptions: {
                    link: '/'
                }
            }
        };
        
        // إرسال الإشعار
        const response = await admin.messaging().send(message);
        console.log('✅ Notification sent successfully:', response);
        
        // حفظ سجل الإشعار في Firestore
        await admin.firestore()
            .collection('notifications')
            .add({
                userId: userId,
                title: title,
                body: body,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                type: data.type || 'general',
                data: data
            });
        
        return response;
        
    } catch (error) {
        console.error('❌ Error sending notification:', error);
        
        // إذا التوكن غير صالح، احذفه
        if (error.code === 'messaging/invalid-registration-token' ||
            error.code === 'messaging/registration-token-not-registered') {
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .update({ 
                    fcmToken: null,
                    fcmTokenInvalidated: admin.firestore.FieldValue.serverTimestamp()
                });
        }
        
        return null;
    }
}

// ==========================================
// 1️⃣ إشعارات المواعيد القادمة (كل ساعة)
// ==========================================

exports.checkUpcomingAppointments = functions.pubsub
    .schedule('every 1 hours')
    .timeZone('Asia/Jerusalem')
    .onRun(async (context) => {
        console.log('🔍 Checking upcoming appointments...');
        
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
        
        // جلب المواعيد القادمة في الساعة القادمة
        const appointmentsSnapshot = await admin.firestore()
            .collection('appointments')
            .where('date', '>=', now)
            .where('date', '<=', oneHourLater)
            .where('notificationSent', '!=', true)
            .get();
        
        console.log(`📅 Found ${appointmentsSnapshot.size} upcoming appointments`);
        
        // إرسال إشعار لكل موعد
        const promises = appointmentsSnapshot.docs.map(async (doc) => {
            const appointment = doc.data();
            const appointmentId = doc.id;
            
            // الحصول على معلومات السيارة
            const carDoc = await admin.firestore()
                .collection('cars')
                .doc(appointment.carId)
                .get();
            
            if (!carDoc.exists) return;
            
            const car = carDoc.data();
            const carInfo = `${car.manufacturer} ${car.model} (${car.licensePlate})`;
            
            // إرسال الإشعار
            await sendNotification(
                appointment.userId || car.userId,
                '⏰ תזכורת: פגישה בעוד שעה',
                `פגישה עם ${carInfo} בשעה ${appointment.time}`,
                {
                    type: 'appointment_reminder',
                    appointmentId: appointmentId,
                    carId: appointment.carId
                }
            );
            
            // تحديث أن الإشعار تم إرساله
            await doc.ref.update({
                notificationSent: true,
                notificationSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await Promise.all(promises);
        
        console.log('✅ Appointment notifications sent');
        return null;
    });

// ==========================================
// 2️⃣ إشعار عند تغيير حالة السيارة
// ==========================================

exports.onCarStatusChange = functions.firestore
    .document('cars/{carId}')
    .onUpdate(async (change, context) => {
        const carId = context.params.carId;
        const oldData = change.before.data();
        const newData = change.after.data();
        
        // تحقق إذا الحالة تغيرت
        if (oldData.status === newData.status) {
            return null;
        }
        
        console.log(`🚗 Car status changed: ${oldData.status} → ${newData.status}`);
        
        // رسائل الإشعارات حسب الحالة
        const statusMessages = {
            'waiting': {
                icon: '⏳',
                title: 'הרכב ממתין',
                body: 'הרכב שלך ממתין לטיפול'
            },
            'in-progress': {
                icon: '🔧',
                title: 'הטיפול ברכב החל',
                body: 'אנחנו עובדים על הרכב שלך'
            },
            'done': {
                icon: '✅',
                title: 'הטיפול ברכב הושלם',
                body: 'הרכב שלך מוכן לאיסוף!'
            },
            'delivered': {
                icon: '🎉',
                title: 'הרכב נמסר',
                body: 'תודה שבחרת בנו!'
            }
        };
        
        const statusInfo = statusMessages[newData.status] || {
            icon: '📝',
            title: 'עדכון סטטוס רכב',
            body: `הסטטוס שונה ל: ${newData.status}`
        };
        
        const carInfo = `${newData.manufacturer} ${newData.model} (${newData.licensePlate})`;
        const title = `${statusInfo.icon} ${statusInfo.title}`;
        const body = `${carInfo} - ${statusInfo.body}`;
        
        // إرسال الإشعار
        await sendNotification(
            newData.userId,
            title,
            body,
            {
                type: 'car_status_change',
                carId: carId,
                oldStatus: oldData.status,
                newStatus: newData.status
            }
        );
        
        return null;
    });

// ==========================================
// 3️⃣ فحص الفواتير غير المدفوعة (يومياً)
// ==========================================

exports.checkUnpaidInvoices = functions.pubsub
    .schedule('every day 09:00')
    .timeZone('Asia/Jerusalem')
    .onRun(async (context) => {
        console.log('💰 Checking unpaid invoices...');
        
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        // جلب السيارات مع فواتير غير مدفوعة
        const carsSnapshot = await admin.firestore()
            .collection('cars')
            .where('paymentStatus', '==', 'unpaid')
            .where('updatedAt', '<=', admin.firestore.Timestamp.fromDate(threeDaysAgo))
            .get();
        
        console.log(`💳 Found ${carsSnapshot.size} unpaid invoices`);
        
        // إرسال تذكير لكل فاتورة
        const promises = carsSnapshot.docs.map(async (doc) => {
            const car = doc.data();
            const carId = doc.id;
            
            const carInfo = `${car.manufacturer} ${car.model} (${car.licensePlate})`;
            
            await sendNotification(
                car.userId,
                '💰 תזכורת: חשבונית ממתינה',
                `חשבונית עבור ${carInfo} ממתינה לתשלום`,
                {
                    type: 'unpaid_invoice',
                    carId: carId,
                    amount: car.totalCost || 0
                }
            );
        });
        
        await Promise.all(promises);
        
        console.log('✅ Unpaid invoice reminders sent');
        return null;
    });

// ==========================================
// 4️⃣ إشعار ترحيبي عند تسجيل مستخدم جديد
// ==========================================

exports.onNewUserSignup = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
        const userId = context.params.userId;
        const userData = snap.data();
        
        console.log('👋 New user signed up:', userId, userData.email);
        
        // انتظر 3 ثواني للتأكد أن FCM Token تم حفظه
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // إرسال إشعار ترحيبي
        await sendNotification(
            userId,
            '👋 ברוך הבא ל-DRVN!',
            'תודה על ההצטרפות. אנחנו כאן לעזור לך לנהל את המוסך שלך בצורה מקצועית ויעילה',
            {
                type: 'welcome'
            }
        );
        
        return null;
    });

// ==========================================
// 5️⃣ إرسال إشعار يدوي (من Admin Panel)
// ==========================================

exports.sendManualNotification = functions.https.onCall(async (data, context) => {
    // التحقق من تسجيل الدخول
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated'
        );
    }
    
    const { userId, title, body, extraData } = data;
    
    if (!userId || !title || !body) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: userId, title, body'
        );
    }
    
    const result = await sendNotification(
        userId, 
        title, 
        body, 
        { 
            type: 'manual',
            sentBy: context.auth.uid,
            ...extraData 
        }
    );
    
    if (result) {
        return { success: true, messageId: result };
    } else {
        throw new functions.https.HttpsError(
            'internal',
            'Failed to send notification'
        );
    }
});

// ==========================================
// 6️⃣ تذكير بصيانة دورية (شهرياً)
// ==========================================

exports.checkMaintenanceReminders = functions.pubsub
    .schedule('every day 10:00')
    .timeZone('Asia/Jerusalem')
    .onRun(async (context) => {
        console.log('🔧 Checking maintenance reminders...');
        
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        
        // جلب السيارات التي لم تُجرى لها صيانة منذ شهر
        const carsSnapshot = await admin.firestore()
            .collection('cars')
            .where('lastMaintenanceDate', '<=', admin.firestore.Timestamp.fromDate(oneMonthAgo))
            .get();
        
        console.log(`🔧 Found ${carsSnapshot.size} cars needing maintenance`);
        
        const promises = carsSnapshot.docs.map(async (doc) => {
            const car = doc.data();
            const carId = doc.id;
            
            // تحقق إذا تم إرسال تذكير مؤخراً
            const lastReminder = car.lastMaintenanceReminder?.toDate();
            if (lastReminder) {
                const daysSinceReminder = (new Date() - lastReminder) / (1000 * 60 * 60 * 24);
                if (daysSinceReminder < 7) {
                    return; // لا ترسل تذكير إذا تم إرسال واحد في آخر 7 أيام
                }
            }
            
            const carInfo = `${car.manufacturer} ${car.model} (${car.licensePlate})`;
            
            await sendNotification(
                car.userId,
                '🔧 הגיע הזמן לטיפול תקופתי',
                `${carInfo} - לא בוצע טיפול מזה חודש. מומלץ לתאם פגישה`,
                {
                    type: 'maintenance_reminder',
                    carId: carId
                }
            );
            
            // تحديث تاريخ آخر تذكير
            await doc.ref.update({
                lastMaintenanceReminder: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await Promise.all(promises);
        
        console.log('✅ Maintenance reminders sent');
        return null;
    });

// ==========================================
// 7️⃣ تذكير بانتهاء صلاحية الاشتراك
// ==========================================

exports.checkSubscriptionExpiry = functions.pubsub
    .schedule('every day 08:00')
    .timeZone('Asia/Jerusalem')
    .onRun(async (context) => {
        console.log('⚠️ Checking subscription expiry...');
        
        const now = new Date();
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
        
        const threeDaysLater = new Date();
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
        
        // جلب المستخدمين الذين ينتهي اشتراكهم قريباً
        const usersSnapshot = await admin.firestore()
            .collection('users')
            .where('subscriptionEndDate', '<=', admin.firestore.Timestamp.fromDate(sevenDaysLater))
            .get();
        
        console.log(`⏰ Found ${usersSnapshot.size} users with expiring subscriptions`);
        
        const promises = usersSnapshot.docs.map(async (doc) => {
            const user = doc.data();
            const userId = doc.id;
            
            const endDate = user.subscriptionEndDate.toDate();
            const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
            
            let title, body, reminderType;
            
            if (daysLeft <= 0) {
                // انتهى الاشتراك
                title = '❌ המנוי פג תוקף';
                body = 'המנוי שלך פג תוקף. חדש אותו כדי להמשיך להשתמש במערכת';
                reminderType = 'expired';
            } else if (daysLeft <= 1) {
                // يوم واحد متبقي
                title = '⚠️ המנוי מסתיים מחר!';
                body = 'המנוי שלך מסתיים מחר. חדש אותו עכשיו';
                reminderType = '1_day';
            } else if (daysLeft <= 3) {
                // 3 أيام متبقية
                title = '⚠️ המנוי מסתיים בעוד 3 ימים';
                body = `המנוי שלך מסתיים בעוד ${daysLeft} ימים. חדש אותו כדי להמשיך`;
                reminderType = '3_days';
            } else if (daysLeft <= 7) {
                // 7 أيام متبقية
                title = '⏰ המנוי מסתיים בעוד שבוע';
                body = `המנוי שלך מסתיים בעוד ${daysLeft} ימים. אל תשכח לחדש`;
                reminderType = '7_days';
            } else {
                return; // لا ترسل إشعار
            }
            
            // تحقق إذا تم إرسال هذا النوع من التذكير
            const lastReminder = user[`subscriptionReminder_${reminderType}`];
            if (lastReminder) {
                return; // تم إرسال هذا التذكير من قبل
            }
            
            await sendNotification(
                userId,
                title,
                body,
                {
                    type: 'subscription_expiry',
                    daysLeft: daysLeft,
                    reminderType: reminderType
                }
            );
            
            // تحديث أن التذكير تم إرساله
            await doc.ref.update({
                [`subscriptionReminder_${reminderType}`]: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await Promise.all(promises);
        
        console.log('✅ Subscription expiry reminders sent');
        return null;
    });

// ==========================================
// 8️⃣ إشعار عند إضافة سيارة جديدة
// ==========================================

exports.onNewCarAdded = functions.firestore
    .document('cars/{carId}')
    .onCreate(async (snap, context) => {
        const carId = context.params.carId;
        const car = snap.data();
        
        console.log('🆕 New car added:', carId);
        
        const carInfo = `${car.manufacturer} ${car.model} (${car.licensePlate})`;
        
        // إرسال إشعار تأكيد
        await sendNotification(
            car.userId,
            '✅ רכב נוסף בהצלחה',
            `${carInfo} נוסף למערכת שלך`,
            {
                type: 'new_car',
                carId: carId
            }
        );
        
        return null;
    });

// ==========================================
// 🆕 إضافي: إشعار عند حذف موعد
// ==========================================

exports.onAppointmentCancelled = functions.firestore
    .document('appointments/{appointmentId}')
    .onDelete(async (snap, context) => {
        const appointment = snap.data();
        
        // الحصول على معلومات السيارة
        const carDoc = await admin.firestore()
            .collection('cars')
            .doc(appointment.carId)
            .get();
        
        if (!carDoc.exists) return null;
        
        const car = carDoc.data();
        const carInfo = `${car.manufacturer} ${car.model}`;
        
        await sendNotification(
            appointment.userId || car.userId,
            '❌ פגישה בוטלה',
            `הפגישה עבור ${carInfo} בוטלה`,
            {
                type: 'appointment_cancelled',
                carId: appointment.carId
            }
        );
        
        return null;
    });

// ==========================================
// 🆕 إضافي: إحصائيات الإشعارات
// ==========================================

exports.getNotificationStats = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const userId = data.userId || context.auth.uid;
    
    const notificationsSnapshot = await admin.firestore()
        .collection('notifications')
        .where('userId', '==', userId)
        .orderBy('sentAt', 'desc')
        .limit(50)
        .get();
    
    const notifications = notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        sentAt: doc.data().sentAt?.toDate()?.toISOString()
    }));
    
    const stats = {
        total: notifications.length,
        unread: notifications.filter(n => !n.read).length,
        byType: {}
    };
    
    notifications.forEach(n => {
        stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
    });
    
    return {
        notifications: notifications,
        stats: stats
    };
});

// ==========================================
// 🆕 إضافي: تعليم الإشعار كمقروء
// ==========================================

exports.markNotificationAsRead = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    
    const { notificationId } = data;
    
    if (!notificationId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing notificationId');
    }
    
    await admin.firestore()
        .collection('notifications')
        .doc(notificationId)
        .update({
            read: true,
            readAt: admin.firestore.FieldValue.serverTimestamp()
        });
    
    return { success: true };
});