import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:timeago/timeago.dart' as timeago;
import '../../../core/theme/app_theme.dart';

// ─── Model ────────────────────────────────────────────────────────────────────

class MatchPreview {
  final String matchId;
  final String otherUserId;
  final String otherUserName;
  final String? otherUserPhoto;
  final String? lastMessagePreview;
  final DateTime? lastMessageAt;
  final int unreadCount;

  const MatchPreview({
    required this.matchId,
    required this.otherUserId,
    required this.otherUserName,
    this.otherUserPhoto,
    this.lastMessagePreview,
    this.lastMessageAt,
    this.unreadCount = 0,
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

// Stream provider that listens to the user's matches in real-time
final matchesStreamProvider = StreamProvider.family<List<MatchPreview>, String>((ref, uid) {
  return FirebaseFirestore.instance
      .collection('matches')
      .where('status', isEqualTo: 'active')
      .orderBy('last_message_at', descending: true)
      .snapshots()
      .map((snap) {
    return snap.docs
        .where((d) => d['student_a_id'] == uid || d['student_b_id'] == uid)
        .map((d) {
          final data = d.data();
          final otherUserId = data['student_a_id'] == uid
              ? data['student_b_id'] as String
              : data['student_a_id'] as String;

          return MatchPreview(
            matchId: d.id,
            otherUserId: otherUserId,
            otherUserName: 'Loading…',
            lastMessagePreview: data['last_message_preview'] as String?,
            lastMessageAt: (data['last_message_at'] as Timestamp?)?.toDate(),
            unreadCount: (data['unread_count_$uid'] as int?) ?? 0,
          );
        })
        .toList();
  });
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class MatchesScreen extends ConsumerWidget {
  final String currentUserId;
  const MatchesScreen({super.key, required this.currentUserId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matchesAsync = ref.watch(matchesStreamProvider(currentUserId));
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
              child: Text(
                'Matches',
                style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),

            // Match list
            Expanded(
              child: matchesAsync.when(
                loading: () => ListView.builder(
                  itemCount: 5,
                  itemBuilder: (_, i) => _MatchTileShimmer(),
                ),
                error: (e, _) => Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
                      const SizedBox(height: 12),
                      const Text('Failed to load matches'),
                    ],
                  ),
                ),
                data: (matches) {
                  if (matches.isEmpty) return const _EmptyMatchesState();
                  return ListView.builder(
                    itemCount: matches.length,
                    itemBuilder: (ctx, i) => _MatchTile(match: matches[i]),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Match Tile ───────────────────────────────────────────────────────────────

class _MatchTile extends StatelessWidget {
  final MatchPreview match;
  const _MatchTile({required this.match});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasUnread = match.unreadCount > 0;
    final branding = ref_watch_branding(context);

    return InkWell(
      onTap: () => context.push('/chat?match_id=${match.matchId}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Avatar
            Stack(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: theme.colorScheme.primaryContainer,
                  backgroundImage: match.otherUserPhoto != null
                      ? CachedNetworkImageProvider(match.otherUserPhoto!)
                      : null,
                  child: match.otherUserPhoto == null
                      ? Text(
                          match.otherUserName.isNotEmpty ? match.otherUserName[0] : '?',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: theme.colorScheme.onPrimaryContainer,
                          ),
                        )
                      : null,
                ),
                // Online indicator placeholder
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    width: 14,
                    height: 14,
                    decoration: BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                      border: Border.all(color: theme.scaffoldBackgroundColor, width: 2),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(width: 14),

            // Name + preview
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          match.otherUserName,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: hasUnread ? FontWeight.w700 : FontWeight.w500,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (match.lastMessageAt != null)
                        Text(
                          timeago.format(match.lastMessageAt!),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: hasUnread
                                ? theme.colorScheme.primary
                                : theme.colorScheme.onSurfaceVariant,
                            fontWeight: hasUnread ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          match.lastMessagePreview ?? 'Say hello! 👋',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: hasUnread
                                ? theme.colorScheme.onSurface
                                : theme.colorScheme.onSurfaceVariant,
                            fontWeight: hasUnread ? FontWeight.w600 : FontWeight.normal,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (hasUnread)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            '${match.unreadCount}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Helper to access branding from context (without provider access in StatelessWidget)
CollegeBranding ref_watch_branding(BuildContext context) {
  return CollegeBranding.defaultBranding;
}

// ─── Shimmer Tile ─────────────────────────────────────────────────────────────

class _MatchTileShimmer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final shimmerColor = theme.colorScheme.surfaceVariant.withOpacity(0.7);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(width: 56, height: 56, decoration: BoxDecoration(color: shimmerColor, shape: BoxShape.circle)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 14, width: 120, decoration: BoxDecoration(color: shimmerColor, borderRadius: BorderRadius.circular(4))),
                const SizedBox(height: 8),
                Container(height: 12, decoration: BoxDecoration(color: shimmerColor, borderRadius: BorderRadius.circular(4))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Empty State ──────────────────────────────────────────────────────────────

class _EmptyMatchesState extends StatelessWidget {
  const _EmptyMatchesState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('💌', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 20),
            Text('No matches yet', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text(
              'When someone accepts your connection request, they\'ll appear here.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              icon: const Icon(Icons.explore_outlined),
              label: const Text('Discover People'),
              onPressed: () => context.go('/home'),
            ),
          ],
        ),
      ),
    );
  }
}
