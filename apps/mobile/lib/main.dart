import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routes/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/services/notification_service.dart';

// Background message handler (must be top-level)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Handle background notification
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp();

  // Firebase App Check — prevents non-genuine clients
  await FirebaseAppCheck.instance.activate(
    androidProvider: AndroidProvider.playIntegrity,
    appleProvider: AppleProvider.deviceCheck,
  );

  // Background message handler
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  // Lock portrait orientation
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Status bar styling
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  runApp(
    const ProviderScope(
      child: CampusConnectApp(),
    ),
  );
}

class CampusConnectApp extends ConsumerWidget {
  const CampusConnectApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);
    final themeData = ref.watch(appThemeProvider);

    return MaterialApp.router(
      title: 'Campus Connect',
      debugShowCheckedModeBanner: false,
      theme: themeData.light,
      darkTheme: themeData.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
      builder: (context, child) {
        // Ensure text scaling doesn't break UI
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(
              MediaQuery.of(context).textScaler.scale(1.0).clamp(0.85, 1.15),
            ),
          ),
          child: child!,
        );
      },
    );
  }
}
