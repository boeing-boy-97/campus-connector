import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cloud_functions/cloud_functions.dart';
import '../../../core/constants/app_constants.dart';
import '../../../core/services/firebase_service.dart';
import '../../../core/theme/app_theme.dart';

// ─── State ────────────────────────────────────────────────────────────────────

enum LoginStep { emailInput, otpInput }

class LoginState {
  final LoginStep step;
  final String email;
  final String maskedEmail;
  final String? collegeName;
  final String? collegeShortName;
  final bool isLoading;
  final String? error;
  final int resendCooldown;
  final bool consentGiven;

  const LoginState({
    this.step = LoginStep.emailInput,
    this.email = '',
    this.maskedEmail = '',
    this.collegeName,
    this.collegeShortName,
    this.isLoading = false,
    this.error,
    this.resendCooldown = 0,
    this.consentGiven = false,
  });

  LoginState copyWith({
    LoginStep? step,
    String? email,
    String? maskedEmail,
    String? collegeName,
    String? collegeShortName,
    bool? isLoading,
    String? error,
    int? resendCooldown,
    bool? consentGiven,
  }) => LoginState(
    step: step ?? this.step,
    email: email ?? this.email,
    maskedEmail: maskedEmail ?? this.maskedEmail,
    collegeName: collegeName ?? this.collegeName,
    collegeShortName: collegeShortName ?? this.collegeShortName,
    isLoading: isLoading ?? this.isLoading,
    error: error,
    resendCooldown: resendCooldown ?? this.resendCooldown,
    consentGiven: consentGiven ?? this.consentGiven,
  );
}

class LoginNotifier extends StateNotifier<LoginState> {
  LoginNotifier() : super(const LoginState());

  Timer? _resendTimer;

  Future<void> sendOtp(String email) async {
    if (!state.consentGiven) {
      state = state.copyWith(error: 'Please accept the Terms of Service to continue.');
      return;
    }

    state = state.copyWith(isLoading: true, error: null);

    try {
      // Routed through FirebaseService so the required consent fields cannot
      // drift from the schema again. Looking the college up separately keeps the
      // OTP response identical for registered and unregistered domains, so the
      // endpoint cannot be used to enumerate which colleges are on the platform.
      final normalised = email.trim().toLowerCase();
      final data = await FirebaseService.sendOtp(normalised);

      Map<String, dynamic>? college;
      try {
        final lookup = await FirebaseService.checkEmailDomain(normalised);
        if (lookup['is_registered'] == true && lookup['college'] is Map) {
          college = Map<String, dynamic>.from(lookup['college'] as Map);
        }
      } catch (_) {
        // Branding is decorative; never block sign-in on it.
      }

      state = state.copyWith(
        step: LoginStep.otpInput,
        email: normalised,
        maskedEmail: data['masked_email'] as String? ?? normalised,
        collegeName: college?['name'] as String?,
        collegeShortName: college?['short_name'] as String?,
        isLoading: false,
      );
      _startResendTimer();
    } on FirebaseFunctionsException catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.message ?? AppConstants.genericError,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false, error: AppConstants.genericError);
    }
  }

  Future<bool> verifyOtp(String otp) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      // verifyOtp signs in with the returned custom token and refreshes claims.
      final data = await FirebaseService.verifyOtp(state.email, otp);
      state = state.copyWith(isLoading: false);
      return data['has_profile'] == true;
    } on FirebaseFunctionsException catch (e) {
      state = state.copyWith(isLoading: false, error: e.message ?? AppConstants.genericError);
      return false;
    } catch (_) {
      state = state.copyWith(isLoading: false, error: AppConstants.genericError);
      return false;
    }
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    state = state.copyWith(resendCooldown: 30);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (state.resendCooldown <= 1) {
        timer.cancel();
        state = state.copyWith(resendCooldown: 0);
      } else {
        state = state.copyWith(resendCooldown: state.resendCooldown - 1);
      }
    });
  }

  void setConsent(bool value) => state = state.copyWith(consentGiven: value);

  void goBackToEmail() {
    _resendTimer?.cancel();
    state = state.copyWith(step: LoginStep.emailInput, error: null, resendCooldown: 0);
  }

  void clearError() => state = state.copyWith(error: null);

  @override
  void dispose() {
    _resendTimer?.cancel();
    super.dispose();
  }
}

final loginProvider = StateNotifierProvider.autoDispose<LoginNotifier, LoginState>(
  (ref) => LoginNotifier(),
);

// ─── Screen ───────────────────────────────────────────────────────────────────

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen>
    with TickerProviderStateMixin {
  final _emailController = TextEditingController();
  final _emailFocus = FocusNode();
  late final AnimationController _fadeCtrl;
  late final Animation<double> _fadeAnim;

  @override
  void initState() {
    super.initState();
    _fadeCtrl = AnimationController(duration: const Duration(milliseconds: 600), vsync: this);
    _fadeAnim = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);
    _fadeCtrl.forward();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _emailFocus.dispose();
    _fadeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(loginProvider);
    final notifier = ref.read(loginProvider.notifier);
    final theme = Theme.of(context);
    final branding = ref.watch(collegeBrandingProvider);

    return Scaffold(
      body: FadeTransition(
        opacity: _fadeAnim,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                branding.primaryColor.withOpacity(0.08),
                theme.scaffoldBackgroundColor,
              ],
            ),
          ),
          child: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 60),

                  // Logo + Title
                  _buildHeader(theme, branding),

                  const SizedBox(height: 48),

                  // Animated step switcher
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    transitionBuilder: (child, anim) => SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0.1, 0),
                        end: Offset.zero,
                      ).animate(anim),
                      child: FadeTransition(opacity: anim, child: child),
                    ),
                    child: state.step == LoginStep.emailInput
                        ? _EmailStep(key: const ValueKey('email'))
                        : _OtpStep(key: const ValueKey('otp')),
                  ),

                  // Error message
                  if (state.error != null) ...[
                    const SizedBox(height: 16),
                    _ErrorCard(message: state.error!),
                  ],

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(ThemeData theme, CollegeBranding branding) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Dynamic college logo or default
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [branding.primaryColor, branding.secondaryColor],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: branding.primaryColor.withOpacity(0.3),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: const Center(
            child: Text('🎓', style: TextStyle(fontSize: 30)),
          ),
        ),
        const SizedBox(height: 24),
        Text(
          AppConstants.appName,
          style: theme.textTheme.headlineMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Connect with verified students\nfrom your college only.',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.5,
          ),
        ),
      ],
    );
  }
}

// ─── Email Step Widget ────────────────────────────────────────────────────────

class _EmailStep extends ConsumerStatefulWidget {
  const _EmailStep({super.key});

  @override
  ConsumerState<_EmailStep> createState() => _EmailStepState();
}

class _EmailStepState extends ConsumerState<_EmailStep> {
  final _emailCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  String? _validateEmail(String? value) {
    if (value == null || value.isEmpty) return 'Please enter your college email';
    if (!value.contains('@')) return 'Please enter a valid email address';
    final domain = value.split('@').last.toLowerCase();
    final isValidDomain = AppConstants.validDomainSuffixes.any((s) => domain.endsWith(s));
    if (!isValidDomain) return 'Please use your official college email (.edu / .ac.in)';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(loginProvider);
    final notifier = ref.read(loginProvider.notifier);
    final theme = Theme.of(context);

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Sign In',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            'Enter your college email to receive a verification code.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 24),

          // Email input
          TextFormField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autocorrect: false,
            validator: _validateEmail,
            decoration: InputDecoration(
              labelText: 'College Email',
              hintText: 'yourname@jdcollege.edu.in',
              prefixIcon: const Icon(Icons.email_outlined),
              suffixIcon: _emailCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () => setState(() => _emailCtrl.clear()),
                    )
                  : null,
            ),
            onChanged: (_) => setState(() {}),
            onFieldSubmitted: (_) => _submit(),
          ),

          const SizedBox(height: 20),

          // Consent checkbox
          InkWell(
            onTap: () => notifier.setConsent(!state.consentGiven),
            borderRadius: BorderRadius.circular(8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Checkbox(
                  value: state.consentGiven,
                  onChanged: (v) => notifier.setConsent(v ?? false),
                  activeColor: theme.colorScheme.primary,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text.rich(
                      TextSpan(
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        children: [
                          const TextSpan(text: 'I agree to the '),
                          TextSpan(
                            text: 'Terms of Service',
                            style: TextStyle(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const TextSpan(text: ' and '),
                          TextSpan(
                            text: 'Privacy Policy',
                            style: TextStyle(
                              color: theme.colorScheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const TextSpan(text: '. I am 18+ years old.'),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Submit button
          SizedBox(
            width: double.infinity,
            height: 52,
            child: ElevatedButton(
              onPressed: state.isLoading ? null : _submit,
              child: state.isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Continue', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  void _submit() {
    if (_formKey.currentState?.validate() != true) return;
    ref.read(loginProvider.notifier).sendOtp(_emailCtrl.text);
  }
}

// ─── OTP Step Widget ──────────────────────────────────────────────────────────

class _OtpStep extends ConsumerStatefulWidget {
  const _OtpStep({super.key});

  @override
  ConsumerState<_OtpStep> createState() => _OtpStepState();
}

class _OtpStepState extends ConsumerState<_OtpStep> {
  final _controllers = List.generate(6, (_) => TextEditingController());
  final _focuses = List.generate(6, (_) => FocusNode());

  @override
  void dispose() {
    for (final c in _controllers) c.dispose();
    for (final f in _focuses) f.dispose();
    super.dispose();
  }

  String get _otp => _controllers.map((c) => c.text).join();

  void _onDigitChanged(String value, int index) {
    if (value.length > 1) {
      // Handle paste
      final digits = value.replaceAll(RegExp(r'\D'), '').substring(0, value.length.clamp(0, 6));
      for (int i = 0; i < digits.length && i + index < 6; i++) {
        _controllers[index + i].text = digits[i];
      }
      final nextIndex = (index + digits.length).clamp(0, 5);
      _focuses[nextIndex].requestFocus();
    } else {
      if (value.isNotEmpty && index < 5) {
        _focuses[index + 1].requestFocus();
      }
    }

    if (_otp.length == 6) _submitOtp();
    setState(() {});
  }

  void _onKeyEvent(RawKeyEvent event, int index) {
    if (event is RawKeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace &&
        _controllers[index].text.isEmpty &&
        index > 0) {
      _focuses[index - 1].requestFocus();
    }
  }

  Future<void> _submitOtp() async {
    if (_otp.length != 6) return;
    final hasProfile = await ref.read(loginProvider.notifier).verifyOtp(_otp);
    if (!mounted || ref.read(loginProvider).error != null) return;
    context.go(hasProfile ? '/home' : '/profile-setup');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(loginProvider);
    final notifier = ref.read(loginProvider.notifier);
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Back button
        TextButton.icon(
          onPressed: notifier.goBackToEmail,
          icon: const Icon(Icons.arrow_back, size: 18),
          label: const Text('Change Email'),
          style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            foregroundColor: theme.colorScheme.primary,
          ),
        ),

        const SizedBox(height: 16),

        Text('Enter OTP', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(
          'We sent a 6-digit code to\n${state.maskedEmail}',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
            height: 1.5,
          ),
        ),

        if (state.collegeName != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.school_outlined, size: 16, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  state.collegeName!,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onPrimaryContainer,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 32),

        // OTP Boxes
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(6, (i) => _OtpBox(
            controller: _controllers[i],
            focusNode: _focuses[i],
            onChanged: (v) => _onDigitChanged(v, i),
            onKeyEvent: (e) => _onKeyEvent(e, i),
            theme: theme,
          )),
        ),

        const SizedBox(height: 32),

        // Submit button
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: state.isLoading || _otp.length != 6 ? null : _submitOtp,
            child: state.isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Verify', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          ),
        ),

        const SizedBox(height: 20),

        // Resend
        Center(
          child: state.resendCooldown > 0
              ? Text(
                  'Resend OTP in ${state.resendCooldown}s',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                )
              : TextButton(
                  onPressed: () => notifier.sendOtp(state.email),
                  child: const Text('Resend OTP'),
                ),
        ),
      ],
    );
  }
}

class _OtpBox extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final void Function(String) onChanged;
  final void Function(RawKeyEvent) onKeyEvent;
  final ThemeData theme;

  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.onKeyEvent,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 56,
      child: RawKeyboardListener(
        focusNode: FocusNode(),
        onKey: onKeyEvent,
        child: TextFormField(
          controller: controller,
          focusNode: focusNode,
          textAlign: TextAlign.center,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(1),
          ],
          style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            counterText: '',
            filled: true,
            fillColor: focusNode.hasFocus
                ? theme.colorScheme.primaryContainer
                : theme.colorScheme.surfaceVariant.withOpacity(0.5),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: focusNode.hasFocus ? theme.colorScheme.primary : Colors.transparent,
                width: 2,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: theme.colorScheme.primary, width: 2),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(
                color: controller.text.isNotEmpty
                    ? theme.colorScheme.primary
                    : theme.colorScheme.outline.withOpacity(0.3),
              ),
            ),
            contentPadding: EdgeInsets.zero,
          ),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

// ─── Error Card ───────────────────────────────────────────────────────────────
class _ErrorCard extends StatelessWidget {
  final String message;
  const _ErrorCard({required this.message});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: theme.colorScheme.error.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: theme.colorScheme.error, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onErrorContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
