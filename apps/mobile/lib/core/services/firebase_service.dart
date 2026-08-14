import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_constants.dart';

/// Central gateway for every Cloud Function call.
///
/// Each wrapper sends exactly the payload the deployed callable validates with
/// Zod. Several of these previously sent an incomplete body (or called a
/// function name that does not exist), which made the corresponding feature fail
/// 100% of the time on mobile:
///
///  * `sendOtp` omitted `consent_given`, which the schema requires to be `true`
///    — so mobile sign-up could never succeed.
///  * `markMessagesRead` called a non-existent `markMessagesRead`; the deployed
///    callable is `markRead`.
///  * `getCollegeBranding` was called with no arguments although `college_id`
///    is required.
///  * `deleteAccount` was called with no arguments although the schema requires
///    `confirmation: "DELETE MY ACCOUNT"`.
///  * `reportUser` omitted the required `category`.
class FirebaseService {
  FirebaseService._();

  static final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: AppConstants.functionsRegion,
  );

  static final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Consent version recorded against the account at signup.
  static const String consentVersion = '1.0.0';

  /// Exact confirmation phrase the `deleteAccount` schema requires.
  static const String deleteConfirmation = 'DELETE MY ACCOUNT';

  /// Unwraps the `{ success, data }` envelope every callable returns.
  static Map<String, dynamic> _unwrap(HttpsCallableResult result) {
    final envelope = Map<String, dynamic>.from(result.data as Map);
    if (envelope['success'] != true) {
      throw FirebaseFunctionsException(
        code: 'internal',
        message: 'The server returned an unexpected response.',
      );
    }
    final data = envelope['data'];
    return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
  }

  static Future<Map<String, dynamic>> _call(
    String name,
    Map<String, dynamic> payload,
  ) async {
    final callable = _functions.httpsCallable(
      name,
      options: HttpsCallableOptions(timeout: const Duration(seconds: 60)),
    );
    return _unwrap(await callable.call(payload));
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /// Requests a one-time passcode. Consent is mandatory server-side.
  static Future<Map<String, dynamic>> sendOtp(
    String email, {
    bool consentGiven = true,
  }) {
    return _call('sendOtp', {
      'email': email.trim().toLowerCase(),
      'consent_given': consentGiven,
      'consent_version': consentVersion,
    });
  }

  /// Verifies the passcode and signs in with the returned custom token.
  static Future<Map<String, dynamic>> verifyOtp(String email, String otp) async {
    final data = await _call('verifyOtp', {
      'email': email.trim().toLowerCase(),
      'otp': otp,
    });

    final token = data['custom_token'];
    if (token is String && token.isNotEmpty) {
      await _auth.signInWithCustomToken(token);
      // Ensure the fresh custom claims (college_id, verification_status) are
      // present before any verified-only call is attempted.
      await _auth.currentUser?.getIdToken(true);
    }

    return data;
  }

  /// Records presence and returns college branding for the session.
  static Future<Map<String, dynamic>> login() => _call('login', const {});

  static Future<void> signOut() => _auth.signOut();

  // ── Profile ───────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> createProfile(
    Map<String, dynamic> profileData,
  ) {
    return _call('createProfile', {
      ...profileData,
      'consent_given': true,
      'consent_version': consentVersion,
    });
  }

  static Future<Map<String, dynamic>> updateProfile(
    Map<String, dynamic> updates,
  ) {
    return _call('updateProfile', updates);
  }

  /// Fetches the caller's own profile, or a peer's public profile.
  static Future<Map<String, dynamic>> getProfile({String? studentId}) {
    return _call('getProfile', {
      if (studentId != null) 'student_id': studentId,
    });
  }

  /// Commits the ordered list of uploaded profile photo Storage paths.
  static Future<Map<String, dynamic>> updateProfilePhotos(
    List<String> storagePaths,
  ) {
    return _call('updateProfilePhotos', {'storage_paths': storagePaths});
  }

  /// Deletes the account. The confirmation phrase is validated server-side.
  static Future<Map<String, dynamic>> deleteAccount({
    String? reason,
    String? feedback,
  }) {
    return _call('deleteAccount', {
      'confirmation': deleteConfirmation,
      if (reason != null) 'reason': reason,
      if (feedback != null && feedback.trim().isNotEmpty) 'feedback': feedback.trim(),
    });
  }

  static Future<Map<String, dynamic>> submitVerificationPhoto(String storagePath) {
    return _call('submitVerificationPhoto', {'storage_path': storagePath});
  }

  // ── College ───────────────────────────────────────────────────────────────

  /// Looks up whether an e-mail domain belongs to an approved college.
  static Future<Map<String, dynamic>> checkEmailDomain(String email) {
    return _call('checkEmailDomain', {'email': email.trim().toLowerCase()});
  }

  /// Branding for a specific college. `collegeId` is required by the schema.
  static Future<Map<String, dynamic>> getCollegeBranding(String collegeId) {
    return _call('getCollegeBranding', {'college_id': collegeId});
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getRecommendations({
    String? genderFilter,
    int? yearFilter,
    String? matchType,
    int pageSize = AppConstants.discoveryPageSize,
    String? lastDocId,
  }) {
    return _call('getRecommendations', {
      if (genderFilter != null) 'gender_filter': genderFilter,
      if (yearFilter != null) 'year_filter': yearFilter,
      if (matchType != null) 'match_type': matchType,
      'page_size': pageSize,
      if (lastDocId != null) 'last_doc_id': lastDocId,
    });
  }

  // ── Matching ──────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> sendConnectRequest({
    required String toId,
    required String matchType,
    String? message,
  }) {
    return _call('sendConnectRequest', {
      'to_id': toId,
      'match_type': matchType,
      if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
    });
  }

  static Future<Map<String, dynamic>> acceptConnectRequest({
    required String requestId,
    required String action,
  }) {
    return _call('acceptConnectRequest', {
      'request_id': requestId,
      'action': action,
    });
  }

  static Future<void> unmatch(String matchId) async {
    await _call('unmatch', {'match_id': matchId});
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> sendMessage({
    required String matchId,
    String? text,
    String? mediaPath,
  }) {
    return _call('sendMessage', {
      'match_id': matchId,
      if (text != null && text.trim().isNotEmpty) 'text': text.trim(),
      if (mediaPath != null) 'media_path': mediaPath,
    });
  }

  /// Marks the peer's messages as read. The deployed callable is `markRead`.
  static Future<void> markMessagesRead(String matchId) async {
    await _call('markRead', {'match_id': matchId});
  }

  static Future<void> deleteMessage(String messageId) async {
    await _call('deleteMessage', {'message_id': messageId});
  }

  // ── Moderation ────────────────────────────────────────────────────────────

  /// Files a safety report. `category` is required by the schema.
  static Future<Map<String, dynamic>> reportUser({
    required String reportedId,
    required String category,
    required String reason,
    String? description,
  }) {
    return _call('reportUser', {
      'reported_id': reportedId,
      'category': category,
      'reason': reason,
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
    });
  }

  static Future<void> blockUser(String blockedId, {String? reason}) async {
    await _call('blockUser', {
      'blocked_id': blockedId,
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
    });
  }

  static Future<void> unblockUser(String blockedId) async {
    await _call('unblockUser', {'blocked_id': blockedId});
  }

  static Future<Map<String, dynamic>> getBlockedUsers() =>
      _call('getBlockedUsers', const {});

  // ── Notifications ─────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getNotifications({
    int pageSize = 30,
    String? lastDocId,
  }) {
    return _call('getNotifications', {
      'page_size': pageSize,
      if (lastDocId != null) 'last_doc_id': lastDocId,
    });
  }

  static Future<void> markNotificationsRead({List<String>? notificationIds}) async {
    await _call('markNotificationsRead', {
      if (notificationIds != null && notificationIds.isNotEmpty)
        'notification_ids': notificationIds,
    });
  }

  /// Registers the device FCM token against the profile.
  static Future<void> updateFcmToken(String token) async {
    await _call('updateProfile', {'fcm_token': token});
  }
}

// Riverpod provider
final firebaseServiceProvider = Provider<Type>((_) => FirebaseService);
