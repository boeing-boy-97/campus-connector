import 'dart:io';
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

  /// Uploads a file to Firebase Storage and returns the download URL.
  /// Shows upload progress via a callback.
  static Future<String> uploadFile({
    required File file,
    required String storagePath,
    Function(double progress)? onProgress,
  }) async {
    final ref = FirebaseStorage.instance.ref(storagePath);
    final metadata = SettableMetadata(
      contentType: _getMimeType(file.path),
      customMetadata: {'uploaded_at': DateTime.now().toIso8601String()},
    );

    final uploadTask = ref.putFile(file, metadata);

    if (onProgress != null) {
      uploadTask.snapshotEvents.listen((snapshot) {
        final progress = snapshot.bytesTransferred / snapshot.totalBytes;
        onProgress(progress);
      });
    }

    await uploadTask;
    return await ref.getDownloadURL();
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

// Riverpod provider
final storageServiceProvider = Provider<StorageService>((_) => StorageService());
