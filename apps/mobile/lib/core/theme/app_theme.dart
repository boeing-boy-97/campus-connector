import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// College branding model
class CollegeBranding {
  final Color primaryColor;
  final Color secondaryColor;
  final String? logoUrl;
  final String collegeName;

  const CollegeBranding({
    required this.primaryColor,
    required this.secondaryColor,
    this.logoUrl,
    required this.collegeName,
  });

  // Default Campus Connect branding before college is loaded
  static const CollegeBranding defaultBranding = CollegeBranding(
    primaryColor: Color(0xFF6C63FF),
    secondaryColor: Color(0xFFE91E63),
    collegeName: 'Campus Connect',
  );
}

class AppThemeData {
  final ThemeData light;
  final ThemeData dark;

  const AppThemeData({required this.light, required this.dark});
}

// Provider for college branding (updates after email verification)
final collegeBrandingProvider = StateProvider<CollegeBranding>(
  (ref) => CollegeBranding.defaultBranding,
);

// Provider for computed theme based on college branding
final appThemeProvider = Provider<AppThemeData>((ref) {
  final branding = ref.watch(collegeBrandingProvider);
  return _buildTheme(branding);
});

AppThemeData _buildTheme(CollegeBranding branding) {
  final textTheme = ThemeData(fontFamily: 'Inter').textTheme;

  final lightScheme = ColorScheme.fromSeed(
    seedColor: branding.primaryColor,
    brightness: Brightness.light,
    primary: branding.primaryColor,
    secondary: branding.secondaryColor,
    surface: const Color(0xFFF8F9FA),
    background: Colors.white,
  );

  final darkScheme = ColorScheme.fromSeed(
    seedColor: branding.primaryColor,
    brightness: Brightness.dark,
    primary: branding.primaryColor,
    secondary: branding.secondaryColor,
    surface: const Color(0xFF1E1E2E),
    background: const Color(0xFF12121F),
  );

  ThemeData buildThemeData(ColorScheme scheme) => ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: 'Inter',
    textTheme: textTheme,
    scaffoldBackgroundColor: scheme.background,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: scheme.onSurface,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        textStyle: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: scheme.primary,
        minimumSize: const Size.fromHeight(52),
        side: BorderSide(color: scheme.primary, width: 1.5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceVariant.withOpacity(0.5),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.outline.withOpacity(0.3)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.primary, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      labelStyle: TextStyle(color: scheme.onSurfaceVariant),
    ),
    cardTheme: CardTheme(
      color: scheme.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outline.withOpacity(0.1)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.primaryContainer,
      labelStyle: TextStyle(color: scheme.onPrimaryContainer, fontSize: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: scheme.surface,
      selectedItemColor: scheme.primary,
      unselectedItemColor: scheme.onSurfaceVariant,
      type: BottomNavigationBarType.fixed,
      elevation: 0,
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outline.withOpacity(0.15),
      thickness: 1,
    ),
  );

  return AppThemeData(
    light: buildThemeData(lightScheme),
    dark: buildThemeData(darkScheme),
  );
}
