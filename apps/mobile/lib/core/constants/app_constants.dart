// Campus Connect — App Constants

class AppConstants {
  AppConstants._();

  // ── App Info ──────────────────────────────────────────────────────────────
  static const String appName = 'Campus Connect';
  static const String appVersion = '1.0.0';
  static const String supportEmail = 'support@campusconnect.app';
  static const String privacyPolicyUrl = 'https://campusconnect.app/privacy';
  static const String termsUrl = 'https://campusconnect.app/terms';

  // ── Firebase Regions ──────────────────────────────────────────────────────
  static const String functionsRegion = 'asia-south1';

  // ── Durations ─────────────────────────────────────────────────────────────
  static const Duration otpExpiry = Duration(minutes: 10);
  static const Duration otpResendCooldown = Duration(seconds: 30);
  static const Duration snackBarDuration = Duration(seconds: 3);
  static const Duration pageTransitionDuration = Duration(milliseconds: 300);
  static const Duration cardSwipeAnimDuration = Duration(milliseconds: 250);
  static const Duration shimmerDuration = Duration(milliseconds: 1500);

  // ── Pagination ────────────────────────────────────────────────────────────
  static const int discoveryPageSize = 20;
  static const int matchesPageSize = 30;
  static const int messagesPageSize = 40;

  // ── Validation ────────────────────────────────────────────────────────────
  static const int minBioLength = 10;
  static const int maxBioLength = 500;
  static const int maxProfilePhotos = 6;
  static const int minProfilePhotos = 1;
  static const int maxInterests = 15;
  static const int minInterests = 1;
  // Must match CHAT_LIMITS.MAX_MESSAGE_LENGTH in shared/constants — the server
  // rejects anything longer, so a lower client cap silently truncated nothing
  // but a higher one produced avoidable validation errors.
  static const int maxMessageLength = 2000;
  static const int maxIntroMessageLength = 200;
  static const int maxMediaSizeMb = 25;
  static const int maxVerificationPhotoMb = 8;
  static const int minAge = 18;

  // ── Image constraints ─────────────────────────────────────────────────────
  static const int imageQuality = 85;
  static const double maxImageWidthPx = 1080;
  static const double maxImageHeightPx = 1440;

  // ── UI Sizes ──────────────────────────────────────────────────────────────
  static const double cardBorderRadius = 20.0;
  static const double avatarSizeLg = 80.0;
  static const double avatarSizeMd = 48.0;
  static const double avatarSizeSm = 36.0;
  static const double bottomNavHeight = 64.0;

  // ── College email domains ─────────────────────────────────────────────────
  static const List<String> validDomainSuffixes = [
    '.edu', '.edu.in', '.ac.in', '.ac.uk', '.edu.au',
  ];

  // ── Error messages ────────────────────────────────────────────────────────
  static const String genericError = 'Something went wrong. Please try again.';
  static const String networkError = 'Please check your internet connection.';
  static const String sessionExpired = 'Your session has expired. Please log in again.';
}

// ── Spacing scale ────────────────────────────────────────────────────────────
class AppSpacing {
  AppSpacing._();
  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 16.0;
  static const double lg = 24.0;
  static const double xl = 32.0;
  static const double xxl = 48.0;
}

// ── Asset paths ──────────────────────────────────────────────────────────────
class AppAssets {
  AppAssets._();
  static const String logoDefault = 'assets/logos/campus_connect_logo.png';
  static const String splashAnimation = 'assets/animations/splash.json';
  static const String matchAnimation = 'assets/animations/match.json';
  static const String emptyDiscovery = 'assets/animations/empty_discovery.json';
  static const String verificationPending = 'assets/animations/verification_pending.json';
  static const String successAnimation = 'assets/animations/success.json';
  static const String avatarPlaceholder = 'assets/images/avatar_placeholder.png';
}
