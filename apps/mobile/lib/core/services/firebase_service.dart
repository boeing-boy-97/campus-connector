import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Central service for calling Firebase Cloud Functions
/// All calls go through here to ensure consistent error handling
class FirebaseService {
  static final FirebaseFunctions _functions = FirebaseFunctions.instanceFor(
    region: 'asia-south1',
  );

  static final FirebaseAuth _auth = FirebaseAuth.instance;

  // ── Auth ──────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> sendOtp(String email) async {
    final result = await _functions
        .httpsCallable('sendOtp')
        .call({'email': email});
    return Map<String, dynamic>.from(result.data);
  }

  static Future<Map<String, dynamic>> verifyOtp(String email, String otp) async {
    final result = await _functions
        .httpsCallable('verifyOtp')
        .call({'email': email, 'otp': otp});
    final data = Map<String, dynamic>.from(result.data);

    // Sign in with the custom token returned by verifyOtp
    if (data['success'] == true && data['data']?['custom_token'] != null) {
      await _auth.signInWithCustomToken(data['data']['custom_token'] as String);
    }
    return data;
  }

  static Future<Map<String, dynamic>> login() async {
    final result = await _functions.httpsCallable('login').call();
    return Map<String, dynamic>.from(result.data);
  }

  static Future<void> signOut() async {
    await _auth.signOut();
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> createProfile(Map<String, dynamic> profileData) async {
    final result = await _functions
        .httpsCallable('createProfile')
        .call(profileData);
    return Map<String, dynamic>.from(result.data);
  }

  static Future<Map<String, dynamic>> updateProfile(Map<String, dynamic> updates) async {
    final result = await _functions
        .httpsCallable('updateProfile')
        .call(updates);
    return Map<String, dynamic>.from(result.data);
  }

  static Future<Map<String, dynamic>> getProfile({String? studentId}) async {
    final result = await _functions
        .httpsCallable('getProfile')
        .call(studentId != null ? {'student_id': studentId} : {});
    return Map<String, dynamic>.from(result.data);
  }

  static Future<Map<String, dynamic>> deleteAccount() async {
    final result = await _functions.httpsCallable('deleteAccount').call();
    return Map<String, dynamic>.from(result.data);
  }

  static Future<void> submitVerificationPhoto(String storagePath) async {
    await _functions.httpsCallable('submitVerificationPhoto').call({
      'storage_path': storagePath,
    });
  }

  // ── College ────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> checkEmailDomain(String email) async {
    final result = await _functions
        .httpsCallable('checkEmailDomain')
        .call({'email': email});
    return Map<String, dynamic>.from(result.data);
  }

  static Future<Map<String, dynamic>> getCollegeBranding() async {
    final result = await _functions.httpsCallable('getCollegeBranding').call();
    return Map<String, dynamic>.from(result.data);
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> getRecommendations({
    String? genderFilter,
    int? yearFilter,
    String? matchType,
    int pageSize = 20,
    String? lastDocId,
  }) async {
    final result = await _functions
        .httpsCallable('getRecommendations')
        .call({
      if (genderFilter != null) 'gender_filter': genderFilter,
      if (yearFilter != null) 'year_filter': yearFilter,
      if (matchType != null) 'match_type': matchType,
      'page_size': pageSize,
      if (lastDocId != null) 'last_doc_id': lastDocId,
    });
    return Map<String, dynamic>.from(result.data);
  }

  // ── Matching ───────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> sendConnectRequest({
    required String toId,
    required String matchType,
    String? message,
  }) async {
    final result = await _functions
        .httpsCallable('sendConnectRequest')
        .call({
      'to_id': toId,
      'match_type': matchType,
      if (message != null) 'message': message,
    });
    return Map<String, dynamic>.from(result.data);
  }

  static Future<Map<String, dynamic>> acceptConnectRequest({
    required String requestId,
    required String action,
  }) async {
    final result = await _functions
        .httpsCallable('acceptConnectRequest')
        .call({'request_id': requestId, 'action': action});
    return Map<String, dynamic>.from(result.data);
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  static Future<Map<String, dynamic>> sendMessage({
    required String matchId,
    String? text,
    String? mediaPath,
  }) async {
    final result = await _functions
        .httpsCallable('sendMessage')
        .call({
      'match_id': matchId,
      if (text != null) 'text': text,
      if (mediaPath != null) 'media_path': mediaPath,
    });
    return Map<String, dynamic>.from(result.data);
  }

  static Future<void> markMessagesRead(String matchId) async {
    await _functions
        .httpsCallable('markMessagesRead')
        .call({'match_id': matchId});
  }

  // ── Moderation ─────────────────────────────────────────────────────────────

  static Future<void> reportUser({
    required String reportedId,
    required String reason,
    String? description,
  }) async {
    await _functions
        .httpsCallable('reportUser')
        .call({
      'reported_id': reportedId,
      'reason': reason,
      if (description != null) 'description': description,
    });
  }

  static Future<void> blockUser(String blockedId) async {
    await _functions
        .httpsCallable('blockUser')
        .call({'blocked_id': blockedId});
  }
}

// Riverpod provider
final firebaseServiceProvider = Provider<FirebaseService>((_) => FirebaseService());
