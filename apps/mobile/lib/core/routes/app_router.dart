import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../features/auth/screens/login_screen.dart';
import '../../features/discovery/screens/discovery_screen.dart';
import '../../features/chat/screens/matches_screen.dart';

// Route name constants
class AppRoutes {
  static const splash = '/';
  static const login = '/login';
  static const otpVerify = '/otp-verify';
  static const onboarding = '/onboarding';
  static const profileSetup = '/profile-setup';
  static const photoVerification = '/photo-verification';
  static const verificationPending = '/verification-pending';
  static const home = '/home';
  static const discovery = '/discovery';
  static const matches = '/matches';
  static const chat = '/chat';
  static const profile = '/profile';
  static const editProfile = '/edit-profile';
  static const settings = '/settings';
  static const deleteAccount = '/delete-account';
  static const reportUser = '/report';
  static const notifications = '/notifications';
  static const userProfile = '/user/:id';
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = FirebaseAuth.instance;

  return GoRouter(
    initialLocation: AppRoutes.splash,
    debugLogDiagnostics: false,
    redirect: (context, state) async {
      final user = auth.currentUser;
      final isLoggedIn = user != null;
      final location = state.uri.toString();

      final authRoutes = [AppRoutes.login, AppRoutes.otpVerify];
      final isOnAuthRoute = authRoutes.contains(location);

      if (!isLoggedIn && !isOnAuthRoute && location != AppRoutes.splash) {
        return AppRoutes.login;
      }

      return null;
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (ctx, state) => const SplashScreen(),
      ),
      GoRoute(path: AppRoutes.login, builder: (ctx, state) => const LoginScreen()),
      GoRoute(
        path: AppRoutes.onboarding,
        builder: (ctx, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: AppRoutes.profileSetup,
        builder: (ctx, state) => const ProfileSetupScreen(),
      ),
      GoRoute(
        path: AppRoutes.photoVerification,
        builder: (ctx, state) => const PhotoVerificationScreen(),
      ),
      GoRoute(
        path: AppRoutes.verificationPending,
        builder: (ctx, state) => const VerificationPendingScreen(),
      ),
      ShellRoute(
        builder: (ctx, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: AppRoutes.home,
            builder: (ctx, state) => const DiscoveryScreen(),
          ),
          GoRoute(
            path: AppRoutes.matches,
            builder: (ctx, state) => const MatchesScreen(),
          ),
          GoRoute(
            path: AppRoutes.profile,
            builder: (ctx, state) => const MyProfileScreen(),
          ),
          GoRoute(
            path: AppRoutes.notifications,
            builder: (ctx, state) => const NotificationsScreen(),
          ),
        ],
      ),
      GoRoute(
        path: AppRoutes.chat,
        builder: (ctx, state) {
          final matchId = state.uri.queryParameters['match_id'] ?? '';
          return ChatScreen(matchId: matchId);
        },
      ),
      GoRoute(
        path: AppRoutes.userProfile,
        builder: (ctx, state) {
          final userId = state.pathParameters['id'] ?? '';
          return UserProfileScreen(userId: userId);
        },
      ),
      GoRoute(
        path: AppRoutes.editProfile,
        builder: (ctx, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.settings,
        builder: (ctx, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: AppRoutes.deleteAccount,
        builder: (ctx, state) => const DeleteAccountScreen(),
      ),
      GoRoute(
        path: AppRoutes.reportUser,
        builder: (ctx, state) {
          final userId = state.uri.queryParameters['user_id'] ?? '';
          return ReportUserScreen(userId: userId);
        },
      ),
    ],
    errorBuilder: (ctx, state) => Scaffold(
      body: Center(
        child: Text('Page not found: ${state.uri}'),
      ),
    ),
  );
});

// ── Placeholder screen references (implemented in features/) ────────────────
// These allow the router to compile; actual screens are in features/
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(child: CircularProgressIndicator()),
  );
}


class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class ProfileSetupScreen extends StatelessWidget {
  const ProfileSetupScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class PhotoVerificationScreen extends StatelessWidget {
  const PhotoVerificationScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class VerificationPendingScreen extends StatelessWidget {
  const VerificationPendingScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}


class MyProfileScreen extends StatelessWidget {
  const MyProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class ChatScreen extends StatelessWidget {
  final String matchId;
  const ChatScreen({super.key, required this.matchId});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class UserProfileScreen extends StatelessWidget {
  final String userId;
  const UserProfileScreen({super.key, required this.userId});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class EditProfileScreen extends StatelessWidget {
  const EditProfileScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class DeleteAccountScreen extends StatelessWidget {
  const DeleteAccountScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class ReportUserScreen extends StatelessWidget {
  final String userId;
  const ReportUserScreen({super.key, required this.userId});
  @override
  Widget build(BuildContext context) => const Scaffold(body: SizedBox());
}

class MainShell extends StatelessWidget {
  final Widget child;
  const MainShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        destinations: const [
          NavigationDestination(icon: Icon(Icons.explore_outlined), selectedIcon: Icon(Icons.explore), label: 'Discover'),
          NavigationDestination(icon: Icon(Icons.favorite_border), selectedIcon: Icon(Icons.favorite), label: 'Matches'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
