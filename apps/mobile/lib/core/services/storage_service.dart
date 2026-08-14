import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:firebase_storage/firebase_storage.dart';
import '../constants/app_constants.dart';

/// Handles photo selection, cropping, compression, and Firebase Storage upload.
class StorageService {
  static final _picker = ImagePicker();

  /// Picks an image from camera or gallery, crops it, and returns the File.
  static Future<File?> pickAndCropImage({
    required ImageSource source,
    double? aspectRatioX,
    double? aspectRatioY,
  }) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: AppConstants.imageQuality,
      maxWidth: AppConstants.maxImageWidthPx,
      maxHeight: AppConstants.maxImageHeightPx,
    );

    if (picked == null) return null;

    final cropped = await ImageCropper().cropImage(
      sourcePath: picked.path,
      aspectRatio: aspectRatioX != null && aspectRatioY != null
          ? CropAspectRatio(ratioX: aspectRatioX, ratioY: aspectRatioY)
          : null,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Crop Photo',
          toolbarColor: const Color(0xFF6C63FF),
          toolbarWidgetColor: Colors.white,
          initAspectRatio: CropAspectRatioPreset.ratio3x4,
          lockAspectRatio: false,
          hideBottomControls: false,
        ),
        IOSUiSettings(
          title: 'Crop Photo',
          aspectRatioLockEnabled: false,
          resetButtonHidden: false,
        ),
      ],
    );

    if (cropped == null) return null;
    return File(cropped.path);
  }

  /// Shows a bottom sheet to choose between camera and gallery.
  static Future<File?> pickImageWithSourceDialog(BuildContext context) async {
    ImageSource? source;

    await showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take Photo'),
              onTap: () {
                source = ImageSource.camera;
                Navigator.pop(ctx);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from Gallery'),
              onTap: () {
                source = ImageSource.gallery;
                Navigator.pop(ctx);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (source == null) return null;
    return pickAndCropImage(source: source!);
  }

  /// Uploads a file to Cloud Storage and returns its **storage path**.
  ///
  /// Storage rules require specific custom metadata on every upload, and reject
  /// the write without it. The previous implementation sent only
  /// `uploaded_at`, so *every* mobile upload (verification photos, profile
  /// photos and chat media alike) was denied. Use the purpose-specific helpers
  /// below rather than calling this directly.
  ///
  /// The path is returned rather than a download URL because the backend accepts
  /// Storage paths (which it re-verifies for ownership) and never free-form URLs.
  static Future<String> uploadFile({
    required File file,
    required String storagePath,
    required Map<String, String> customMetadata,
    void Function(double progress)? onProgress,
  }) async {
    final reference = FirebaseStorage.instance.ref(storagePath);
    final metadata = SettableMetadata(
      contentType: _getMimeType(file.path),
      customMetadata: customMetadata,
    );

    final uploadTask = reference.putFile(file, metadata);

    StreamSubscription<TaskSnapshot>? progressSubscription;
    if (onProgress != null) {
      progressSubscription = uploadTask.snapshotEvents.listen((snapshot) {
        if (snapshot.totalBytes > 0) {
          onProgress(snapshot.bytesTransferred / snapshot.totalBytes);
        }
      });
    }

    try {
      await uploadTask;
    } finally {
      // Without this the subscription leaks for the lifetime of the isolate.
      await progressSubscription?.cancel();
    }

    return storagePath;
  }

  /// Uploads private verification evidence.
  /// Storage rules require `ownerId` to equal the caller's UID.
  static Future<String> uploadVerificationPhoto({
    required File file,
    void Function(double progress)? onProgress,
  }) async {
    final uid = _requireUid();
    _requireImage(file, maxBytes: 8 * 1024 * 1024);

    return uploadFile(
      file: file,
      storagePath: 'verification_photos/$uid/${_fileName(file)}',
      customMetadata: {'ownerId': uid},
      onProgress: onProgress,
    );
  }

  /// Uploads a profile photo. Commit the returned paths with
  /// `FirebaseService.updateProfilePhotos` to make them visible.
  static Future<String> uploadProfilePhoto({
    required File file,
    void Function(double progress)? onProgress,
  }) async {
    final uid = _requireUid();
    _requireImage(file, maxBytes: 8 * 1024 * 1024);

    return uploadFile(
      file: file,
      storagePath: 'profile_photos/$uid/${_fileName(file)}',
      customMetadata: {'ownerId': uid},
      onProgress: onProgress,
    );
  }

  /// Uploads a chat attachment.
  /// Storage rules require both `uploader_id` and `match_id`.
  static Future<String> uploadChatMedia({
    required File file,
    required String matchId,
    void Function(double progress)? onProgress,
  }) async {
    final uid = _requireUid();
    final contentType = _getMimeType(file.path);
    if (!_allowedChatTypes.contains(contentType)) {
      throw StateError('Attachments must be a JPEG, PNG, WebP or MP4 file.');
    }
    if (await file.length() > AppConstants.maxMediaSizeMb * 1024 * 1024) {
      throw StateError('Attachments must be under ${AppConstants.maxMediaSizeMb} MB.');
    }

    return uploadFile(
      file: file,
      storagePath: 'chat_media/$matchId/${_fileName(file)}',
      customMetadata: {'uploader_id': uid, 'match_id': matchId},
      onProgress: onProgress,
    );
  }

  /// Resolves a Storage path to a temporary download URL for display.
  static Future<String> resolveUrl(String storagePath) {
    return FirebaseStorage.instance.ref(storagePath).getDownloadURL();
  }

  static const Set<String> _allowedImageTypes = {
    'image/jpeg', 'image/png', 'image/webp',
  };

  static const Set<String> _allowedChatTypes = {
    'image/jpeg', 'image/png', 'image/webp', 'video/mp4',
  };

  static String _requireUid() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null) throw StateError('You must be signed in to upload files.');
    return uid;
  }

  static void _requireImage(File file, {required int maxBytes}) {
    if (!_allowedImageTypes.contains(_getMimeType(file.path))) {
      throw StateError('Choose a JPEG, PNG or WebP image.');
    }
    if (file.lengthSync() > maxBytes) {
      throw StateError('Images must be under ${maxBytes ~/ (1024 * 1024)} MB.');
    }
  }

  /// Unguessable file name that preserves the original extension.
  static String _fileName(File file) {
    final extension = file.path.split('.').last.toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]'), '');
    final suffix = extension.isEmpty ? 'bin' : extension;
    final random = Random.secure().nextInt(1 << 32).toRadixString(16);
    return '${DateTime.now().microsecondsSinceEpoch}_$random.$suffix';
  }

  static String _getMimeType(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }
}

// Riverpod provider — StorageService is a static utility, so the provider
// exposes the type rather than an instance.
final storageServiceProvider = Provider<Type>((_) => StorageService);
