import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'firebase_service.dart';

/// Handles FCM setup, permission requests, token management,
/// foreground notifications, and tap routing.
class NotificationService {
  static final _messaging = FirebaseMessaging.instance;
  static final _localNotifications = FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'campus_connect_default',
    'Campus Connect',
    description: 'Match requests, messages, and important updates',
    importance: Importance.high,
    playSound: true,
    enableVibration: true,
  );

  /// Initialize notification system — call in main() after Firebase init.
  static Future<void> initialize({
    required GlobalKey<NavigatorState> navigatorKey,
  }) async {
    // Request permissions (iOS and Android 13+)
    await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    // Create Android notification channel
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);

    // Initialize local notifications
    await _localNotifications.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        _handleNotificationTap(response.payload, navigatorKey);
      },
    );

    // Foreground notifications
    FirebaseMessaging.onMessage.listen((message) {
      _showLocalNotification(message);
    });

    // App opened from background notification tap
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      _handleMessageNavigation(message, navigatorKey);
    });

    // App launched from terminated state via notification
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      // Delay until nav is ready
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _handleMessageNavigation(initialMessage, navigatorKey);
      });
    }
  }

  /// Returns the current FCM token for this device.
  static Future<String?> getToken() async {
    return _messaging.getToken();
  }

  /// Listen for token refreshes.
  static Stream<String> get onTokenRefresh => _messaging.onTokenRefresh;

  /// Registers this device's FCM token against the signed-in profile, and keeps
  /// it current when FCM rotates it.
  ///
  /// Nothing previously persisted the token, so `fcm_token` stayed null on every
  /// student document and the backend could never deliver a push — every
  /// notification existed only as an in-app record.
  static StreamSubscription<String>? _tokenSubscription;

  static Future<void> registerToken() async {
    if (FirebaseAuth.instance.currentUser == null) return;

    try {
      final token = await _messaging.getToken();
      if (token != null && token.isNotEmpty) {
        await FirebaseService.updateFcmToken(token);
      }
    } catch (error) {
      // A token that cannot be stored only costs push delivery; the in-app
      // notification record is still written server-side.
      debugPrint('FCM token registration failed: $error');
    }

    await _tokenSubscription?.cancel();
    _tokenSubscription = _messaging.onTokenRefresh.listen((token) async {
      if (FirebaseAuth.instance.currentUser == null) return;
      try {
        await FirebaseService.updateFcmToken(token);
      } catch (error) {
        debugPrint('FCM token refresh failed: $error');
      }
    });
  }

  /// Stops token syncing and clears the stored token on sign-out, so the device
  /// no longer receives notifications for the previous account.
  static Future<void> unregisterToken() async {
    await _tokenSubscription?.cancel();
    _tokenSubscription = null;
    try {
      await _messaging.deleteToken();
    } catch (error) {
      debugPrint('FCM token deletion failed: $error');
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  static void _showLocalNotification(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: _encodePayload(message.data),
    );
  }

  static void _handleNotificationTap(String? payload, GlobalKey<NavigatorState> key) {
    if (payload == null || key.currentContext == null) return;
    final data = _decodePayload(payload);
    _navigate(data, key);
  }

  static void _handleMessageNavigation(RemoteMessage message, GlobalKey<NavigatorState> key) {
    if (key.currentContext == null) return;
    _navigate(message.data, key);
  }

  static void _navigate(Map<String, dynamic> data, GlobalKey<NavigatorState> key) {
    final ctx = key.currentContext;
    if (ctx == null) return;

    final type = data['type'] as String?;
    final matchId = data['match_id'] as String?;
    final requestId = data['request_id'] as String?;

    switch (type) {
      case 'new_message':
        if (matchId != null) ctx.push('/chat?match_id=$matchId');
        break;
      case 'new_match':
        if (matchId != null) ctx.push('/chat?match_id=$matchId');
        break;
      case 'connect_request':
        ctx.push('/matches');
        break;
      case 'verification_approved':
      case 'verification_rejected':
        ctx.push('/notifications');
        break;
    }
  }

  static String _encodePayload(Map<String, dynamic> data) {
    return data.entries.map((e) => '${e.key}=${e.value}').join('&');
  }

  static Map<String, dynamic> _decodePayload(String payload) {
    return Map.fromEntries(
      payload.split('&').map((p) {
        final parts = p.split('=');
        return MapEntry(parts[0], parts.length > 1 ? parts[1] : '');
      }),
    );
  }
}

final notificationServiceProvider = Provider<NotificationService>((_) => NotificationService());
